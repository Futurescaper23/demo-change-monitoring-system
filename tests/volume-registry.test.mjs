import assert from "node:assert/strict";
import fs from "node:fs";

const registry = JSON.parse(fs.readFileSync(new URL("../data/volume-comparisons.json", import.meta.url), "utf8"));
const demoProjects = JSON.parse(fs.readFileSync(new URL("../data/demo-projects.json", import.meta.url), "utf8"));
const byId = Object.fromEntries(registry.comparisons.map((comparison) => [comparison.id, comparison]));
const demoProject = demoProjects.projects[0];

assert.equal(registry.schemaVersion, "1.0");
assert.deepEqual(registry.comparisons.map((comparison) => comparison.status), [
  "published", "published", "published", "published", "unavailable",
  "pending-verification", "pending-verification", "pending-verification", "pending-verification", "pending-verification"
]);
assert.equal(byId["c-d"].zones[0].netM3, 30467.44433);
assert.equal(byId["d-e"].zones[0].netM3, -22204.574344);
for (const [comparisonId, surveyId] of [["c-d", "2026-07-15"], ["d-e", "2026-09-10"]]) {
  const sourceZones = demoProject.volumeChangeComparisons[surveyId].areas.area8.polygons;
  const registryZones = byId[comparisonId].zones;
  assert.deepEqual(
    registryZones.map((zone) => [zone.gainM3, zone.lossM3, zone.netM3]),
    sourceZones.map((zone) => [zone.gainM3, zone.lossM3, zone.netM3]),
    `${comparisonId} retains the approved demo figures`
  );
}
for (const comparisonId of ["a-f", "b-f", "c-f", "d-f", "e-f"]) {
  const comparison = byId[comparisonId];
  assert.equal(comparison.status, "pending-verification", `${comparisonId} remains provisional`);
  assert.equal(comparison.evidenceType, "visual-preview", `${comparisonId} is visual-only`);
  assert.equal(Boolean(comparison.zones), false, `${comparisonId} exposes no zones`);
  assert.equal(Boolean(comparison.analysedAreaM2), false, `${comparisonId} exposes no measured area`);
  assert.equal(comparison.maps.length, 2, `${comparisonId} contains both visual maps`);
  for (const map of comparison.maps) {
    const mapPath = new URL(`..${map.src.slice(1)}`, import.meta.url);
    assert.equal(fs.existsSync(mapPath), true, `${comparisonId} map is present: ${map.src}`);
  }
}

const publicText = JSON.stringify(registry);
assert.equal(/(?:[A-Z]:\\|Internal Tools|padstow_estuary)/i.test(publicText), false);
assert.equal(byId["c-e"].status, "unavailable");
for (const comparison of registry.comparisons.filter((item) => item.status === "published")) {
  for (const map of comparison.maps || []) {
    const mapPath = new URL(`..${map.src.slice(1)}`, import.meta.url);
    assert.equal(fs.existsSync(mapPath), true, `${comparison.id} map is present: ${map.src}`);
  }
}

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
assert.match(appSource, /volumeStatusLabel\(selectedComparison\.status\)/);
assert.match(appSource, /Scan 6 maps are provisional visual evidence only/);
assert.match(appSource, /state\.volumeComparisonId = null;\s+state\.volumeZoneId = null;\s+state\.primarySurveyId = state\.surveyId/);

const pageSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
for (const retiredPanel of ["Current Workflow", "Current Interpretation", "What Is Ready", "Comparison Rollout"]) {
  assert.equal(pageSource.includes(retiredPanel), false, `${retiredPanel} is not rendered after the reference-map gallery`);
}
assert.equal(pageSource.includes('id="volumeMethod"'), false);
assert.equal(pageSource.includes('id="volumeNarrative"'), false);
assert.equal(pageSource.includes('id="volumeAreaGrid"'), false);

const serverSource = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
assert.match(serverSource, /requestPath === "\/data\/area8-trend-stats\.json"/);

console.log("volume registry checks passed");
