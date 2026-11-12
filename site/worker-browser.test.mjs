// Real browser coverage for the module-worker dependency graph. VM doubles
// cannot catch a bare node: import, because document import maps do not enter
// workers. This assembles the production page with an existing locked fixture.
import assert from "node:assert/strict";
import { access, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "frame-worker-browser-"));
await cp(join(root, "site"), directory, { recursive: true });
await cp(join(root, "try/vendor"), join(directory, "vendor"), { recursive: true });
await cp(join(root, "try/vendor/prism-code/fixtures/Calculator.holo"), join(directory, "app.holo"));
await writeFile(join(directory, "bad.holo"), "not an archive");
const env = { ...process.env, GITHUB_ACTIONS: "false" };
execFileSync(process.execPath, [join(root, "bootstrap/page.mjs"), directory], { cwd: root, env, stdio: "inherit" });
execFileSync(process.execPath, [join(root, "bootstrap/precache.mjs"), directory], { cwd: root, env, stdio: "inherit" });
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".holo": "application/octet-stream" };
const server = createServer(async (request, response) => {
  try {
    const path = resolve(directory, "." + new URL(request.url, "http://localhost").pathname.replace(/\/$/, "/index.html"));
    assert.ok(path.startsWith(directory + "/"));
    response.setHeader("content-type", types[extname(path)] ?? "application/octet-stream");
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
test.after(async () => { await browser.close(); server.close(); await rm(directory, { recursive: true, force: true }); });

test("the production page verifies and replays in a real worker without main-thread fallback", async () => {
  const page = await browser.newPage();
  const session = await page.context().newCDPSession(page);
  const documentScripts = [];
  session.on("Debugger.scriptParsed", ({ url }) => documentScripts.push(url));
  await session.send("Debugger.enable");
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("frame")?.getAttribute("examples") === "22/22");
  assert.equal(await page.getAttribute("#frame", "verdict"), "good");
  assert.deepEqual(errors, []);
  assert.ok(page.workers().some((worker) => worker.url().endsWith("/guest-worker.mjs")));
  const mainImports = documentScripts.filter((name) => /\/(?:vendor\/prism-code|worker-runtime)\//.test(name));
  assert.deepEqual(mainImports, [], "runtime parsing and verification must stay off the document");
  await page.fill("#input", "hex:3109616464093230093232");
  await page.waitForFunction(() => document.getElementById("out")?.textContent === "1\tok\t42");
  await page.close();
});

test("an actual worker refuses a malformed archive without claiming verified identities", async () => {
  const page = await browser.newPage();
  await page.goto(url);
  const result = await page.evaluate(async () => {
    const worker = new Worker("./guest-worker.mjs", { type: "module" });
    try {
      return await new Promise((resolve, reject) => {
        worker.onerror = reject;
        worker.onmessage = ({ data }) => resolve(data);
        worker.postMessage({ id: 1, kind: "init", source: new URL("./bad.holo", location.href).href });
      });
    } finally { worker.terminate(); }
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /^archive\./);
  assert.equal(result.value, undefined);
  await page.close();
});

test("a fully cached page verifies in a worker and answers after network loss", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("frame")?.getAttribute("examples") === "22/22");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // Reload once under the controller so the runtime and archive are cached.
  await page.reload();
  await page.waitForFunction(() => document.getElementById("frame")?.getAttribute("examples") === "22/22");
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => document.getElementById("frame")?.getAttribute("examples") === "22/22");
  assert.ok(page.workers().some((worker) => worker.url().endsWith("/guest-worker.mjs")));
  await page.fill("#input", "hex:3109616464093230093232");
  await page.waitForFunction(() => document.getElementById("out")?.textContent === "1\tok\t42");
  await context.close();
});

// Positive instrumentation control: if workers cannot start, the real verified
// fallback compiles runtime scripts in this page target and must be detected.
test("document execution instrumentation detects the real no-worker fallback", async () => {
  const page = await browser.newPage();
  await page.addInitScript(() => { globalThis.Worker = undefined; });
  const session = await page.context().newCDPSession(page);
  const documentScripts = [];
  session.on("Debugger.scriptParsed", ({ url }) => documentScripts.push(url));
  await session.send("Debugger.enable");
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById("frame")?.getAttribute("examples") === "22/22");
  assert.ok(documentScripts.some((name) => /\/vendor\/prism-code\//.test(name)), "the main-thread control must be visible to the worker-only assertion");
  await page.close();
});

test("a fresh no-holo scaffold renders from the authoritative runtime without staged vendor files", async () => {
  const scaffold = await mkdtemp(join(tmpdir(), "frame-scaffold-"));
  try {
    await cp(join(root, "site"), scaffold, { recursive: true });
    await assert.rejects(access(join(scaffold, "vendor")), { code: "ENOENT" });
    execFileSync(process.execPath, [join(root, "bootstrap/page.mjs"), scaffold], { cwd: root, env, stdio: "inherit" });
    assert.match(await readFile(join(scaffold, "index.html"), "utf8"), /Template contract/);
    await access(join(scaffold, "worker-runtime/browser.mjs"));
  } finally { await rm(scaffold, { recursive: true, force: true }); }
});
