import fs from "fs";
import Ajv from "ajv/dist/2020";
import path from "path";
import addFormats from "ajv-formats";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const yearMappingSchema = JSON.parse(
  fs.readFileSync(path.resolve("schemas/year-mapping.schema.json"), "utf8")
);
const calendarDefinitionSchema = JSON.parse(
  fs.readFileSync(path.resolve("schemas/calendar-definition.schema.json"), "utf8")
);
const holidaysSchema = JSON.parse(
  fs.readFileSync(path.resolve("schemas/holidays.schema.json"), "utf8")
);
const validateMapping = ajv.compile(yearMappingSchema);
const validateCalendarDefinition = ajv.compile(calendarDefinitionSchema);
const validateHolidays = ajv.compile(holidaysSchema);

function validateFiles(dir: string, validator: ReturnType<typeof ajv.compile>) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      validateFiles(fullPath, validator);
      continue;
    }
    if (!file.endsWith(".json")) continue;

    const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    const valid = validator(data);
    if (!valid) {
      console.error(`Validation failed for ${fullPath}:`, validator.errors);
      process.exit(1);
    }
  }
}

console.log("Validating Year Mappings...");
validateFiles("data/mappings", validateMapping);

console.log("Validating Calendar Definitions...");
validateFiles("data/calendars", validateCalendarDefinition);

console.log("Validating Nepal Holidays...");
validateFiles("data/holidays/NP", validateHolidays);

console.log("All files passed validation.");
