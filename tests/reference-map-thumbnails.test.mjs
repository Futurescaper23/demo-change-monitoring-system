import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const thumbnailRoot = path.join(root, "assets", "reference-map-thumbnails", "survey-data", "coastal-change-demo");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(item) : [item];
  });
}

const thumbnails = walk(thumbnailRoot).filter((file) => file.endsWith(".webp"));
assert.equal(thumbnails.length, 28, "Every available historical and Scan 6 Area 8 reference map needs a WebP thumbnail");
assert.match(app, /function referenceMapThumbnailPath\(src\)/);
assert.match(app, /thumbnailSrc: referenceMapThumbnailPath\(src\)/);
assert.match(app, /fetchpriority="low" width="500" height="397" src="\$\{escapeAttr\(item\.thumbnailSrc \|\| item\.src\)\}"/);
assert.match(app, /state\.volumeReferenceGallerySignature/);
assert.match(app, /state\.volumeComparePickerSignature/);
assert.match(server, /"\.webp": "image\/webp"/);

for (const thumbnail of thumbnails) {
  const original = path.join(root, path.relative(path.join(root, "assets", "reference-map-thumbnails"), thumbnail))
    .replace(/\.webp$/i, ".png");
  assert.ok(fs.existsSync(original), `Thumbnail source is missing: ${original}`);
  assert.ok(fs.statSync(thumbnail).size <= 150 * 1024, `Thumbnail is unexpectedly large: ${thumbnail}`);
}

console.log("reference-map thumbnail checks passed");
