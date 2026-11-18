import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const serverSource = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");

const renderAll = appSource.slice(appSource.indexOf("function renderAll()"), appSource.indexOf("function renderShellToolbar()"));
assert.match(renderAll, /renderActiveTab\(\);/);
for (const inactiveRenderer of ["renderWeather()", "renderPanorama()", "renderVolume()", "renderLayers()", "renderSections()"]) {
  assert.equal(renderAll.includes(inactiveRenderer), false, `initial render defers ${inactiveRenderer}`);
}

assert.match(appSource, /function beginTabRender\(tabName\)/);
assert.match(appSource, /function isCurrentTabRender\(render\)/);
assert.match(appSource, /function suspendInactiveEmbeds\(nextTab\)/);
assert.match(appSource, /suspendInactiveEmbeds\(safeTab\)/);
assert.match(appSource, /const render = beginTabRender\("layers"\)/);
assert.match(appSource, /const render = beginTabRender\("sections"\)/);
assert.match(appSource, /const render = beginTabRender\("volume"\)/);
assert.match(appSource, /if \(!isCurrentTabRender\(render\)\) return;/);
assert.match(appSource, /fetch\(src, \{ method: "HEAD" \}\)/);
assert.match(appSource, /needsSecondary = state\.compareMode !== "single" \|\| state\.showChangeHighlight/);
assert.match(appSource, /loading="lazy" decoding="async"/);
const layersRenderer = appSource.slice(appSource.indexOf("async function renderLayers()"), appSource.indexOf("async function renderSections()"));
assert.equal(layersRenderer.includes("prepareSectionDisplayAsset("), false, "comparison maps stay as approved source exports without canvas re-encoding");

assert.match(serverSource, /"ETag": etag/);
assert.match(serverSource, /"Cache-Control": "private, max-age=0, must-revalidate"/);
assert.match(serverSource, /request\.method === "HEAD"/);
assert.match(serverSource, /Cache-Control": "no-store"/);

console.log("performance rendering checks passed");
