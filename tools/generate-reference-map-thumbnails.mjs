import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharpModule = process.env.SHARP_MODULE;
if (!sharpModule) {
  throw new Error("Set SHARP_MODULE to a local Sharp installation before generating thumbnails.");
}
const sharp = require(sharpModule);
const root = path.resolve(import.meta.dirname, "..");
const pairs = [
  ["2026-07-15", ["A_vs_B", "A_vs_C", "A_vs_D", "B_vs_C", "B_vs_D", "C_vs_D"]],
  ["2026-09-10", ["A_vs_E", "B_vs_E", "C_vs_E", "D_vs_E"]],
  ["2026-10-12", ["A_vs_F", "B_vs_F", "C_vs_F", "D_vs_F", "E_vs_F"]]
];
const mapKinds = ["height_change_analysis", "gain_loss_classification"];
const sourceMaps = pairs.flatMap(([surveyDate, comparisonPairs]) => comparisonPairs.flatMap((pair) => mapKinds.map((kind) =>
  path.join("survey-data", "coastal-change-demo", surveyDate, "area8", `area8_${pair}_${kind}.png`)
)));

const availableSourceMaps = sourceMaps.filter((relativeSource) => fs.existsSync(path.join(root, relativeSource)));
const results = await Promise.all(availableSourceMaps.map(async (relativeSource) => {
  const source = path.join(root, relativeSource);
  const target = path.join(root, "assets", "reference-map-thumbnails", relativeSource).replace(/\.png$/i, ".webp");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const info = await sharp(source)
    .resize({ width: 500, withoutEnlargement: true })
    .webp({ quality: 82, smartSubsample: true })
    .toFile(target);
  return { source: relativeSource, thumbnail: path.relative(root, target), bytes: info.size, width: info.width, height: info.height };
}));

console.log(JSON.stringify({ count: results.length, skipped: sourceMaps.length - availableSourceMaps.length, bytes: results.reduce((total, item) => total + item.bytes, 0), results }, null, 2));
