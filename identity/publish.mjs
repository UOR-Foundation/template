#!/usr/bin/env node
// Builds the Prism id page for https://id.uor.foundation/3/, content addressed
// like the frame: index.html pins each file it loads by SHA-384 (subresource
// integrity), so a changed byte never runs, and current.json names the page
// by its own SHA-256 for anyone checking what the origin serves.
//   node identity/publish.mjs <out-dir> [<source commit>]
// It writes <out-dir>/3/, so the page sits beside the prism/identity/1 page
// at / that open apps on older frames still use: deploying it changes
// nothing they see.
// The origin serves <out-dir> as static files over HTTPS, with no other
// content: its storage holds every visitor's Prism id device.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const [base = "identity-out", commit = process.env.GITHUB_SHA ?? null] = process.argv.slice(2);
const out = join(base, "3");
const files = { "id.mjs": "identity/id.mjs", "prism-id.mjs": "identity/prism-id.mjs", "id.css": "identity/id.css", "brand.css": "site/brand/hologram-warm.css" };

await mkdir(out, { recursive: true });
let page = await readFile(join(root, "identity/index.html"), "utf8");
for (const [name, source] of Object.entries(files)) {
  const bytes = await readFile(join(root, source));
  await writeFile(join(out, name), bytes);
  const integrity = `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
  const tag = page.includes(`src="${name}"`) ? `src="${name}"` : `href="${name}"`;
  if (!page.includes(tag)) throw new Error(`identity/index.html does not load ${name}`);
  page = page.replace(tag, `${tag} integrity="${integrity}"`);
}
const bytes = Buffer.from(page, "utf8");
const sha256 = createHash("sha256").update(bytes).digest("hex");
await writeFile(join(out, "index.html"), bytes);
await writeFile(join(out, "current.json"), JSON.stringify({ spec: "prism/identity-page/1", sha256, source: { repository: "UOR-Foundation/template", commit } }, null, 2) + "\n");
console.log(`identity: ${sha256} -> ${out}/index.html`);
