#!/usr/bin/env node
// The whole Prism id flow on one machine: the Prism id page on
// http://localhost:8790, an in-memory stand-in for the registry's Prism
// mailbox (/prism/topic/<name>) on the same origin, and a demo app page on
// http://127.0.0.1:8791 that mounts the frame. The mailbox keeps and returns
// opaque messages, as the real one does (UOR-Foundation/kappa-registry);
// the frame verifies every session exactly as it does in production. Used
// by identity/test.mjs; run it by hand to try the flow:
//   node identity/dev.mjs
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".css": "text/css" };

// The frame as publish.mjs bakes it, without minifying: its panels module
// and Prism id beside it, each named by its SHA-256, on the demo app's own
// origin.
const PUBLISHED_HOST = "https://uor-foundation.github.io/template/frame/";
async function bakedFrame(host) {
  const at = (text) => text.split(JSON.stringify(PUBLISHED_HOST)).join(JSON.stringify(host));
  const prismId = await readFile(join(root, "identity/prism-id.mjs"), "utf8");
  const prismSha = createHash("sha256").update(prismId).digest("hex");
  const panels = at(await readFile(join(root, "frame/panels.mjs"), "utf8"))
    .replace('"/*PANELS_CSS*/"', JSON.stringify(await readFile(join(root, "frame/panels.css"), "utf8")))
    .replace('"/*PRISM_ID*/"', JSON.stringify(prismSha));
  const sha = createHash("sha256").update(panels).digest("hex");
  let module = at(await readFile(join(root, "frame/frame.mjs"), "utf8"));
  module = module.replace('"/*CSS*/"', JSON.stringify(await readFile(join(root, "frame/frame.css"), "utf8")));
  module = module.replace('"/*BRAND*/"', JSON.stringify(await readFile(join(root, "site/brand/hologram-warm.css"), "utf8")));
  return { frame: module.replace('"/*PANELS*/"', JSON.stringify(sha)), panels, sha, prismId, prismSha };
}

// `registry`, when given, is a real registry's URL (UOR-Foundation/kappa-registry
// with KAPPA_PASSKEY_ORIGINS naming this page's origin), used instead of the
// in-memory mailbox.
export function start({ idPort = 8790, appPort = 8791, registry = null } = {}) {
  const accounts = `http://localhost:${idPort}`;
  const mailbox = registry ? new URL(registry).origin : accounts;
  // The mailbox: the newest messages of each topic, as the registry keeps them.
  const topics = new Map();
  const KEEP = 64;

  const json = (response, status, body) => {
    response.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" });
    response.end(JSON.stringify(body));
  };
  const bytesOf = (request) => new Promise((done) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => done(Buffer.concat(chunks)));
  });

  const id = createServer(async (request, response) => {
    const path = new URL(request.url, accounts).pathname;
    const topic = /^\/prism\/topic\/([a-z0-9-]+:[0-9a-f]{64})$/.exec(path)?.[1];
    if (topic && request.method === "POST") {
      const message = (await bytesOf(request)).toString("base64url");
      const kept = (topics.get(topic) ?? []).filter((m) => m !== message);
      topics.set(topic, [...kept, message].slice(-KEEP));
      return json(response, kept.length === topics.get(topic).length ? 200 : 201, { topic, messages: topics.get(topic).length });
    }
    if (topic && request.method === "GET") {
      return topics.has(topic) ? json(response, 200, { topic, messages: topics.get(topic) }) : json(response, 404, { error: "unknown", message: "No messages." });
    }
    const file = { "/3/": "index.html", "/3/id.mjs": "id.mjs", "/3/prism-id.mjs": "prism-id.mjs", "/3/id.css": "id.css", "/3/brand.css": "../site/brand/hologram-warm.css" }[path];
    if (!file) return json(response, 404, { error: "unknown", message: "Not found." });
    let text = await readFile(join(root, "identity", file), "utf8");
    if (file === "index.html") text = text.replace('content="https://registry.uor.foundation"', `content="${mailbox}"`).replace("connect-src https://registry.uor.foundation", `connect-src ${registry ? mailbox : "'self'"}`);
    response.writeHead(200, { "content-type": types[file.slice(file.lastIndexOf("."))] ?? "text/css", "cache-control": "no-store" });
    response.end(text);
  });

  const app = createServer(async (request, response) => {
    const path = new URL(request.url, "http://x").pathname;
    if (path === "/frame.mjs" || path.endsWith("/prism-panels.mjs") || path.endsWith("/prism-id.mjs")) {
      const baked = await bakedFrame(`http://127.0.0.1:${appPort}/frame/`);
      const served = { "/frame.mjs": baked.frame, [`/frame/${baked.sha}/prism-panels.mjs`]: baked.panels, [`/frame/${baked.prismSha}/prism-id.mjs`]: baked.prismId }[path];
      if (served === undefined) return json(response, 404, { error: "unknown", message: "Not found." });
      response.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" });
      return response.end(served);
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      // Frames nothing: the Prism id page opens as its own window.
      "content-security-policy": "default-src 'self'; script-src 'self' blob:; style-src 'unsafe-inline'; frame-src 'none'",
    });
    response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Account demo</title><script type="module" src="/frame.mjs"></script></head>
<body><prism-frame name="Account demo" live="http://127.0.0.1:${appPort}/" accounts="${accounts}/"></prism-frame></body></html>`);
  });

  return Promise.all([new Promise((done) => id.listen(idPort, done)), new Promise((done) => app.listen(appPort, "127.0.0.1", done))]).then(() => ({
    accounts,
    app: `http://127.0.0.1:${appPort}/`,
    topics,
    close: () => Promise.all([new Promise((done) => id.close(done)), new Promise((done) => app.close(done))]),
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const running = await start();
  console.log(`Prism id page ${running.accounts}/3/\ndemo app      ${running.app}`);
}
