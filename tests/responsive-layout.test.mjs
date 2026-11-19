import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

const tabClickHandler = appSource.slice(
  appSource.indexOf('els.tabs.addEventListener("click"'),
  appSource.indexOf('els.backToTopBtn.addEventListener')
);
assert.match(tabClickHandler, /activateTab\(tab\.dataset\.tab\);/);
assert.match(tabClickHandler, /scrollToActiveTabPanel\(tab\.dataset\.tab\);/);

const scrollHelper = appSource.slice(
  appSource.indexOf("function scrollToActiveTabPanel"),
  appSource.indexOf("function suspendInactiveEmbeds")
);
assert.match(scrollHelper, /window\.requestAnimationFrame/);
assert.match(scrollHelper, /prefers-reduced-motion: reduce/);
assert.match(scrollHelper, /window\.scrollTo\(\{ top: targetTop, behavior \}\)/);
assert.match(scrollHelper, /state\.activeTab !== tabName/);
assert.match(scrollHelper, /window\.getComputedStyle\(els\.tabs\)\.position === "sticky"/);

const lightboxDialog = styles.slice(
  styles.indexOf(".volume-image-lightbox__dialog"),
  styles.indexOf(".volume-image-lightbox__content")
);
assert.match(lightboxDialog, /max-height: calc\(100dvh - 48px\)/);
assert.match(lightboxDialog, /overflow: hidden/);

const lightboxContent = styles.slice(
  styles.indexOf(".volume-image-lightbox__content {"),
  styles.indexOf(".volume-image-lightbox__content.has-legend")
);
assert.match(lightboxContent, /overflow-y: auto/);
assert.match(lightboxContent, /overscroll-behavior: contain/);
assert.match(styles, /\.volume-image-lightbox__compare-grid \{[^}]*grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.volume-image-lightbox__compare-grid \{ grid-template-columns:1fr; \}/);

assert.match(styles, /--hero-height: calc\(100dvh - 36px\)/);
assert.match(styles, /height: var\(--hero-height\)/);
assert.match(styles, /grid-template-columns: var\(--hero-rail-column\) minmax\(0, 1fr\)/);
assert.match(styles, /--hero-nav-height: min\(504px, calc\(var\(--hero-height\) \* 0\.64\)\)/);
assert.match(styles, /--hero-brand-left: clamp\(40px, 4\.1vw, 56px\)/);
assert.match(styles, /transform: translateX\(calc\(var\(--hero-brand-left\) - var\(--hero-copy-left\)\)\)/);
assert.match(styles, /grid-template-rows: repeat\(7, minmax\(0, 1fr\)\)/);
assert.match(styles, /width: calc\(100% - var\(--hero-rail-column\)\)/);
assert.match(styles, /object-fit: contain/);

console.log("responsive layout checks passed");
