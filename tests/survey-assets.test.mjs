import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const demo = JSON.parse(fs.readFileSync(new URL("data/demo-projects.json", root), "utf8"));
const persisted = JSON.parse(fs.readFileSync(new URL("data/projects.json", root), "utf8"));
const expectedSurveys = ["2026-03-22", "2026-04-18", "2026-06-16", "2026-07-15", "2026-09-10", "2026-10-12"];

for (const dataset of [demo, persisted]) {
  assert.deepEqual(dataset.projects[0].surveys.map((survey) => survey.id), expectedSurveys);
}

for (const surveyId of expectedSurveys) {
  const base = new URL(`survey-data/coastal-change-demo/${surveyId}/area8/`, root);
  for (const fileName of ["dsm.png", "contours.png", "section_profiles.csv"]) {
    assert.equal(fs.existsSync(new URL(fileName, base)), true, `${surveyId} ${fileName} is present`);
  }
  assert.equal(
    ["ortho.jpg", "ortho.png"].some((fileName) => fs.existsSync(new URL(fileName, base))),
    true,
    `${surveyId} has an orthomosaic supported by the configured filename variants`
  );
}

const appSource = fs.readFileSync(new URL("app.js", root), "utf8");
const configSource = fs.readFileSync(new URL("src/config/projectConfig.js", root), "utf8");
assert.match(appSource, /function configuredSurveyViewerUrl\(\)/);
assert.match(appSource, /Explore 3D Survey Model/);
assert.match(appSource, /overall hosted 3D survey viewer/);
assert.match(configSource, /niraSurveyViewerUrl:\s*"https:\/\/futurescaping\.nira\.app\/a\/K9OHBWGDTW28wy8g4bD28g\/1"/);
assert.doesNotMatch(appSource, /configuredSurveyModel\(/);
assert.doesNotMatch(configSource, /"2026-10-12"\s*:\s*"https:\/\/futurescaping\.nira\.app/);

const area8TrendManifest = JSON.parse(fs.readFileSync(new URL("trend-animation/manifests/area8.json", root), "utf8"));
const eToF = area8TrendManifest.frames.find((frame) => frame.pair === "E-F");
assert.equal(area8TrendManifest.initialIndex, 4, "Area 8 trend review opens on E-to-F");
assert.equal(area8TrendManifest.frames.length, 5, "Area 8 trend review registers all five consecutive intervals");
assert.deepEqual(
  {
    label: eToF?.label,
    fromDate: eToF?.fromDate,
    toDate: eToF?.toDate,
    status: eToF?.status
  },
  {
    label: "Survey 5 → 6",
    fromDate: "2026-09-10",
    toDate: "2026-10-12",
    status: "experimental"
  }
);
assert.match(eToF.coverageNote, /unverified/i, "E-to-F remains explicitly experimental");
const framePath = new URL(eToF.image.replace(/^\//, ""), root);
assert.equal(fs.existsSync(framePath), true, "E-to-F display frame is bundled with the demo");
const frameBytes = fs.readFileSync(framePath);
assert.equal(frameBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), true, "E-to-F display frame is a PNG");
assert.equal(frameBytes.readUInt32BE(16), area8TrendManifest.grid.width, "E-to-F frame width matches the review grid");
assert.equal(frameBytes.readUInt32BE(20), area8TrendManifest.grid.height, "E-to-F frame height matches the review grid");
assert.equal(
  createHash("sha256").update(frameBytes).digest("hex"),
  eToF.sha256,
  "E-to-F display frame matches its registered source hash"
);
for (const zoneImage of eToF.zoneImages) {
  assert.equal(fs.existsSync(new URL(zoneImage.url.replace(/^\//, ""), root)), true, `${zoneImage.label} E-to-F zone image is bundled`);
}
const animationSource = fs.readFileSync(new URL("trend-animation/animation-component.mjs", root), "utf8");
for (const requiredControl of [".play", ".trend-review__timeline", ".shadow-toggle", ".shadow-mode", "@media(max-width:720px)"]) {
  assert.equal(animationSource.includes(requiredControl), true, `animation retains ${requiredControl} control or responsive rule`);
}

console.log("six-survey asset and Scan F viewer checks passed");
