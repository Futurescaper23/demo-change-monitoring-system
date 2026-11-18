import assert from "node:assert/strict";
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
assert.match(appSource, /return String\(directMatch \|\| ""\)\.trim\(\);/);
assert.doesNotMatch(configSource, /"2026-10-12"\s*:\s*"https:\/\/futurescaping\.nira\.app/);

console.log("six-survey asset and Scan F viewer checks passed");
