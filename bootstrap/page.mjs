#!/usr/bin/env node
// Renders site/index.html and site/manifest.webmanifest from
// site/page.template.html and site/app.json: everything the page says about
// the app is in the HTML before any script runs, so nothing shifts after
// first paint; the stylesheets and the theme bootstrap are inlined, so
// nothing blocks rendering; the import map and the inline scripts are hashed
// into the Content-Security-Policy. An app edits app.json and nothing else.
//   node bootstrap/page.mjs site
import { createHash } from "node:crypto";
import { access, readdir, readFile, writeFile } from "node:fs/promises";
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

// The app's own surface, the one place an app adds to the page beyond
// app.json: site/card.html holds its parts, each marked with the workspace
// slot it fills (data-slot="surface", "result", "actions", "history" or
// "evidence"); site/card.css its styles, inlined and hashed with the
// frame's; and site/card.mjs its script, which app.mjs starts with the
// verified app. All three are optional and belong to the app, not the frame.
const optional = (path) => read(path).catch(() => "");
const card = { html: (await optional("card.html")).trimEnd(), css: await optional("card.css") };
const cardModule = await access(join(site, "card.mjs")).then(() => true, () => false);

// Styles and the theme bootstrap, inlined. The brand variables come from
// brand/hologram-warm.css and brand/fonts.css, both pinned by brand.lock.
// Comments and indentation out: the stylesheet travels inside every page.
const minify = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]+/gm, "").replace(/\n{2,}/g, "\n").trim();
// The display sizes its type to what it holds; its first size is set here,
// from the placeholder, so the type does not shrink when the script arrives.
const startChars = `#input{--chars:${Math.max(String(meta.placeholder ?? "").length, 4)}}`;
const css = minify([await read("brand/hologram-warm.css"), await read("brand/fonts.css"), await read("prism-page.css"), card.html ? "" : startChars, card.css]
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
const holoSearch = new URL("https://uor-foundation.github.io/holo-search/");
// The Prism registry: the canonical kappa registry, whose index lists every
// Prism app by its self-verifying address, with its stars.
const prismRegistry = new URL(`https://${DEFAULT_REGISTRY}/`);
// The canonical frame: the template's Pages site publishes it on every push
// to main, and this page loads the current one at run time (site/app.mjs), so
// a frame change reaches this app without rebuilding it. app.json may name
// another frame host, for a test or a mirror.
const frameHost = new URL(meta.frame ?? "https://uor-foundation.github.io/template/frame/");
// Prism accounts: the sign-in page the frame's account panel shows. The
// page's policy frames that one origin and no other. app.json may name
// another, for a test.
const accounts = new URL(meta.accounts ?? "https://id.uor.foundation/");
const shareUrl = live.href;

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

// The frame's Unsplash worker, which this page's connect-src must name for
// the theme panel's search: read from the live frame at build, after its
// SHA-256 is checked as the browser checks it. The frame itself is not
// written into the page: the page's own stand-in (prism-page.css) shows,
// drawn as the bar, until the module arrives, which keeps the first load
// inside the Lighthouse budget.
async function frameUnsplash() {
  try {
    const pointer = await (await fetch(new URL("current.json", frameHost), { cache: "no-store" })).json();
    if (!/^[0-9a-f]{64}$/.test(pointer.sha256 ?? "")) throw new Error("the frame pointer names no sha256");
    const bytes = Buffer.from(await (await fetch(new URL(pointer.module, frameHost))).arrayBuffer());
    if (hex(bytes) !== pointer.sha256) throw new Error(`the frame is ${hex(bytes)}, its pointer says ${pointer.sha256}`);
    const frame = await import(`data:text/javascript;base64,${bytes.toString("base64")}`);
    return /^https:\/\/[a-z0-9.-]+$/.test(frame.UNSPLASH_ORIGIN ?? "") ? frame.UNSPLASH_ORIGIN : "";
  } catch (error) {
    console.warn(`page: the frame could not be read at build (${error.message}); no Unsplash origin in connect-src`);
    return "";
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
const unsplashOrigin = await frameUnsplash();

// ---------------------------------------------------------------------------
// The workspace and the spec, rendered here so the page says everything
// before any script runs. Three inputs, in order of trust: the holo this
// build made (site/app.holo: its contract, limits, examples and build chain),
// the LexLean source it was built from (app/src: its theorems and the rules
// they name), and app.json (the promise in plain words, and links).
// ---------------------------------------------------------------------------
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const ICON = {
  doc: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 1.75h5.5L12.25 4.5v9.75H4z"/><path d="M6.25 7.5h3.5M6.25 10h3.5"/></svg>',
  x: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8"/></svg>',
  check: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.2 5 8.5l4.5-5"/></svg>',
  dot: '<svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="2.5" fill="currentColor"/></svg>',
  ext: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4.5 2.5h5v5M9.5 2.5 3 9"/></svg>',
  down: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2v7M3 6.5 6 9.5 9 6.5"/></svg>',
  arrow: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>',
};

// The holo, when the build has made one (CI copies it to site/app.holo before
// this runs). Without it the page still renders; app.mjs fills in what it can.
let holo = null;
try {
  const { loadArchive } = await import(new URL("../try/vendor/prism-code/src/index.mjs", import.meta.url));
  holo = await loadArchive(new Uint8Array(await readFile(join(site, "app.holo"))));
} catch (error) {
  console.warn(`page: no holo at build (${error.message}); the spec leaves out its contract and examples`);
}
const model = holo?.model?.application ?? {};
const prov = holo?.provenance?.model ?? {};
const evidence = holo?.evidence ?? {};
const utf8 = new TextDecoder("utf-8", { fatal: true });
// As app.mjs shows bytes: text when it is plain UTF-8, hex otherwise.
const show = (bytes) => {
  try {
    const text = utf8.decode(bytes);
    // eslint-disable-next-line no-control-regex
    if (!/[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)) return text;
  } catch {}
  return "hex:" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};
const vectors = (holo?.vectors ?? []).map((v) => ({ req: show(v.request), res: show(v.response) }));
const like = (text, list = []) => list.some((p) => (p.endsWith("*") ? text.startsWith(p.slice(0, -1)) : text === p));
const kind = (text) => (like(text, meta.answers?.positive) ? "good" : text === meta.answers?.refusal ? "refuse" : like(text, meta.answers?.negative) ? "bad" : "");

// LexLean, read generically: every module's definitions and theorems.
function blocks(text, word) {
  const out = [];
  const re = new RegExp(`^${word}\\{`, "gm");
  let m;
  while ((m = re.exec(text))) {
    let depth = 0, i = m.index + word.length, quoted = false;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === '"' && text[i - 1] !== "\\") quoted = !quoted;
      if (quoted) continue;
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) break;
    }
    out.push(text.slice(m.index + word.length + 1, i));
  }
  return out;
}
function fields(inner) {
  const out = {};
  for (const part of inner.split(/,[ \t]*\r?\n {2}(?=[a-z_]+:)/)) {
    const m = part.trim().match(/^([a-z_]+):\s*([\s\S]*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const list = (s) => (s ?? "").replace(/^\[|\]$/g, "").split(/,\s*(?=[\w.]+\s*(?::|,|$))/).map((x) => x.trim()).filter(Boolean);
async function lexlean() {
  const dir = join(repoRoot, "app", "src");
  const files = (await readdir(dir, { recursive: true }).catch(() => []))
    .map((f) => f.split("\\").join("/"))
    .filter((f) => f.endsWith(".lex.tex") && !f.startsWith("Foundation/"))
    .sort();
  return Promise.all(files.map(async (f) => {
    const text = await readFile(join(dir, f), "utf8");
    const path = `app/src/${f}`;
    return {
      path,
      defs: blocks(text, "definition").map(fields).map((d) => ({ ...d, params: list(d.parameters) })),
      thms: blocks(text, "theorem").map(fields).map((t) => ({ ...t, path, params: list(t.parameters), axioms: list(t.axioms) })),
    };
  }));
}
const modules = await lexlean();
const defs = new Map(modules.flatMap((m) => m.defs.map((d) => [d.name, d])));
const theorems = modules.flatMap((m) => m.thms);

// LexLean is fully parenthesised, so a paren tree is enough to print an
// expression the way a person writes it. Anything with control flow stays
// as written.
const OPS = { "/\\": "∧", "\\/": "∨", "->": "→", "<->": "↔", "=?": "=", "<?": "<", "<=?": "≤", "&&": "∧", "||": "∨", "!=": "≠", "=": "=", "<": "<", ">": ">", "<=": "≤", ">=": "≥", "+": "+", "*": "×", "-": "−" };
const PRIM = { remainder: (a) => `${a[0]} mod ${a[1]}`, multiply: (a) => `${a[0]} × ${a[1]}`, add: (a) => `${a[0]} + ${a[1]}`, subtract: (a) => `${a[0]} − ${a[1]}`, divide: (a) => `${a[0]} ÷ ${a[1]}`, to_nat: (a) => a[0], utf8_encode: (a) => a[0] };
function pretty(src = "") {
  const tokens = src.match(/"(?:[^"\\]|\\.)*"|[()]|[^\s()]+/g) ?? [];
  const stack = [[]];
  for (const t of tokens) {
    if (t === "(") stack.push([]);
    else if (t === ")") { if (stack.length < 2) return src; const n = stack.pop(); stack.at(-1).push(n); }
    else stack.at(-1).push(t);
  }
  if (stack.length !== 1) return src;
  const atom = (t) => t.replace(/^[\w.]+::/, "");
  const render = (n, ctx) => {
    while (Array.isArray(n) && n.length === 1) n = n[0];
    if (!Array.isArray(n)) return atom(n);
    const colon = n.indexOf(":");
    if (n[0] === "prim") {
      const args = n.slice(2, colon > 0 ? colon : undefined).map((a) => render(a, "app"));
      const s = PRIM[n[1]] ? PRIM[n[1]](args) : `${n[1]} ${args.join(" ")}`;
      return ctx === "app" && /\s/.test(s) ? `(${s})` : s;
    }
    if (colon > 0) return render(n.slice(0, colon), ctx);
    // "b = true" reads as "b": a check that holds.
    if (n.length === 3 && n[1] === "=" && n[2] === "true") return render(n[0], ctx);
    const infix = n.some((x) => typeof x === "string" && x in OPS);
    const s = n.map((x) => (typeof x === "string" && x in OPS ? OPS[x] : render(x, infix ? "infix" : "app"))).join(" ");
    return ctx === "app" || (ctx === "infix" && infix) ? `(${s})` : s;
  };
  return render(stack[0], "top");
}
const simple = (body) => body.length < 280 && !/\b(match|let|if|record|cons|fun)\b/.test(body);
const method = (proof = "") => {
  const head = proof.match(/^(\w+)/)?.[1] ?? "";
  if (head === "apply") return `applying ${proof.match(/theorem:\s*(\w+)/)?.[1] ?? "a theorem"}`;
  return { linear_arithmetic: "linear arithmetic", cases: "case analysis", reflexivity: "computation", decide: "computation", simp: "simplification", induction: "induction", omega: "integer arithmetic" }[head] ?? head.replace(/_/g, " ");
};
const STANDARD_AXIOMS = new Set(["propext", "Quot.sound", "Classical.choice"]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const short = (h, n) => (h && h.length > n ? h.slice(0, n) : h ?? "");
const sentences = (s) => String(s ?? "").split(/(?<=\.)\s+/).map((x) => x.trim()).filter(Boolean);

// Copy rules: under the name, the first sentence of the purpose; the rest of
// the purpose is protocol, and protocol belongs in the spec.
const tagline = meta.tagline ?? sentences(meta.purpose)[0] ?? "";
// The promise: a headline in plain words and an optional detail, from
// app.json's "promise". Without it, the cleanest sentence available stands
// in, and a sentence that names code never leads.
const codey = (s) => /\b[a-z]+[A-Z]\w*|\b\w+_\w+\b|::|\b[A-Z]{2,}-\d/.test(s);
const promise = (() => {
  if (meta.promise?.headline) return { headline: meta.promise.headline, detail: meta.promise.detail ?? "" };
  const plain = sentences(meta.proposition?.plain || String(meta.claim ?? "").replace(/^[^:]+:\s*/, ""));
  if (plain.length && !codey(plain[0])) return { headline: plain[0], detail: plain.slice(1).filter((s) => !codey(s)).join(" ") };
  return { headline: tagline || model.cargo_description || meta.name, detail: "" };
})();

// The surface: an app with its own (card.html) fills it from the slot script;
// any other gets the display, its input as the largest thing on screen.
const surface = card.html ? "" : `          <label class="display" for="input"><span class="k">${escape(meta.inputLabel ?? "Request")}</span><input id="input" autocomplete="off" spellcheck="false" enterkeyhint="go" inputmode="${escape(meta.inputMode ?? "numeric")}" placeholder="${escape(meta.placeholder ?? "")}" /><span class="rule" aria-hidden="true"></span></label>`;
// Try: a few of the holo's own short examples, at most two per answer.
const tries = card.html ? "" : (() => {
  const seen = new Map();
  return vectors.filter((v) => {
    const k = kind(v.res);
    if (k === "refuse" || v.req === "" || v.req.length > 24 || (seen.get(k) ?? 0) >= 2) return false;
    seen.set(k, (seen.get(k) ?? 0) + 1);
    return true;
  }).map((v) => `<button type="button" data-request="${escape(v.req)}">${escape(v.req)}</button>`).join("");
})();
// The slot script: before first paint, it moves the parts of the app's own
// surface into the workspace (data-slot names the place; the ids are the
// first card's, read when an app has not marked its parts yet), so nothing
// moves after the page appears. Hashed into the policy.
const SLOT_SCRIPT = `(function(){var src=document.getElementById("card-src");if(!src)return;var f=src.content,d=document;function pick(s,l){return f.querySelector('[data-slot="'+s+'"]')||f.querySelector(l)}d.body.classList.add("has-card");f.querySelectorAll("svg.sprite").forEach(function(n){d.body.appendChild(n)});var s=pick("surface","#board");if(s){var b=d.createElement("div");b.className="board-fit";b.appendChild(s);d.getElementById("stage").replaceChildren(b)}var r=pick("result","#game-status");if(r)d.getElementById("out").replaceWith(r);var a=pick("actions",".controls");if(a){d.getElementById("tries").replaceWith(a);d.getElementById("actions-k").textContent=a.dataset.label||"Controls"}var h=pick("history","#game-log");if(h){h.classList.add("list");d.getElementById("hist").replaceWith(h);d.getElementById("history-k").textContent=h.dataset.label||"History"}var e=pick("evidence","#game-wire");if(e)d.getElementById("evidence-hold").appendChild(e);src.remove()})();`;
const cardBlock = card.html ? `    <template id="card-src">\n${card.html}\n    </template>\n    <script>${SLOT_SCRIPT}</script>` : "";

// The spec, in the order a newcomer asks: why trust it (the promise and the
// three facts behind it), how it is proved (each theorem, its method, the
// rules it names), what runs (its contract, its examples, its identity).
const commit = process.env.GITHUB_SHA || "HEAD";
const fileUrl = (p) => `${String(meta.repository ?? "").replace(/\/$/, "")}/blob/${commit}/${p}`;
const pure = model.capabilities_empty === true;
const n = theorems.length;
const check = (state, title, detail, go, id) =>
  `<button class="check" type="button" data-go="${go}"><span class="dot ${state}"${id ? ` id="${id}-dot"` : ""}>${state === "good" ? ICON.check : ICON.dot}</span><b>${title}</b><span${id ? ` id="${id}"` : ""}>${escape(detail)}</span></button>`;
const promiseHtml = `<section class="spec-sec" id="sec-promise">
  <p class="promise">${escape(promise.headline)}</p>${promise.detail ? `\n  <p class="promise-detail">${escape(promise.detail)}</p>` : ""}
  <div class="checks">
    ${n ? check("good", "Proved", "for every input, checked by Lean", "sec-proof") : check("", "Unproved", "no theorems in the source", "sec-proof")}
    ${check("", "Tested", vectors.length ? `${vectors.length} examples, replaying here` : "examples replay here", "ex-head", "ck-ex")}
    ${holo ? (pure ? check("good", "Sealed", "bytes in, bytes out, nothing else", "sec-package") : check("", "Open", "has capabilities beyond bytes", "sec-package")) : ""}
  </div>
</section>`;
const named = (stmt = "") => [...new Set((stmt.match(/[\w.]*::\w+|\b[a-zA-Z_]\w*\b/g) ?? []).map((t) => t.replace(/^[\w.]+::/, "")))].filter((t) => defs.has(t));
let defSeq = 0;
const theoremHtml = (t) => {
  const extra = t.axioms.filter((a) => !STANDARD_AXIOMS.has(a));
  const terms = named(t.statement).map((u) => {
    const d = defs.get(u);
    const id = `def-${defSeq++}`;
    const body = d.body ?? "";
    const shown = simple(body) ? pretty(body) : body.split(/\r?\n/).map((l) => l.replace(/^\s{0,2}/, "")).join("\n");
    const head = `${d.name} ${d.params.map((p) => p.split(":")[0].trim()).join(" ")}`.trim();
    return {
      chip: `<button class="term" type="button" aria-expanded="false" aria-controls="${id}">${escape(d.name)}</button>`,
      block: `<div class="def" id="${id}" hidden><pre class="code"><span class="q">${escape(head)} means</span>${escape(shown)}</pre></div>`,
    };
  });
  const forAll = t.params.length ? `For every ${t.params.map((p) => p.replace(/\s*:\s*/, " : ")).join(", ")}` : "Always";
  return `<div class="thm">
    <div class="thm-name"><span>${escape(t.name)}</span><a href="${escape(fileUrl(t.path))}" aria-label="${escape(t.name)} in ${escape(t.path)}">${ICON.ext}</a></div>
    <pre class="code"><span class="q">${escape(forAll)}</span>${escape(pretty(t.statement))}</pre>
    <p class="how" title="Axioms: ${escape(t.axioms.join(", ") || "none")}">${escape(cap(method(t.proof)))}${extra.length ? ` · <span class="warn">extra axioms: ${escape(extra.join(", "))}</span>` : ""}</p>${terms.length ? `
    <div class="terms">${terms.map((o) => o.chip).join("")}</div>${terms.map((o) => o.block).join("")}` : ""}
  </div>`;
};
// Without LexLean source to read, app.json's own theorem list stands in.
const theoremList = n ? theorems.map(theoremHtml).join("\n  ") : (meta.theorems ?? []).map((t) => `<div class="thm"><div class="thm-name"><span>${escape(t.name)}</span></div><pre class="code">${escape(t.statement)}</pre><p class="how">${escape(t.how ?? "")}</p></div>`).join("\n  ");
const pinned = meta.pinned ?? [];
const proofHtml = `<section class="spec-sec" id="sec-proof">
  <p class="kick">Proof${n ? ` · ${n} ${n === 1 ? "theorem" : "theorems"}` : ""}</p>
  ${theoremList}${pinned.length ? `
  <details><summary>Tested, not proved · ${pinned.length}</summary><ul>${pinned.map((p) => `<li><b>${escape(p.name)}</b>${escape(sentences(p.what)[0] ?? "")}</li>`).join("")}</ul></details>` : ""}
</section>`;
const declared = [...(meta.answers?.positive ?? []), ...(meta.answers?.negative ?? []), meta.answers?.refusal].filter((a) => a && !a.endsWith("*"));
const outs = declared.length ? declared : [...new Set(vectors.map((v) => v.res))].filter((r) => r.length <= 24).slice(0, 6);
const others = vectors.some((v) => !outs.includes(v.res) && !like(v.res, meta.answers?.negative) && !like(v.res, meta.answers?.positive));
const upTo = (b) => (Number.isInteger(b) ? `up to ${b} bytes` : "");
const rowHtml = (v, i) => `<li${i >= 6 ? " hidden" : ""}><span class="req"${v.req.length > 40 ? ` title="${escape(v.req)}"` : ""}>${escape(v.req === "" ? "(empty)" : v.req.length > 40 ? `${v.req.slice(0, 20)}…${v.req.slice(-8)}` : v.req)}</span><span class="tag ${kind(v.res)}">${escape(v.res.length > 22 ? `${v.res.length} bytes` : v.res)}</span><span class="tick" id="vt-${i}">${ICON.dot}</span></li>`;
const links = [
  holo && `<a href="./app.holo" download>${ICON.down}app.holo</a>`,
  meta.repository && `<a href="${escape(meta.repository)}">Source ${ICON.ext}</a>`,
  meta.report && `<a href="${escape(meta.report)}">Report ${ICON.ext}</a>`,
  meta.attestations?.proof?.url && `<a href="${escape(meta.attestations.proof.url)}">Proof record ${ICON.ext}</a>`,
  meta.attestations?.build?.url && `<a href="${escape(meta.attestations.build.url)}">Build run ${ICON.ext}</a>`,
].filter(Boolean).join("");
const details = [
  ["Entry", escape(model.entry_root ?? "")],
  ["Runtime", model.core_contract ? `${escape(model.core_contract)}, ${holo?.limits?.guestAllocation ?? "?"} B memory` : ""],
  ["Compiler", evidence.lexleanCommit || prov.lexlean_commit ? `LexLean ${escape(short(evidence.lexleanCommit ?? prov.lexlean_commit, 7))}, Lean ${escape(short(evidence.lean4ProdCommit ?? prov.lean4_prod_commit, 7))}` : ""],
  ["Source", modules.length ? modules.map((m) => `<a href="${escape(fileUrl(m.path))}">${escape(m.path.replace(/^app\/src\//, ""))}</a>`).join(", ") + (prov.source_id ? ` (${escape(short(prov.source_id, 12))})` : "") : ""],
  ...(meta.trusted ?? []).map((t) => [escape(t.name), escape(t.value)]),
].filter(([, v]) => v);
const packageHtml = `<section class="spec-sec" id="sec-package">
  <p class="kick">Package</p>
  <div class="contract">
    <div class="end"><p class="k">You send</p><b>${escape(model.view?.input_label ?? meta.inputLabel ?? "Bytes")}</b><span class="lim">${upTo(holo?.limits?.request)}</span></div>
    <span class="arrow">${ICON.arrow}</span>
    <div class="end"><p class="k">It answers</p><div class="tags">${outs.map((r) => `<span class="tag ${kind(r)}">${escape(r)}</span>`).join("")}</div><span class="lim">${others ? "or a reply, " : ""}${upTo(holo?.limits?.response)}</span></div>
  </div>
  <div class="sub-k" id="ex-head"><span>Examples</span><span id="ex-sum">${vectors.length ? "replaying" : ""}</span></div>
  <ol class="rows" id="ex-rows">${vectors.map(rowHtml).join("")}</ol>${vectors.length > 6 ? `
  <button class="more" type="button" id="ex-more">Show all ${vectors.length}</button>` : ""}
  <div id="session-slot" class="session" hidden><div class="sub-k"><span>This session</span></div></div>
  <div class="sub-k"><span>Fingerprint</span></div>
  <div class="fp"><span class="hash" id="fp">${escape(holo?.identities?.archiveFingerprint ?? "computing")}</span><button class="copy" id="copy" type="button">Copy</button></div>
  <div class="links">${links}</div>
  <details><summary>Build details</summary><dl class="kv">${details.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl></details>
  <p class="made">Built from <a href="https://github.com/UOR-Foundation/template">UOR-Foundation/template</a> with the <a href="https://github.com/Hologram-Technologies/hologram-brand-kit">Hologram brand kit</a>. MIT or Apache-2.0.</p>
</section>`;
// The spec is its own file, loaded the first time it opens (site/spec.mjs).
await writeFile(join(site, "spec.html"), [promiseHtml, proofHtml, packageHtml].join("\n") + "\n");

const fill = {
  TITLE: escape(meta.name),
  DESCRIPTION: escape(meta.purpose),
  LIVE: escape(shareUrl),
  HOLO_SEARCH: escape(holoSearch.href),
  HOLO_SEARCH_ORIGIN: holoSearch.origin,
  REGISTRY_ORIGIN: prismRegistry.origin,
  FRAME_ORIGIN: frameHost.origin,
  ACCOUNTS: escape(accounts.href),
  ACCOUNTS_ORIGIN: accounts.origin,
  UNSPLASH_ORIGIN: unsplashOrigin,
  OG_IMAGE: escape(new URL("og.png", live).href),
  OG_ALT: escape(`${meta.name}: ${meta.purpose}`),
  NAME: escape(meta.name),
  // The app's name as the top bar's holo:// address: lower case, words joined by hyphens.
  HOLO_NAME: escape(meta.name.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app"),
  PURPOSE: escape(meta.purpose),
  TAGLINE: escape(tagline),
  PROMISE_HEADLINE: escape(promise.headline),
  ATT_PROOF_URL: escape(meta.attestations?.proof?.url ?? ""),
  ICON_DOC: ICON.doc,
  ICON_X: ICON.x,
  SURFACE: surface,
  ACTIONS_LABEL: card.html ? "Controls" : "Try",
  TRIES: tries,
  CARD: cardBlock,
  VERSION: escape(model.cargo_version ? `v${model.cargo_version}` : ""),
  REPO: escape(meta.repository),
  INLINE_CSS: css,
  INLINE_THEME: theme,
  IMPORTMAP: importmap,
  SPECULATION_RULES: speculationRules,
  FRAME_CONNECT: frameConnect,
  APP_DATA: JSON.stringify({ answers: meta.answers, frame: frameHost.href, card: cardModule, inputLabel: meta.inputLabel ?? "" }).replace(/</g, "\\u003c"),
  CSP_SCRIPT_HASHES: [theme, importmap, speculationRules, ...(cardBlock ? [SLOT_SCRIPT] : [])].map(sha).join(" "),
  CSP_STYLE_HASHES: sha(css),
};
for (const [key, value] of Object.entries(fill)) {
  html = html.split(`{{${key}}}`).join(value);
}
{
  const open = html.indexOf('<prism-frame id="frame"');
  const close = html.indexOf(">", open) + 1;
  if (open < 0 || close <= open) throw new Error("page.template.html has no <prism-frame id=\"frame\">");
  const more = stars === null ? "" : ` stars="${stars}"`;
  html = `${html.slice(0, close - 1)}${more}>${html.slice(close)}`;
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
