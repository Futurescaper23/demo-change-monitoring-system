import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const playwrightModule = process.env.PLAYWRIGHT_CORE_MODULE;
if (!playwrightModule) throw new Error("Set PLAYWRIGHT_CORE_MODULE to a local Playwright Core installation.");
const { chromium } = require(playwrightModule);
const root = path.resolve(import.meta.dirname, "..");
const node = process.execPath;
const port = 3108;
const username = `reference-qa-${crypto.randomBytes(4).toString("hex")}`;
const password = crypto.randomBytes(24).toString("base64url");
const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fsm-reference-map-qa-"));
const reportPath = process.env.QA_REPORT_PATH || path.join(runRoot, "report.json");
const server = spawn(node, ["server.js"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    ADMIN_USERNAME: username,
    ADMIN_PASSWORD: password,
    ACCESS_USERS_PATH: path.join(runRoot, "access-users.json"),
    INVITATIONS_PATH: path.join(runRoot, "invitations.json")
  },
  stdio: ["ignore", "pipe", "pipe"]
});

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://localhost:${port}/login`, { redirect: "manual" });
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Local QA server did not start.");
}

async function login(page) {
  await page.goto(`http://localhost:${port}/login`, { waitUntil: "networkidle" });
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await Promise.all([
    page.waitForURL(`http://localhost:${port}/`),
    page.locator("button[type=submit]").click()
  ]);
}

async function openVolume(page) {
  await page.locator('[data-tab="volume"]').click();
  await page.locator("#volumeImageryGrid .volume-reference-card").first().waitFor();
}

async function scrollEveryMap(page) {
  const maps = page.locator("#volumeImageryGrid .volume-reference-stage img");
  const count = await maps.count();
  for (let index = 0; index < count; index += 1) {
    await maps.nth(index).scrollIntoViewIfNeeded();
    await maps.nth(index).evaluate((image) => new Promise((resolve) => {
      if (image.complete && image.naturalWidth > 0) return resolve();
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    }));
  }
  await page.waitForTimeout(250);
  return maps.evaluateAll((images) => images.map((image) => ({ src: image.currentSrc, complete: image.complete, width: image.naturalWidth, height: image.naturalHeight })));
}

function resources(page) {
  return page.evaluate(() => performance.getEntriesByType("resource")
    .filter((entry) => entry.name.includes("reference-map-thumbnails") || /area8_.*_(height_change_analysis|gain_loss_classification)\.png/.test(entry.name))
    .map((entry) => ({ name: entry.name, transferSize: entry.transferSize, decodedBodySize: entry.decodedBodySize, duration: entry.duration })));
}

try {
  await waitForServer();
  const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedResponses = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
  });

  await login(page);
  await openVolume(page);
  const initialGallery = await page.locator("#volumeImageryGrid .volume-reference-card").count();
  assert.equal(initialGallery, 28, "Survey Round 6 must show all 28 available Area 8 reference maps.");
  const initialSources = await page.locator("#volumeImageryGrid img").evaluateAll((images) => images.map((image) => image.getAttribute("src")));
  assert.ok(initialSources.every((src) => src?.endsWith(".webp")), "Gallery cards must use WebP thumbnails.");
  assert.ok(initialSources.every((src) => !src?.endsWith(".png")), "Gallery cards must not assign full PNG sources.");

  const coldImages = await scrollEveryMap(page);
  assert.ok(coldImages.every((image) => image.complete && image.width === 500 && image.height === 397), "All scrolled gallery thumbnails must decode at 500×397.");
  const coldResources = await resources(page);
  const coldThumbnailBytes = coldResources.filter((resource) => resource.name.includes("reference-map-thumbnails")).reduce((total, resource) => total + resource.transferSize, 0);
  assert.equal(coldResources.filter((resource) => resource.name.endsWith(".png") && resource.decodedBodySize > 0).length, 0, "No full PNG body may load before explicit inspection.");

  await page.locator(".volume-reference-group__compare").first().click();
  await page.locator("#volumeComparePickerGrid .volume-compare-picker__card").first().waitFor();
  const pickerSources = await page.locator("#volumeComparePickerGrid img").evaluateAll((images) => images.map((image) => image.getAttribute("src")));
  assert.ok(pickerSources.every((src) => src?.endsWith(".webp")), "Picker cards must use WebP thumbnails.");
  for (let index = 0; index < 4; index += 1) await page.locator("#volumeComparePickerGrid .volume-compare-picker__card").nth(index).click();
  await page.locator("#volumeComparePickerOpen").click();
  await page.locator("#volumeImageLightboxCompareGrid img").first().waitFor();
  const detailSources = await page.locator("#volumeImageLightboxCompareGrid img").evaluateAll((images) => images.map((image) => image.getAttribute("src")));
  assert.equal(detailSources.length, 4, "The full comparison must open exactly the four selected maps.");
  assert.ok(detailSources.every((src) => src?.endsWith(".png")), "Detailed comparison must load original PNG maps only on demand.");
  await page.locator("#volumeImageLightboxClose").click();

  await page.locator("#surveySelect").selectOption("2026-09-10");
  await page.waitForTimeout(200);
  await page.locator("#surveySelect").selectOption("2026-10-12");
  await page.locator("#volumeImageryGrid .volume-reference-card").first().waitFor();
  assert.equal(await page.locator("#volumeImageryGrid .volume-reference-card").count(), 28, "Returning to Survey Round 6 must restore all available gallery cards.");

  await page.screenshot({ path: path.join(runRoot, "reference-maps-1366x768.png"), fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#volumeImageryGrid .volume-reference-card").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(runRoot, "reference-maps-390x844.png"), fullPage: false });

  await page.reload({ waitUntil: "networkidle" });
  await openVolume(page);
  await scrollEveryMap(page);
  const warmResources = await resources(page);
  const warmThumbnailBytes = warmResources.filter((resource) => resource.name.includes("reference-map-thumbnails")).reduce((total, resource) => total + resource.transferSize, 0);
  const report = { runRoot, initialGallery, coldThumbnailBytes, coldRequests: coldResources.length, warmThumbnailBytes, warmRequests: warmResources.length, consoleErrors, failedResponses };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await browser.close();
} finally {
  server.kill();
}
