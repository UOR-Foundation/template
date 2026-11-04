// The repository's app page: loads app.holo, verifies it, lets a visitor send
// requests and replay the examples the archive carries. Generic on purpose:
// an app whose requests are text shows them as text, any other as hex.
import { load } from "./vendor/prism-code/src/browser.mjs";

const $ = (id) => document.getElementById(id);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const describe = (error) => error?.code ?? error?.message ?? String(error);

const hex = (bytes) =>
  "hex:" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

// Text when the bytes are valid UTF-8 with no control characters but tab and
// newline; hex otherwise, so a binary request is still readable and reusable.
function show(bytes) {
  try {
    const text = decoder.decode(bytes);
    // eslint-disable-next-line no-control-regex
    return /[\u0000-\u0008\u000b-\u001f\u007f]/.test(text) ? hex(bytes) : text;
  } catch {
    return hex(bytes);
  }
}

function parse(text) {
  if (!text.startsWith("hex:")) return encoder.encode(text);
  const digits = text.slice(4).replace(/\s+/g, "");
  if (digits.length % 2 || /[^0-9a-f]/i.test(digits)) throw new Error("malformed hex");
  return Uint8Array.from(digits.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

async function main() {
  let app;
  try {
    app = await load("./app.holo");
  } catch (error) {
    $("name").textContent = "No app";
    $("verified").textContent = `failed to load: ${describe(error)}`;
    $("verified").classList.add("bad");
    return;
  }

  const { identities } = app;
  document.title = app.name ?? "Prism app";
  $("name").textContent = app.name ?? "unnamed";
  $("verified").textContent = identities.verified ? "verified" : "NOT verified";
  $("verified").classList.add(identities.verified ? "good" : "bad");
  $("fingerprint").textContent = identities.archiveFingerprint;
  $("limits").textContent = app.limits
    ? `request ${app.limits.request} · response ${app.limits.response} · guest ${app.limits.guestAllocation}`
    : "—";

  for (const vector of app.vectors) {
    const item = document.createElement("li");
    const use = document.createElement("button");
    use.type = "button";
    use.textContent = show(vector.request);
    use.addEventListener("click", () => {
      $("request").value = show(vector.request);
    });
    item.append(use, " → ", show(vector.response));
    $("examples").append(item);
  }

  $("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const response = await app.dispatch(parse($("request").value));
      $("response").textContent = show(response);
    } catch (error) {
      $("response").textContent = `dispatch failed: ${describe(error)}`;
    }
  });

  $("replay").addEventListener("click", async () => {
    const button = $("replay");
    button.disabled = true;
    $("replayed").textContent = "replaying…";
    try {
      const result = await app.acceptance();
      $("replayed").textContent = `${result.passed} of ${result.total} passed`;
    } catch (error) {
      $("replayed").textContent = `failed: ${describe(error)}`;
    } finally {
      button.disabled = false;
    }
  });
}

main();
