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
// The canonical frame: the template's Pages site publishes it on every push
// to main, and this page loads the current one at run time (site/app.mjs), so
// a frame change reaches this app without rebuilding it. app.json may name
// another frame host, for a test or a mirror.
const frameHost = new URL(meta.frame ?? "https://uor-foundation.github.io/template/frame/");
const shareUrl = live.href;

const item = (mark, markClass, name, what) =>
  `<li><span class="${markClass}">${mark}</span><div><div class="name">${escape(name)}</div><div class="what">${escape(what)}</div></div></li>`;

const fill = {
  TITLE: escape(meta.name),
  DESCRIPTION: escape(meta.purpose),
  LIVE: escape(shareUrl),
  HOLO_SEARCH: escape(holoSearch.href),
  HOLO_SEARCH_ORIGIN: holoSearch.origin,
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
  APP_DATA: JSON.stringify({ answers: meta.answers, frame: frameHost.href, card: cardModule }).replace(/</g, "\\u003c"),
  CSP_SCRIPT_HASHES: `${sha(theme)} ${sha(importmap)}`,
  CSP_STYLE_HASHES: sha(css),
};
for (const [key, value] of Object.entries(fill)) {
  html = html.split(`{{${key}}}`).join(value);
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
