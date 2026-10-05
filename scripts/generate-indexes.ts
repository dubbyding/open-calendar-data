import fs from "fs";
import path from "path";

const outputDir = path.resolve("dist");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 1. Compile all BS mappings into a single lookup dictionary
const bsMappingsDir = path.resolve("data/mappings/bs");
const bsFiles = fs.readdirSync(bsMappingsDir).filter(f => f.endsWith(".json"));
const combinedBsMappings: Record<string, unknown> = {};

for (const file of bsFiles) {
  const year = path.basename(file, ".json");
  const content = JSON.parse(fs.readFileSync(path.join(bsMappingsDir, file), "utf8"));
  combinedBsMappings[year] = content;
}

fs.writeFileSync(
  path.join(outputDir, "bs-mappings.min.json"),
  JSON.stringify(combinedBsMappings)
);

console.log("Generated dist/bs-mappings.min.json");
