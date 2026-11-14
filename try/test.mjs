import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { chromium } from "playwright";

const root = fileURLToPath(new URL(".", import.meta.url));
const types = {
  ".css": "text/css; charset=utf-8",
  ".holo": "application/octet-stream",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
};

async function serve() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const relative = normalize(decodeURIComponent(url.pathname)).replace(
        /^([/\\]|\.\.)+/,
        "",
      );
      const path = relative === "" ? join(root, "index.html") : join(root, relative);
      if (!(await stat(path)).isFile()) throw new Error("not a file");
      response.writeHead(200, {
        "content-type": types[extname(path)] ?? "application/octet-stream",
      });
      response.end(await readFile(path));
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

test("the try page verifies the archive, answers add 20 22 and replays 22/22", async (t) => {
  const { server, url } = await serve();
  t.after(() => server.close());

  const browser = await chromium.launch();
  t.after(() => browser.close());

  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error));

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.getElementById("verified")?.textContent === "verified",
    null,
    { timeout: 30_000 },
  );

  assert.deepEqual(errors, []);
  assert.match(
    await page.textContent("#fingerprint"),
    /^[0-9a-f]{64}$/,
    "the page shows the BLAKE3 archive fingerprint",
  );

  await page.click("#replay");
  await page.waitForFunction(
    () => document.getElementById("vectors")?.textContent === "22/22",
    null,
    { timeout: 30_000 },
  );

  await page.selectOption("#op", "add");
  await page.fill("#a", "20");
  await page.fill("#b", "22");
  await page.click("#calc button[type=submit]");
  await page.waitForFunction(
    () => document.getElementById("answer")?.textContent === "42",
    null,
    { timeout: 30_000 },
  );

  assert.equal(await page.textContent("#vectors"), "22/22");
});
