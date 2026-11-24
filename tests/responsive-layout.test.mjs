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

assert.match(styles, /@media \(min-width: 721px\) and \(max-width: 1440px\)[\s\S]*\.volume-reference-group__grid,[\s\S]*\.volume-compare-picker__grid[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/);
assert.match(styles, /@media \(min-width: 721px\) and \(max-width: 1160px\)[\s\S]*\.volume-viewer-guide__grid[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(styles, /@media \(max-width: 720px\)[\s\S]*#volumeMetricGrid[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.volume-viewer-stage,[\s\S]*\.volume-viewer-frame[\s\S]*height: clamp\(480px, 72dvh, 680px\)/);
assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.stats-grid,[\s\S]*\.card-grid[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);

const embeddedViewerStyles = fs.readFileSync(new URL("../area8-change-viewer/src/viewer/style.css", import.meta.url), "utf8");
const embeddedViewerMarkup = fs.readFileSync(new URL("../area8-change-viewer/index.html", import.meta.url), "utf8");
const embeddedViewerScript = fs.readFileSync(new URL("../area8-change-viewer/src/viewer/main.js", import.meta.url), "utf8");
assert.match(embeddedViewerStyles, /@media \(max-width: 640px\)[\s\S]*\.mobile-controls-drawer[\s\S]*transform: translateX\(calc\(100% \+ 2px\)\)/);
assert.match(embeddedViewerStyles, /body\.is-embedded\.is-controls-open \.mobile-controls-drawer \{[\s\S]*transform: translateX\(0\)/);
assert.match(embeddedViewerStyles, /body\.is-embedded \.panel,[\s\S]*body\.is-embedded \.dock \{[\s\S]*position: static/);
assert.match(embeddedViewerStyles, /body\.is-embedded \.viewport-wrap #viewer \{[\s\S]*height: 100% !important/);
assert.match(embeddedViewerMarkup, /id="mobile-controls-toggle"[\s\S]*aria-controls="mobile-controls-drawer"/);
assert.match(embeddedViewerMarkup, /id="mobile-controls-drawer"/);
assert.match(embeddedViewerMarkup, /id="mobile-controls-edge-swipe"/);
assert.match(embeddedViewerScript, /mobileControlsDrawerEl\.inert = isMobileEmbed && !open/);
assert.match(embeddedViewerScript, /mobileControlsToggleEl\.inert = open/);
assert.match(embeddedViewerScript, /\(open \? mobileControlsCloseEl : mobileControlsToggleEl\)\?\.focus/);
assert.match(embeddedViewerScript, /mobileControlsEdgeSwipeEl\?\.addEventListener\('pointerdown'/);
assert.doesNotMatch(embeddedViewerScript, /canvas\.addEventListener\('pointerdown'[\s\S]*mobileEdgeSwipeStartX/);
assert.match(embeddedViewerScript, /setMobileControlsOpen\(false\)/);

console.log("responsive layout checks passed");
