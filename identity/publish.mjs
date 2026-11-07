#!/usr/bin/env node
// Builds the sign-in page for https://id.uor.foundation, content addressed
// like the frame: index.html pins each file it loads by SHA-384 (subresource
// integrity), so a changed byte never runs, and current.json names the page
// by its own SHA-256 for anyone checking what the origin serves.
//   node identity/publish.mjs <out-dir> [<source commit>]
// The origin serves <out-dir> as static files over HTTPS, with no other
// content: every page on the rpId's origin can ask a passkey to sign.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const [out = "identity-out", commit = process.env.GITHUB_SHA ?? null] = process.argv.slice(2);
const files = { "id.mjs": "identity/id.mjs", "id.css": "identity/id.css", "brand.css": "site/brand/hologram-warm.css" };

await mkdir(out, { recursive: true });
let page = await readFile(join(root, "identity/index.html"), "utf8");
for (const [name, source] of Object.entries(files)) {
  const bytes = await readFile(join(root, source));
  await writeFile(join(out, name), bytes);
  const integrity = `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
  const tag = name.endsWith(".mjs") ? `src="${name}"` : `href="${name}"`;
  if (!page.includes(tag)) throw new Error(`identity/index.html does not load ${name}`);
  page = page.replace(tag, `${tag} integrity="${integrity}"`);
}
const bytes = Buffer.from(page, "utf8");
const sha256 = createHash("sha256").update(bytes).digest("hex");
await writeFile(join(out, "index.html"), bytes);
await writeFile(join(out, "current.json"), JSON.stringify({ spec: "prism/identity-page/1", sha256, source: { repository: "UOR-Foundation/template", commit } }, null, 2) + "\n");
console.log(`identity: ${sha256} -> ${out}/index.html`);
