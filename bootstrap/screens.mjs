#!/usr/bin/env node
// The size-class gate. Opens the assembled site at every Material 3 window
// size class and at a phone in landscape, in both themes, and fails on any
// horizontal overflow, any touch target under 48 px on a coarse pointer, a
// margin other than the class's, a missing pane split from 840 px, a clipped
// line at 200 percent text, or a page that never verifies. Screenshots go to
// screens/ for the run's artifact, so every app's screens are on record.
//   node bootstrap/screens.mjs site screens
// Needs playwright with Chromium: npm install -g playwright && playwright install chromium
import { createServer } from "node:http";
import { readFile, mkdir, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Playwright from the project, or from the global install the workflow makes.
const playwright = await import("playwright").catch(() =>
  import(pathToFileURL(join(execSync("npm root -g").toString().trim(), "playwright", "index.mjs")).href));
const { chromium } = playwright;

const site = process.argv[2] ?? "site";
const out = process.argv[3] ?? "screens";
const types = { ".html": "text/html", ".css": "text/css", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".png": "image/png", ".holo": "application/octet-stream", ".wasm": "application/wasm" };

const server = createServer(async (request, response) => {
  let path = decodeURIComponent(new URL(request.url, "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(site, path));
  try {
    await stat(file);
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}/`;

// Width classes from m3.material.io: compact under 600, medium 600 to 840,
// expanded 840 to 1200, large 1200 to 1600, extra-large from 1600; and a
// compact height, a phone in landscape.
const classes = [
  { name: "compact", width: 360, height: 780, touch: true, margin: 16, panes: false },
  { name: "medium", width: 600, height: 900, touch: true, margin: 24, panes: false },
  { name: "expanded", width: 840, height: 900, touch: true, margin: 24, panes: true },
  { name: "large", width: 1200, height: 900, touch: false, margin: 24, panes: true },
  { name: "extra-large", width: 1600, height: 1000, touch: false, margin: 24, panes: true },
  { name: "compact-height", width: 720, height: 400, touch: true, margin: 24, panes: false },
];

const failures = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();

for (const c of classes) {
  for (const theme of ["dark", "light"]) {
    const where = `${c.name} ${c.width}x${c.height} ${theme}`;
    const context = await browser.newContext({
      viewport: { width: c.width, height: c.height },
      hasTouch: c.touch,
      isMobile: c.touch,
      deviceScaleFactor: c.touch ? 2 : 1,
      colorScheme: theme,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(origin, { waitUntil: "load" });
    try {
      await page.waitForFunction(() => /passed$/.test(document.getElementById("replayed")?.textContent ?? ""), null, { timeout: 20000 });
    } catch {
      fail(where, `the page never replayed its examples: status "${await page.locator("#verified").textContent()}", ${errors.join("; ") || "no console errors"}`);
    }
    const facts = await page.evaluate((expect) => {
      const doc = document.documentElement;
      const main = document.querySelector("main");
      const rect = main.getBoundingClientRect();
      const panes = getComputedStyle(document.querySelector(".panes")).display;
      const coarse = matchMedia("(pointer: coarse)").matches;
      const small = [];
      for (const el of document.querySelectorAll("button, input, a.ghost, summary")) {
        if (el.hidden || el.closest("[hidden]") || el.classList.contains("use") || el.classList.contains("bare")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (coarse && (r.height < 48 || (el.tagName === "BUTTON" && r.width < 48))) small.push(`${el.tagName.toLowerCase()}#${el.id || el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return {
        overflow: doc.scrollWidth > doc.clientWidth,
        marginLeft: Math.round(rect.left),
        panes,
        coarse,
        small,
        verified: document.getElementById("verified").textContent,
        fonts: [...document.fonts].filter((f) => f.status === "loaded").length,
      };
    }, c);
    if (facts.overflow) fail(where, "horizontal overflow");
    if (facts.marginLeft !== c.margin) fail(where, `margin ${facts.marginLeft}px, the class needs ${c.margin}px`);
    if ((facts.panes === "grid") !== c.panes) fail(where, `panes are ${facts.panes}, the class needs ${c.panes ? "two panes" : "one column"}`);
    if (c.touch && !facts.coarse) fail(where, "the emulated device is not a coarse pointer");
    for (const s of facts.small) fail(where, `touch target under 48 px: ${s}`);
    if (facts.verified !== "verified") fail(where, `status is "${facts.verified}"`);
    await page.screenshot({ path: join(out, `${c.name}-${theme}.png`), fullPage: true });
    // 200 percent text: nothing may overflow sideways.
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const zoomed = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (zoomed) fail(where, "horizontal overflow at 200 percent text");
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    if (errors.length) fail(where, `console errors: ${errors.join("; ")}`);
    await context.close();
    console.log(`screens: ${where}: ${facts.verified}, margin ${facts.marginLeft}, ${facts.panes === "grid" ? "two panes" : "one column"}, ${facts.fonts} fonts`);
  }
}

await browser.close();
server.close();
if (failures.length) {
  console.error(`screens: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`screens: every size class passes in both themes; screenshots in ${out}/`);
