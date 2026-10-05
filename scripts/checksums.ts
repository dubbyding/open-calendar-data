import crypto from "crypto";
import fs from "fs";
import path from "path";

// SHA-256 of every data file, grouped by calendar and written to
// data/sha/<calendar>/SHA256SUMS in `sha256sum` format. A calendar's files are:
//   data/calendars/<calendar>.json
//   data/mappings/<calendar>/**
//   data/holidays/<COUNTRY>-<CALENDAR>/**
// Paths are repo-relative, so from the repo root anyone can verify with:
//   sha256sum -c data/sha/bs/SHA256SUMS
// Hashes are over raw file bytes (.gitattributes pins LF so they match on every OS).
// CI regenerates and commits these files on every merge to main.

const DATA_DIR = path.resolve("data");
export const SHA_DIR = path.join(DATA_DIR, "sha");
export const SUMS_FILE = "SHA256SUMS";

export const sha256 = (file: string) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return entry.isFile() && entry.name !== ".DS_Store" ? [full] : [];
  });
}

export const calendarIds = () =>
  listFiles(path.join(DATA_DIR, "calendars"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.basename(file, ".json"))
    .sort();

function calendarFiles(calendar: string): string[] {
  const holidaysDir = path.join(DATA_DIR, "holidays");
  const holidayGroups = fs.existsSync(holidaysDir)
    ? fs
        .readdirSync(holidaysDir, { withFileTypes: true })
        .filter((g) => g.isDirectory() && g.name.split("-")[1]?.toLowerCase() === calendar)
        .map((g) => path.join(holidaysDir, g.name))
    : [];
  return [
    path.join(DATA_DIR, "calendars", `${calendar}.json`),
    ...listFiles(path.join(DATA_DIR, "mappings", calendar)),
    ...holidayGroups.flatMap(listFiles),
  ];
}

// Repo-relative POSIX path -> hex digest, sorted by path for a stable output.
export function calendarChecksums(calendar: string): Record<string, string> {
  const files = calendarFiles(calendar)
    .map((file) => path.relative(process.cwd(), file).split(path.sep).join("/"))
    .sort();
  return Object.fromEntries(files.map((file) => [file, sha256(file)]));
}

export const formatSums = (sums: Record<string, string>) =>
  Object.entries(sums)
    .map(([file, hash]) => `${hash}  ${file}\n`)
    .join("");

// Run directly (`npm run checksums`) rather than imported by the build.
if (path.basename(process.argv[1] ?? "", ".ts") === "checksums") {
  // Rebuild from scratch so removed calendars don't leave stale sums behind.
  fs.rmSync(SHA_DIR, { recursive: true, force: true });
  for (const calendar of calendarIds()) {
    const sums = calendarChecksums(calendar);
    const out = path.join(SHA_DIR, calendar, SUMS_FILE);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, formatSums(sums));
    console.log(`Wrote ${path.relative(process.cwd(), out)} (${Object.keys(sums).length} files)`);
  }
}
