#!/usr/bin/env node
// Renders site/index.html and site/manifest.webmanifest from
// site/page.template.html and site/app.json: everything the page says about
// the app is in the HTML before any script runs, so nothing shifts after
// first paint; the stylesheets and the theme bootstrap are inlined, so
// nothing blocks rendering; the import map and the inline scripts are hashed
// into the Content-Security-Policy. An app edits app.json and nothing else.
//   node bootstrap/page.mjs site
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_REGISTRY } from "./register.mjs";

const site = process.argv[2] ?? "site";
const read = (path) => readFile(join(site, path), "utf8");

const escape = (text) =>
  String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sha = (text) => "'sha256-" + createHash("sha256").update(text).digest("base64") + "'";

const meta = JSON.parse(await read("app.json"));
let html = await read("page.template.html");

// The app's own card, the one place an app adds to the page beyond app.json:
// site/card.html is a <section class="card"> drawn first in the left pane,
// site/card.css its styles, inlined and hashed with the frame's, and
// site/card.mjs its script, which app.mjs starts with the verified app. All
// three are optional and belong to the app, not the frame.
const optional = (path) => read(path).catch(() => "");
const card = { html: (await optional("card.html")).trimEnd(), css: await optional("card.css") };
const cardModule = await access(join(site, "card.mjs")).then(() => true, () => false);

// Styles and the theme bootstrap, inlined. The brand variables come from
// brand/hologram-warm.css and brand/fonts.css, both pinned by brand.lock.
// Comments and indentation out: the stylesheet travels inside every page.
const minify = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]+/gm, "").replace(/\n{2,}/g, "\n").trim();
const css = minify([await read("brand/hologram-warm.css"), await read("brand/fonts.css"), await read("prism-page.css"), card.css]
  .join("\n")
  .replace(/url\("\.\.\/fonts\//g, 'url("./fonts/'));
const theme = (await read("theme.js")).trim();
const importmap = '{ "imports": { "node:crypto": "./vendor/node-crypto-shim.mjs" } }';

// The page is this app's, not the template's. A repository created from the
// template starts with the template's app.json, social card and icons; each
// is refused until it describes this app.
// - In CI, app.json must name the repository being built.
// - og.py and icons.py stamp each PNG with a SHA-256 of what it was drawn
//   from, their own bytes included; the stamp recomputed from this app.json
//   must match, so a card or icon drawn for another app, another name,
//   purpose or live URL, or by an older script, never ships.
const building = process.env.GITHUB_REPOSITORY;
if (building && String(meta.repository ?? "").toLowerCase() !== `https://github.com/${building}`.toLowerCase()) {
  throw new Error(`site/app.json describes ${meta.repository}, but this is ${building}: write this app's name, purpose, live URL and repository into site/app.json`);
}
const STAMP_KEY = "prism-drawn-for";
const hex = (bytes) => createHash("sha256").update(bytes).digest("hex");
const drawer = async (script) => hex(await readFile(fileURLToPath(new URL(script, import.meta.url))));
const stampOf = (...parts) => hex(parts.join("\n"));
// The value of a PNG tEXt chunk, or null: 8 signature bytes, then chunks of
// length, type, data and CRC.
function pngText(bytes, key) {
  for (let at = 8; at + 12 <= bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString("latin1", at + 4, at + 8);
    if (type === "tEXt") {
      const data = bytes.subarray(at + 8, at + 8 + length);
      const nul = data.indexOf(0);
      if (nul > 0 && data.toString("latin1", 0, nul) === key) return data.toString("latin1", nul + 1);
    }
    if (type === "IEND") break;
    at += 12 + length;
  }
  return null;
}
async function drawnFor(file, expected, fix) {
  const bytes = await readFile(join(site, file)).catch(() => null);
  if (!bytes) throw new Error(`site/${file} is missing: run ${fix}`);
  if (pngText(bytes, STAMP_KEY) !== expected) {
    throw new Error(`site/${file} was not drawn for this app.json (another app's, an older one, or by an older script): run ${fix}`);
  }
}
await drawnFor("og.png", stampOf("og", meta.name, meta.purpose, meta.live, await drawer("og.py")), "python -I bootstrap/og.py");
const iconStamp = stampOf("icons", meta.name, await drawer("icons.py"));
for (const icon of ["icon-192.png", "icon-512.png", "maskable-512.png", "apple-touch-icon.png"]) {
  await drawnFor(`icons/${icon}`, iconStamp, "python -I bootstrap/icons.py");
}

const live = new URL(meta.live);
// Holo Search: the top bar's home, and where its address bar resolves a name,
// a hash or a link, fetches the app and verifies it before opening it.
const holoSearch = new URL("https://humuhumu33.github.io/holo-search/");
// The Prism registry: the canonical kappa registry, whose index lists every
// Prism app by its self-verifying address, with its stars.
const prismRegistry = new URL(`https://${DEFAULT_REGISTRY}/`);
// The canonical frame: the template's Pages site publishes it on every push
// to main, and this page loads the current one at run time (site/app.mjs), so
// a frame change reaches this app without rebuilding it. app.json may name
// another frame host, for a test or a mirror.
const frameHost = new URL(meta.frame ?? "https://uor-foundation.github.io/template/frame/");
const shareUrl = live.href;

// What the app needs right after first paint, asked for in parallel with it:
// the vendored runtime's whole module graph, walked from browser.mjs (one
// round trip, not one per import), and the holo. Low priority, so they
// never compete with the first paint; when app.mjs imports them they are
// there. Where the runtime is not vendored yet (a local render before
// pages.yml copies it), nothing is preloaded.
async function runtimeGraph(entry) {
  const seen = new Set();
  const walk = async (path) => {
    if (seen.has(path)) return;
    const text = await read(path).catch(() => null);
    if (text === null) return;
    seen.add(path);
    for (const [, spec] of text.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      await walk(join(path, "..", spec).replace(/\\/g, "/"));
    }
  };
  await walk(entry);
  return [...seen];
}
const runtime = await runtimeGraph("vendor/prism-code/src/browser.mjs");
const holoThere = await access(join(site, "app.holo")).then(() => true, () => false);
const preloads = [
  ...runtime.map((path) => `<link rel="modulepreload" href="./${path}" fetchpriority="low" />`),
  ...(holoThere ? ['<link rel="preload" href="./app.holo" as="fetch" type="application/octet-stream" crossorigin fetchpriority="low" />'] : []),
].join("\n    ");
// The one speculation rule: the frame marks the pages a visitor is about to
// open with data-prism-ahead links; this rule prerenders them (prefetches
// one on another origin). It is fixed, so its hash is in the policy.
const speculationRules = JSON.stringify({
  prerender: [{ where: { and: [{ selector_matches: "a[data-prism-ahead]" }, { href_matches: "/*" }] }, eagerness: "immediate" }],
  prefetch: [{ where: { selector_matches: "a[data-prism-ahead]" }, eagerness: "immediate" }],
});
// The frame's host, when it is another origin: its connection is opened
// with the page's, so the frame does not wait for a TLS handshake.
const frameConnect = frameHost.origin !== live.origin ? `<link rel="preconnect" href="${escape(frameHost.origin)}" crossorigin />` : "";

const item = (mark, markClass, name, what) =>
  `<li><span class="${markClass}">${mark}</span><div><div class="name">${escape(name)}</div><div class="what">${escape(what)}</div></div></li>`;

// The frame's first paint, written into the page. The live frame is fetched
// as the page fetches it (its pointer, then the module), checked against its
// SHA-256 and asked for its shell: a declarative shadow root with its own
// styles and markup for this app. The browser paints the real bar with the
// page's first frame and the frame script takes it over unchanged, so a hop
// between apps never shows the stand-in. A frame without a shell, or no
// network at build, leaves the stand-in, which shows until the frame loads.
const slug = meta.name.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";
async function frameShell() {
  try {
    const pointer = await (await fetch(new URL("current.json", frameHost), { cache: "no-store" })).json();
    if (!/^[0-9a-f]{64}$/.test(pointer.sha256 ?? "")) throw new Error("the frame pointer names no sha256");
    const bytes = Buffer.from(await (await fetch(new URL(pointer.module, frameHost))).arrayBuffer());
    if (hex(bytes) !== pointer.sha256) throw new Error(`the frame is ${hex(bytes)}, its pointer says ${pointer.sha256}`);
    const frame = await import(`data:text/javascript;base64,${bytes.toString("base64")}`);
    if (typeof frame.shell !== "function") throw new Error("this frame has no shell");
    const attributes = { name: meta.name, address: slug, live: live.href, repo: meta.repository, home: holoSearch.href, purpose: meta.purpose, card: new URL("og.png", live).href, identity: "#identity-title", stars: stars === null ? null : String(stars) };
    return { ...frame.shell(attributes, live.href), sha256: pointer.sha256 };
  } catch (error) {
    console.warn(`page: no frame shell (${error.message}); the stand-in shows until the frame loads`);
    return null;
  }
}
// The repository's GitHub stars at build, so the bar shows them from its
// first paint: from the Prism index on the Prism registry, the snapshot the
// frame keeps the count current from, then from GitHub's API for a repository
// the index does not list yet. None known, none shown.
async function githubStars() {
  const repo = (String(meta.repository ?? "").match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/) ?? [])[1];
  if (!repo) return null;
  try {
    const pointer = new URL("index/current.json", prismRegistry);
    const named = await (await fetch(pointer, { cache: "no-store", signal: AbortSignal.timeout(15e3) })).json();
    const index = await (await fetch(new URL(named.path, pointer))).json();
    const app = (index.apps ?? []).find((entry) => (entry.repository ?? "").toLowerCase() === `https://github.com/${repo}`.toLowerCase());
    if (Number.isInteger(app?.stars)) return app.stars;
  } catch {
    // Not listed there: ask GitHub.
  }
  try {
    const headers = { accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
    const response = await fetch(`https://api.github.com/repos/${repo}`, { headers });
    const stars = response.ok ? (await response.json()).stargazers_count : null;
    return Number.isInteger(stars) ? stars : null;
  } catch {
    return null;
  }
}
const stars = await githubStars();
const frameFirstPaint = await frameShell();

const fill = {
  TITLE: escape(meta.name),
  DESCRIPTION: escape(meta.purpose),
  LIVE: escape(shareUrl),
  HOLO_SEARCH: escape(holoSearch.href),
  HOLO_SEARCH_ORIGIN: holoSearch.origin,
  REGISTRY_ORIGIN: prismRegistry.origin,
  FRAME_ORIGIN: frameHost.origin,
  OG_IMAGE: escape(new URL("og.png", live).href),
  OG_ALT: escape(`${meta.name}: ${meta.purpose}`),
  NAME: escape(meta.name),
  // The app's name as the top bar's holo:// address: lower case, words joined by hyphens.
  HOLO_NAME: escape(meta.name.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app"),
  PURPOSE: escape(meta.purpose),
  CLAIM: escape(meta.claim),
  PROP_NAME: escape(meta.proposition.name),
  PROP_TEXT: escape(meta.proposition.text),
  PROP_PLAIN: escape(meta.proposition.plain),
  THEOREMS: meta.theorems.map((t) => item("proved", "tick", `${t.name} : ${t.statement}`, `${t.how}. ${t.where}`)).join("\n"),
  PINNED: meta.pinned.map((p) => item("pinned", "pin", p.name, `${p.what} ${p.where}`)).join("\n"),
  TRUSTED: meta.trusted.map((t) => item("trusted", "pin", t.name, t.value)).join("\n"),
  ATT_PROOF_ID: escape(meta.attestations.proof.id),
  ATT_PROOF_URL: escape(meta.attestations.proof.url),
  ATT_BUILD_ID: escape(meta.attestations.build.id),
  ATT_BUILD_URL: escape(meta.attestations.build.url),
  INPUT_LABEL: escape(meta.inputLabel),
  PLACEHOLDER: escape(meta.placeholder ?? ""),
  // The keyboard a phone shows for the request: "numeric" unless app.json says otherwise.
  INPUT_MODE: escape(meta.inputMode ?? "numeric"),
  APP_CARD: card.html,
  SUBMIT_LABEL: escape(meta.submitLabel),
  OUTPUT_LABEL: escape(meta.outputLabel),
  REPO: escape(meta.repository),
  REPORT: escape(meta.report),
  INLINE_CSS: css,
  INLINE_THEME: theme,
  IMPORTMAP: importmap,
  SPECULATION_RULES: speculationRules,
  PRELOADS: preloads,
  FRAME_CONNECT: frameConnect,
  APP_DATA: JSON.stringify({ answers: meta.answers, frame: frameHost.href, card: cardModule }).replace(/</g, "\\u003c"),
  CSP_SCRIPT_HASHES: `${sha(theme)} ${sha(importmap)} ${sha(speculationRules)}`,
  CSP_STYLE_HASHES: frameFirstPaint ? `${sha(css)} ${sha(frameFirstPaint.css)}` : sha(css),
};
for (const [key, value] of Object.entries(fill)) {
  html = html.split(`{{${key}}}`).join(value);
}
{
  const open = html.indexOf('<prism-frame id="frame"');
  const close = html.indexOf(">", open) + 1;
  if (open < 0 || close <= open) throw new Error("page.template.html has no <prism-frame id=\"frame\">");
  const more = `${stars === null ? "" : ` stars="${stars}"`}${frameFirstPaint ? ` data-shell="${frameFirstPaint.sha256}"` : ""}`;
  html = `${html.slice(0, close - 1)}${more}>${frameFirstPaint?.html ?? ""}${html.slice(close)}`;
}
const left = html.match(/\{\{[A-Z_]+\}\}/g);
if (left) throw new Error(`unfilled: ${left.join(", ")}`);
await writeFile(join(site, "index.html"), html);
console.log(`page: site/index.html rendered from app.json, ${Buffer.byteLength(html)} bytes`);

// The manifest: the brand's warm dark ground, the icons bootstrap/icons.py
// draws from the app's name, and the live URL as the app's id.
const manifest = {
  id: meta.live,
  name: meta.name,
  short_name: meta.shortName ?? meta.name.split(" ")[0],
  description: meta.purpose,
  start_url: "./",
  scope: "./",
  display: "standalone",
  orientation: "any",
  lang: "en",
  background_color: "#151312",
  theme_color: "#151312",
  categories: ["utilities", "developer tools"],
  icons: [
    { src: "./icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "./icons/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "./icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};
await writeFile(join(site, "manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`page: site/manifest.webmanifest for ${meta.name} at ${meta.live}`);

// The Prism index: in a GitHub Actions build, this app registers its address
// (its holo's fingerprint and its live page) with the Prism registry
// (bootstrap/register.mjs), which is how every app comes to be listed in
// every app's address bar and in Holo Search.
// A refusal is reported and the build goes on: the index never blocks a page.
if (process.env.GITHUB_ACTIONS === "true") {
  try {
    const { register } = await import("./register.mjs");
    await register(site);
  } catch (error) {
    console.warn(`page: not registered in the Prism index (${error.message})`);
  }
}
