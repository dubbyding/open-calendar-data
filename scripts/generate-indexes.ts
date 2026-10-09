import fs from "fs";
import path from "path";
import { SUMS_FILE, calendarChecksums, formatSums, sha256 } from "./checksums";

// Builds one file per calendar year plus a per-calendar manifest:
//   dist/<calendar>/<year>.min.json
//     { calendar: "<calendar>", year, mapping: <data/mappings/<calendar>/<year>.json>,
//       holidays: { "<COUNTRY>": { "<jurisdiction>": [ ...holidays sorted by ad_date ] } } }
//   dist/<calendar>.min.json
//     { calendar: <data/calendars/<calendar>.json>,
//       years: [ { year, file: "<calendar>/<year>.min.json", sha256 }, ... ] }
// Holidays are picked up from data/holidays/<COUNTRY>-<CALENDAR>/**/*.json and assigned to the
// year in their `calendars.<calendar>.year`. A holiday for a year with no mapping fails the build.
// dist/index.json lists every calendar manifest (with its sha256) so consumers can discover them.
// dist/sha/<calendar>/SHA256SUMS mirrors data/sha/<calendar>/SHA256SUMS plus every published file's hash.

const DATA_DIR = path.resolve("data");
const OUTPUT_DIR = path.resolve("dist");

type Holiday = {
  id: string;
  ad_date: string;
  calendars?: Record<string, { year: number }>;
  [key: string]: unknown;
};
type HolidayFile = { country: string; jurisdiction: string; holidays: Holiday[] };
type HolidaysByCountry = Record<string, Record<string, Holiday[]>>;

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const posix = (file: string) => file.split(path.sep).join("/");

function listJson(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJson(full);
    return entry.name.endsWith(".json") ? [full] : [];
  });
}

function buildMappings(calendar: string) {
  const mappings = new Map<number, unknown>();
  for (const file of listJson(path.join(DATA_DIR, "mappings", calendar)).sort()) {
    mappings.set(Number(path.basename(file, ".json")), readJson(file));
  }
  return mappings;
}

// Year -> country -> jurisdiction -> holidays.
function buildHolidays(calendar: string) {
  const holidaysDir = path.join(DATA_DIR, "holidays");
  const byYear = new Map<number, HolidaysByCountry>();
  if (!fs.existsSync(holidaysDir)) return byYear;

  for (const group of fs.readdirSync(holidaysDir, { withFileTypes: true })) {
    const [, groupCalendar] = group.name.split("-");
    if (!group.isDirectory() || groupCalendar?.toLowerCase() !== calendar) continue;

    for (const file of listJson(path.join(holidaysDir, group.name))) {
      const data: HolidayFile = readJson(file);
      for (const holiday of data.holidays) {
        const year = holiday.calendars?.[calendar]?.year;
        if (year === undefined) {
          throw new Error(`${posix(path.relative(process.cwd(), file))}: holiday ${holiday.id} has no calendars.${calendar}.year`);
        }
        if (!byYear.has(year)) byYear.set(year, {});
        const byJurisdiction = (byYear.get(year)![data.country] ??= {});
        (byJurisdiction[data.jurisdiction] ??= []).push(holiday);
      }
    }
  }

  for (const byCountry of byYear.values()) {
    for (const byJurisdiction of Object.values(byCountry)) {
      for (const holidays of Object.values(byJurisdiction)) {
        holidays.sort((a, b) => a.ad_date.localeCompare(b.ad_date) || a.id.localeCompare(b.id));
      }
    }
  }
  return byYear;
}

const countHolidays = (byCountry: HolidaysByCountry = {}) =>
  Object.values(byCountry)
    .flatMap((byJurisdiction) => Object.values(byJurisdiction))
    .reduce((sum, list) => sum + list.length, 0);

fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const calendarFiles = listJson(path.join(DATA_DIR, "calendars"));
const index: Record<string, unknown>[] = [];
for (const file of calendarFiles) {
  const calendar = path.basename(file, ".json");
  const mappings = buildMappings(calendar);
  const holidays = buildHolidays(calendar);

  const unmapped = [...holidays.keys()].filter((year) => !mappings.has(year));
  if (unmapped.length) {
    throw new Error(`${calendar}: holidays exist for unmapped year(s) ${unmapped.join(", ")}`);
  }

  // Published path (relative to dist/) -> hash, for the manifest and SHA256SUMS.
  const published: Record<string, string> = {};
  const years: { year: number; file: string; sha256: string; holidays: number }[] = [];
  const countries = new Set<string>();
  let holidayTotal = 0;

  for (const [year, mapping] of mappings) {
    const yearHolidays = holidays.get(year) ?? {};
    const outFile = path.join(OUTPUT_DIR, calendar, `${year}.min.json`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify({ calendar, year, mapping, holidays: yearHolidays }));

    const name = posix(path.relative(OUTPUT_DIR, outFile));
    const hash = sha256(outFile);
    const count = countHolidays(yearHolidays);
    published[name] = hash;
    years.push({ year, file: name, sha256: hash, holidays: count });
    Object.keys(yearHolidays).forEach((country) => countries.add(country));
    holidayTotal += count;
  }

  const manifestFile = path.join(OUTPUT_DIR, `${calendar}.min.json`);
  fs.writeFileSync(manifestFile, JSON.stringify({ calendar: readJson(file), years }));
  const manifestHash = sha256(manifestFile);
  published[path.basename(manifestFile)] = manifestHash;

  // Source files keyed by repo path, published files by their path on Pages.
  const sumsFile = path.join(OUTPUT_DIR, "sha", calendar, SUMS_FILE);
  fs.mkdirSync(path.dirname(sumsFile), { recursive: true });
  fs.writeFileSync(sumsFile, formatSums({ ...calendarChecksums(calendar), ...published }));

  index.push({
    id: calendar,
    file: path.basename(manifestFile),
    sha256: manifestHash,
    checksums: posix(path.relative(OUTPUT_DIR, sumsFile)),
    years: years.map(({ year }) => year),
    countries: [...countries].sort(),
    holidays: holidayTotal,
  });
  console.log(
    `Generated ${posix(path.relative(process.cwd(), manifestFile))} + ` +
      `${years.length} year files (${holidayTotal} holidays)`
  );
}

fs.writeFileSync(
  path.join(OUTPUT_DIR, "index.json"),
  JSON.stringify({ generated_at: new Date().toISOString(), calendars: index }, null, 2)
);
console.log("Generated dist/index.json");
