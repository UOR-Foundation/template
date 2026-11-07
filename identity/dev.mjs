#!/usr/bin/env node
// The whole account flow on one machine: the sign-in page on
// http://localhost:8790 (rpId localhost), an in-memory stand-in for the
// registry's /passkey/ routes on the same origin, and a demo app page on
// http://127.0.0.1:8791 that mounts the frame. The stand-in stores and
// serves records; it does not verify registrations, which is the real
// registry's job (UOR-Foundation/kappa-registry). The frame verifies every
// signature exactly as it does in production, so this exercises the real
// client path. Used by identity/test.mjs; run it by hand to try the flow:
//   node identity/dev.mjs
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const b64u = (bytes) => Buffer.from(bytes).toString("base64url");
const types = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".css": "text/css" };

// The frame as publish.mjs bakes it, without minifying: its panels module
// beside it, named by its SHA-256, on the demo app's own origin.
const PUBLISHED_HOST = "https://uor-foundation.github.io/template/frame/";
async function bakedFrame(host) {
  const at = (text) => text.split(JSON.stringify(PUBLISHED_HOST)).join(JSON.stringify(host));
  const panels = at(await readFile(join(root, "frame/panels.mjs"), "utf8")).replace('"/*PANELS_CSS*/"', JSON.stringify(await readFile(join(root, "frame/panels.css"), "utf8")));
  const sha = createHash("sha256").update(panels).digest("hex");
  let module = at(await readFile(join(root, "frame/frame.mjs"), "utf8"));
  module = module.replace('"/*CSS*/"', JSON.stringify(await readFile(join(root, "frame/frame.css"), "utf8")));
  module = module.replace('"/*BRAND*/"', JSON.stringify(await readFile(join(root, "site/brand/hologram-warm.css"), "utf8")));
  return { frame: module.replace('"/*PANELS*/"', JSON.stringify(sha)), panels, sha };
}

export function start({ idPort = 8790, appPort = 8791 } = {}) {
  const accounts = `http://localhost:${idPort}`;
  const challenges = new Set();
  const records = new Map();

  const json = (response, status, body) => {
    response.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" });
    response.end(JSON.stringify(body));
  };
  const body = (request) => new Promise((done) => {
    let text = "";
    request.on("data", (chunk) => (text += chunk));
    request.on("end", () => done(text ? JSON.parse(text) : {}));
  });

  const id = createServer(async (request, response) => {
    const path = new URL(request.url, accounts).pathname;
    if (request.method === "POST" && path === "/passkey/challenge") {
      const challenge = b64u(randomBytes(32));
      challenges.add(challenge);
      return json(response, 200, { challenge, expires: Date.now() + 120000 });
    }
    if (request.method === "POST" && path === "/passkey/register") {
      const r = await body(request);
      const client = JSON.parse(Buffer.from(r.clientDataJSON, "base64url"));
      if (!challenges.delete(client.challenge)) return json(response, 400, { error: "challenge", message: "The challenge is unknown or used." });
      if (records.has(r.credential)) return json(response, 409, { error: "exists", message: "The passkey is already registered." });
      const key = b64u(createHash("sha256").update(Buffer.from(r.spki, "base64url")).digest());
      const binding = r.binding ? { credential: r.binding.credential, clientDataJSON: r.binding.clientDataJSON, authenticatorData: r.binding.authenticatorData, signature: r.binding.signature } : null;
      const record = { spec: "prism/identity/key/1", key, account: r.binding?.account ?? key, credential: r.credential, alg: r.alg, spki: r.spki, origin: client.origin, created: Date.now(), binding };
      records.set(r.credential, record);
      return json(response, 201, record);
    }
    const credential = /^\/passkey\/credential\/([\w-]+)$/.exec(path)?.[1];
    if (request.method === "GET" && credential) {
      const record = records.get(credential);
      return record ? json(response, 200, record) : json(response, 404, { error: "unknown", message: "No passkey has that credential." });
    }
    const account = /^\/passkey\/account\/([\w-]+)$/.exec(path)?.[1];
    if (request.method === "GET" && account) {
      const keys = [...records.values()].filter((r) => r.account === account);
      return keys.length ? json(response, 200, { account, keys, revoked: [] }) : json(response, 404, { error: "account", message: "No account has that name." });
    }
    const file = { "/": "index.html", "/id.mjs": "id.mjs", "/id.css": "id.css", "/brand.css": "../site/brand/hologram-warm.css" }[path];
    if (!file) return json(response, 404, { error: "unknown", message: "Not found." });
    let text = await readFile(join(root, "identity", file), "utf8");
    if (file === "index.html") text = text.replace('content="https://registry.uor.foundation"', `content="${accounts}"`);
    response.writeHead(200, { "content-type": types[file.slice(file.lastIndexOf("."))] ?? "text/css", "cache-control": "no-store" });
    response.end(text);
  });

  const app = createServer(async (request, response) => {
    const path = new URL(request.url, "http://x").pathname;
    if (path === "/frame.mjs" || path === "/panels.mjs" || path.endsWith("/prism-panels.mjs")) {
      const baked = await bakedFrame(`http://127.0.0.1:${appPort}/frame/`);
      if (path.endsWith("/prism-panels.mjs") && path !== `/frame/${baked.sha}/prism-panels.mjs`) return json(response, 404, { error: "unknown", message: "Not found." });
      response.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" });
      return response.end(path === "/frame.mjs" ? baked.frame : baked.panels);
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      // /strict frames nothing, as a page whose policy predates accounts: the
      // frame must fall back to the sign-in window.
      "content-security-policy": `default-src 'self'; script-src 'self' blob:; style-src 'unsafe-inline'; frame-src ${path === "/strict" ? "'none'" : accounts}`,
    });
    response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Account demo</title><script type="module" src="/frame.mjs"></script></head>
<body><prism-frame name="Account demo" live="http://127.0.0.1:${appPort}/" accounts="${accounts}/"></prism-frame></body></html>`);
  });

  return Promise.all([new Promise((done) => id.listen(idPort, done)), new Promise((done) => app.listen(appPort, "127.0.0.1", done))]).then(() => ({
    accounts,
    app: `http://127.0.0.1:${appPort}/`,
    records,
    close: () => Promise.all([new Promise((done) => id.close(done)), new Promise((done) => app.close(done))]),
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const running = await start();
  console.log(`sign-in page ${running.accounts}/\ndemo app     ${running.app}`);
}
