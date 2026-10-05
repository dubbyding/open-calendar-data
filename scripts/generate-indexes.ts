import fs from "fs";
import path from "path";

// Builds one bundle per calendar: dist/<calendar>.min.json
// {
//   calendar: <data/calendars/<calendar>.json>,
//   mappings: { "<year>": <data/mappings/<calendar>/<year>.json>, ... },
//   holidays: { "<COUNTRY>": { "<jurisdiction>": [ ...holidays sorted by ad_date ] } }
// }
// Holidays are picked up from data/holidays/<COUNTRY>-<CALENDAR>/**/<year>.json.
// dist/index.json lists every generated bundle so consumers can discover them.

const DATA_DIR = path.resolve("data");
const OUTPUT_DIR = path.resolve("dist");

type Holiday = { id: string; ad_date: string; [key: string]: unknown };
type HolidayFile = { country: string; jurisdiction: string; holidays: Holiday[] };

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));

function listJson(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJson(full);
    return entry.name.endsWith(".json") ? [full] : [];
  });
}

function buildMappings(calendar: string) {
  const files = listJson(path.join(DATA_DIR, "mappings", calendar));
  const mappings: Record<string, unknown> = {};
  for (const file of files.sort()) {
    mappings[path.basename(file, ".json")] = readJson(file);
  }
  return mappings;
}

function buildHolidays(calendar: string) {
  const holidaysDir = path.join(DATA_DIR, "holidays");
  const result: Record<string, Record<string, Holiday[]>> = {};
  if (!fs.existsSync(holidaysDir)) return result;

  for (const group of fs.readdirSync(holidaysDir, { withFileTypes: true })) {
    const [, groupCalendar] = group.name.split("-");
    if (!group.isDirectory() || groupCalendar?.toLowerCase() !== calendar) continue;

    for (const file of listJson(path.join(holidaysDir, group.name))) {
      const data: HolidayFile = readJson(file);
      const byJurisdiction = (result[data.country] ??= {});
      (byJurisdiction[data.jurisdiction] ??= []).push(...data.holidays);
    }
  }

  for (const byJurisdiction of Object.values(result)) {
    for (const holidays of Object.values(byJurisdiction)) {
      holidays.sort((a, b) => a.ad_date.localeCompare(b.ad_date) || a.id.localeCompare(b.id));
    }
  }
  return result;
}

fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const calendarFiles = listJson(path.join(DATA_DIR, "calendars"));
const index: Record<string, unknown>[] = [];
for (const file of calendarFiles) {
  const calendar = path.basename(file, ".json");
  const mappings = buildMappings(calendar);
  const holidays = buildHolidays(calendar);

  const outFile = path.join(OUTPUT_DIR, `${calendar}.min.json`);
  fs.writeFileSync(outFile, JSON.stringify({ calendar: readJson(file), mappings, holidays }));

  const holidayCount = Object.values(holidays)
    .flatMap((byJurisdiction) => Object.values(byJurisdiction))
    .reduce((sum, list) => sum + list.length, 0);
  index.push({
    id: calendar,
    file: path.basename(outFile),
    years: Object.keys(mappings).map(Number),
    countries: Object.keys(holidays),
    holidays: holidayCount,
  });
  console.log(
    `Generated ${path.relative(process.cwd(), outFile)} ` +
      `(${Object.keys(mappings).length} mappings, ${holidayCount} holidays)`
  );
}

fs.writeFileSync(
  path.join(OUTPUT_DIR, "index.json"),
  JSON.stringify({ generated_at: new Date().toISOString(), calendars: index }, null, 2)
);
console.log("Generated dist/index.json");
