# Open Calendar & Holiday Data

[![Validate Data](https://github.com/dubbyding/open-calendar-data/actions/workflows/validate-schemas.yml/badge.svg)](https://github.com/dubbyding/open-calendar-data/actions/workflows/validate-schemas.yml)
[![Publish Data](https://github.com/dubbyding/open-calendar-data/actions/workflows/publish.yml/badge.svg)](https://github.com/dubbyding/open-calendar-data/actions/workflows/publish.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![License: CC BY 4.0](https://img.shields.io/badge/Data%20License-CC%20BY%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)

An open-source, schema-validated repository linking ISO 8601 (Gregorian / AD) to regional calendar systems (such as Bikram Sambat / BS) and jurisdictional public holiday datasets.

Computers and POSIX systems rely on the Gregorian calendar as an internal standard. This project maps non-Gregorian calendar systems to Gregorian dates via strict algorithmic ranges, paired with standardized holiday datasets indexed by canonical ISO dates (`YYYY-MM-DD`).

---

## Hosted Data

Every release tag (`v*`, e.g. `v1.2.0`) is validated, built, and published to GitHub Pages:

| File | URL |
| --- | --- |
| Index of all calendars | <https://dubbyding.github.io/open-calendar-data/index.json> |
| Bikram Sambat (BS) manifest | <https://dubbyding.github.io/open-calendar-data/bs.min.json> |
| BS year file (e.g. 2082) | <https://dubbyding.github.io/open-calendar-data/bs/2082.min.json> |

Each calendar publishes a manifest at `<calendar>.min.json` and one file per year at `<calendar>/<year>.min.json`. Fetch `index.json` to discover the available calendars, their mapped years, and holiday countries.

The manifest holds the calendar definition and lists every available year file with its SHA-256:

```json
{
  "calendar": { "id": "bs", "name": { "en": "Bikram Sambat" }, "...": "..." },
  "years": [
    { "year": 2081, "file": "bs/2081.min.json", "sha256": "d5fd7a3c…", "holidays": 127 },
    { "year": 2082, "file": "bs/2082.min.json", "sha256": "ef6d5298…", "holidays": 143 }
  ]
}
```

Each year file holds that year's mapping and the holidays falling in it (grouped by the holiday's `calendars.<calendar>.year`):

```json
{
  "calendar": "bs",
  "year": 2082,
  "mapping": { "calendar": "bs", "year": 2082, "ad_start_date": "2025-04-14", "month_days": [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30] },
  "holidays": { "NP": { "national": [], "regional:kathmandu-valley": [] } }
}
```

```js
const BASE = "https://dubbyding.github.io/open-calendar-data/";
const { calendar, years } = await (await fetch(BASE + "bs.min.json")).json();
const entry = years.find((y) => y.year === 2082);
const { mapping, holidays } = await (await fetch(BASE + entry.file)).json();
```

### Verifying Data

Every merge to `main` regenerates `data/sha/<calendar>/SHA256SUMS` (SHA-256 of every data file for that calendar: its definition, year mappings and holidays) and commits it back. Each release publishes the same file at `sha/<calendar>/SHA256SUMS`, plus the hash of every published file:

| File | Contents |
| --- | --- |
| [`data/sha/bs/SHA256SUMS`](data/sha/bs/SHA256SUMS) | `sha256sum` format: every BS data file |
| <https://dubbyding.github.io/open-calendar-data/sha/bs/SHA256SUMS> | Same, plus `bs.min.json` and every `bs/<year>.min.json` |
| `bs.min.json` → `years[].sha256` | Hash of each `bs/<year>.min.json` year file |
| `index.json` → `calendars[].sha256` | Hash of each `<calendar>.min.json` manifest |

```bash
# Verify a repo checkout (from the repo root)
sha256sum -c data/sha/bs/SHA256SUMS

# Verify downloaded files (keep the published paths)
curl -sO https://dubbyding.github.io/open-calendar-data/bs.min.json
curl -s --create-dirs -o bs/2082.min.json https://dubbyding.github.io/open-calendar-data/bs/2082.min.json
curl -s https://dubbyding.github.io/open-calendar-data/sha/bs/SHA256SUMS | sha256sum -c --ignore-missing
```

---

## Repository Architecture

```text
calendar-data/
├── schemas/                # JSON Schemas enforcing structure
│   ├── calendar-definition.schema.json
│   ├── year-mapping.schema.json
│   └── holidays.schema.json
├── data/
│   ├── calendars/          # Structural metadata (months, eras, weekends)
│   ├── mappings/           # Year-to-AD alignment tables
│   │   └── bs/             # Bikram Sambat year definitions
│   └── holidays/           # Public and cultural holiday lists
│   │   ├── NP/             # ISO 3166-1 alpha-2 (Nepal)
│   └── sha/                # Generated SHA256SUMS per calendar (CI-maintained)
├── scripts/                # Validation and build scripts
└── dist/                   # Compiled, bundled JSON distributions
```

---

## Core Principles

1. **Gregorian Canonical Key:** All holiday entries and year ranges link back to an ISO 8601 date string (`YYYY-MM-DD`).
2. **Schema-First:** Every JSON file in `data/` must strictly pass its corresponding schema in `schemas/`.
3. **Decoupled Mechanics:** Calendar arithmetic (month lengths, leap adjustments) is kept separate from public holidays (government-declared observances).

---

## Installation & Local Development

### Prerequisites

- Node.js (>= 20.x)
- npm or pnpm

### Setup

```bash
# Clone the repository
git clone https://github.com/dubbyding/open-calendar-data.git
cd open-calendar-data

# Install development dependencies
npm install
```

### Validate Datasets

Runs JSON Schema validation across all mappings and holiday registries using `ajv`:

```bash
npm run test:validate
```

### Build Distribution Files

Bundles each calendar's definition, year mappings, and holidays into `dist/<calendar>.min.json`, plus a `dist/index.json` manifest:

```bash
npm run build
```

---

## Data Formats & Examples

### Nepal Historical Coverage

BS year mappings cover 2079–2083. Month lengths follow the [nepali-date-converter date configuration](https://github.com/subeshb1/Nepali-Date/blob/master/src/date-config.ts). Nepal holiday registries live under `data/holidays/NP`; each event has one or more `tags` (`religious`, `government`, `regional`, or `other`). The included holiday data is not an exhaustive record of every local authority's notices; verify closure classifications against the relevant Nepal Gazette before treating it as authoritative.

The BS calendar uses ISO weekday numbering. Its standard weekend is Saturday (`standard_weekend: [6]`); Sunday (`7`) is the first day of the week and is normally a working day in Nepal. The government and most private offices generally close on Saturdays.

### Bikram Sambat Year Mapping (`data/mappings/bs/2082.json`)

```json
{
  "calendar": "bs",
  "year": 2082,
  "ad_start_date": "2025-04-14",
  "month_days": [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30]
}
```

### Holiday Registry (`data/holidays/NP/national/2026.json`)

```json
{
  "country": "NP",
  "year_ad": 2026,
  "jurisdiction": "national",
  "holidays": [
    {
      "id": "np-new-year-2083",
      "ad_date": "2026-04-14",
      "name": {
        "en": "Nepali New Year",
        "ne": "नयाँ वर्ष"
      },
      "type": "public_holiday",
      "calendars": {
        "bs": {
          "year": 2083,
          "month": 1,
          "day": 1
        }
      },
      "is_recurring": true,
      "recurrence_rule": "calendar:bs;freq=yearly;month=1;day=1"
    }
  ]
}
```

---

## Contributing

Contributions for new calendar systems, missing year mappings, and verified public holiday gazettes are welcome.

1. Fork the repository and create a feature branch (`git checkout -b data/np-holidays-2084`).
2. Add or update files in the relevant `data/` subdirectory.
3. Validate locally:
   ```bash
   npm run test:validate
   ```
4. Submit a Pull Request. CI will run automated schema checks against all altered files.

---

## Licensing

This project utilizes a dual-licensing structure to allow broad software integration while keeping data open:

- **Source Code & Tooling:** All scripts, validators, and schema definitions are licensed under the [MIT License](LICENSE).
- **Datasets:** All JSON files located in the `data/` directory are licensed under the [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/) license.
