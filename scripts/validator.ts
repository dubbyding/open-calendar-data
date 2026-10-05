import fs from "fs";
import Ajv from "ajv/dist/2020";
import path from "path";
import addFormats from "ajv-formats";

const DATA_DIR = path.resolve("data");
const SCHEMA_DIR = path.resolve("schemas");

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

function loadSchema(file: string) {
  return ajv.compile(JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, file), "utf8")));
}

// Each top-level dir under data/ maps to one schema. Any file nested at any depth
// inside it is validated, so new calendars / countries / regions need no changes here.
//   data/calendars/<calendar>.json
//   data/mappings/<calendar>/<year>.json
//   data/holidays/<COUNTRY>-<CALENDAR>/<jurisdiction...>/<year_ad>.json
type Rule = {
  label: string;
  validate: ReturnType<typeof ajv.compile>;
  check?: (data: any, segments: string[], name: string) => string[];
};

const calendarIds = new Set(
  fs.existsSync(path.join(DATA_DIR, "calendars"))
    ? fs
        .readdirSync(path.join(DATA_DIR, "calendars"))
        .filter((f) => f.endsWith(".json"))
        .map((f) => path.basename(f, ".json"))
    : []
);

const RULES: Record<string, Rule> = {
  calendars: {
    label: "Calendar Definitions",
    validate: loadSchema("calendar-definition.schema.json"),
    check: (data, segments, name) => {
      const errs: string[] = [];
      if (segments.length !== 0) errs.push("must live directly in data/calendars/");
      if (data.id !== name) errs.push(`id "${data.id}" does not match filename "${name}"`);
      return errs;
    },
  },
  mappings: {
    label: "Year Mappings",
    validate: loadSchema("year-mapping.schema.json"),
    check: (data, segments, name) => {
      const errs: string[] = [];
      if (segments.length !== 1) return ["expected path data/mappings/<calendar>/<year>.json"];
      const [calendar] = segments;
      if (data.calendar !== calendar)
        errs.push(`calendar "${data.calendar}" does not match folder "${calendar}"`);
      if (!calendarIds.has(calendar))
        errs.push(`no calendar definition at data/calendars/${calendar}.json`);
      if (String(data.year) !== name) errs.push(`year ${data.year} does not match filename "${name}"`);
      return errs;
    },
  },
  holidays: {
    label: "Holidays",
    validate: loadSchema("holidays.schema.json"),
    check: (data, segments, name) => {
      const errs: string[] = [];
      if (segments.length < 2)
        return ["expected path data/holidays/<COUNTRY>-<CALENDAR>/<jurisdiction...>/<year>.json"];
      const [country, calendar] = segments[0].split("-");
      if (data.country !== country)
        errs.push(`country "${data.country}" does not match folder "${segments[0]}"`);
      if (calendar && !calendarIds.has(calendar.toLowerCase()))
        errs.push(`no calendar definition at data/calendars/${calendar.toLowerCase()}.json`);
      if (String(data.year_ad) !== name)
        errs.push(`year_ad ${data.year_ad} does not match filename "${name}"`);
      return errs;
    },
  },
};

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith(".json") ? [full] : [];
  });
}

let failures = 0;
const fail = (file: string, msg: unknown) => {
  failures++;
  console.error(`  ✗ ${path.relative(process.cwd(), file)}:`, msg);
};

for (const top of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
  const topPath = path.join(DATA_DIR, top.name);
  if (!top.isDirectory()) continue;

  // data/sha/ holds generated SHA256SUMS (scripts/checksums.ts), not schema'd data.
  if (top.name === "sha") continue;

  const rule = RULES[top.name];
  if (!rule) {
    fail(topPath, `no schema registered for data/${top.name}/ (add it to RULES in scripts/validator.ts)`);
    continue;
  }

  const files = walk(topPath);
  console.log(`Validating ${rule.label} (${files.length} files)...`);

  for (const file of files) {
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      fail(file, `invalid JSON: ${(e as Error).message}`);
      continue;
    }

    if (!rule.validate(data)) {
      fail(file, rule.validate.errors);
      continue;
    }

    const segments = path.relative(topPath, path.dirname(file)).split(path.sep).filter(Boolean);
    for (const msg of rule.check?.(data, segments, path.basename(file, ".json")) ?? []) {
      fail(file, msg);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} validation error(s).`);
  process.exit(1);
}
console.log("All files passed validation.");
