// The standard Prism app page: loads app.holo with the vendored prism-code
// runtime, verifies it, lets a visitor send requests, and replays the
// examples the archive carries. Everything the page says about the app is
// rendered into index.html by bootstrap/page.mjs from app.json before any
// script runs; this module adds only what the holo itself tells it. The
// service worker caches every response as it passes, so the page works
// offline after one visit.

const $ = (id) => document.getElementById(id);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const describe = (error) => error?.code ?? error?.message ?? String(error);
const data = JSON.parse($("app-data").textContent);

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

function chip(element, text, state) {
  element.textContent = text;
  element.className = `chip chip-${state}`;
}

// The frame. The top bar is not part of this page: it is the canonical
// <prism-frame>, which UOR-Foundation/template publishes on every push to main.
// This page reads the frame host's pointer, fetches the module it names,
// checks the bytes against the pointer's SHA-256, and only then runs them, so
// a change to the frame reaches this app on its next load and nothing else
// can stand in for it. ?frame=<sha256> opens the page with one exact frame.
// Until the frame arrives, its height is reserved and the app's holo://
// address stands in; offline, the service worker serves the last one.
async function frame() {
  if (customElements.get("prism-frame")) return;
  const host = new URL(data.frame);
  const pinned = new URLSearchParams(location.search).get("frame");
  try {
    const pointer = /^[0-9a-f]{64}$/.test(pinned ?? "")
      ? { sha256: pinned, module: `${pinned}/prism-frame.mjs` }
      : await fetch(new URL("current.json", host), { cache: "no-cache" }).then((response) => {
          if (!response.ok) throw new Error(`frame pointer: HTTP ${response.status}`);
          return response.json();
        });
    if (!/^[0-9a-f]{64}$/.test(pointer.sha256 ?? "")) throw new Error("frame pointer names no sha256");
    const response = await fetch(new URL(pointer.module, host));
    if (!response.ok) throw new Error(`frame: HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
    if (digest !== pointer.sha256) throw new Error(`frame is ${digest}, its pointer says ${pointer.sha256}`);
    const url = URL.createObjectURL(new Blob([bytes], { type: "text/javascript" }));
    try {
      await import(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    document.documentElement.dataset.frame = digest;
  } catch (error) {
    // The address stands in; the app itself works without the frame.
    console.warn(`frame: ${describe(error)}`);
  }
}

// The shield in the frame: the verdict this page reached on the holo.
function verdict(state, label, fingerprint = "") {
  const element = $("frame");
  element.setAttribute("verdict", state);
  element.setAttribute("verdict-label", label);
  if (fingerprint) element.setAttribute("fingerprint", fingerprint);
}

// Install the service worker once the page has loaded, so it never competes
// with the first paint; when a new one is waiting, show one chip and reload
// only when the visitor asks. Never silently.
function offline() {
  const paint = () => ($("offline").hidden = navigator.onLine);
  paint();
  addEventListener("online", paint);
  addEventListener("offline", paint);
  if (!("serviceWorker" in navigator)) return;
  const register = () => navigator.serviceWorker.register("./sw.js").then((registration) => {
    // Reload only when the visitor asked for the update: the first worker
    // claims the page without one, so a first visit is one navigation.
    let asked = false;
    const offer = (worker) => {
      if (!navigator.serviceWorker.controller) return;
      $("update").hidden = false;
      $("reload").addEventListener("click", () => {
        asked = true;
        worker.postMessage("skip-waiting");
      }, { once: true });
    };
    if (registration.waiting) offer(registration.waiting);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed") offer(worker);
      });
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!asked) return;
      asked = false;
      location.reload();
    });
  }).catch(() => {
    // No worker: the page still works online.
  });
  if (document.readyState === "complete") register();
  else addEventListener("load", register, { once: true });
}

// Every answer is coloured by what app.json says it means: a positive answer
// green, a negative answer or the refusal red, anything else neutral. A
// runtime error is red too. An entry ending in "*" matches a prefix.
const matches = (text, list) => (list ?? []).some((e) => (e.endsWith("*") ? text.startsWith(e.slice(0, -1)) : text === e));
function answerState(text) {
  if (matches(text, data.answers.positive)) return "good";
  if (text === data.answers.refusal || matches(text, data.answers.negative)) return "bad";
  return "wait";
}

// The runtime and the holo are fetched after the first frame has painted:
// everything above the fold is in the HTML already, and nothing the holo adds
// is needed to read the page, so the first paint waits for nothing. A tab
// opened in the background paints no frame, so a short timer stands in.
const afterFirstFrame = () => new Promise((resolve) => {
  requestAnimationFrame(() => setTimeout(resolve, 0));
  setTimeout(resolve, 200);
});

async function main() {
  frame();
  offline();

  let app;
  try {
    await afterFirstFrame();
    const { load } = await import("./vendor/prism-code/src/browser.mjs");
    app = await load("./app.holo");
  } catch (error) {
    chip($("verified"), `failed to load: ${describe(error)}`, "bad");
    chip($("replayed"), "no app", "bad");
    verdict("bad", "The app failed to load");
    return;
  }

  const { identities } = app;
  chip($("verified"), identities.verified ? "verified" : "NOT verified", identities.verified ? "good" : "bad");
  verdict(identities.verified ? "good" : "bad", identities.verified ? "Verified in this browser" : "NOT verified", identities.archiveFingerprint);
  $("fingerprint").textContent = identities.archiveFingerprint;
  $("limits").textContent = app.limits
    ? `request ${app.limits.request} bytes, response ${app.limits.response} bytes, guest ${app.limits.guestAllocation} bytes`
    : "unknown";

  $("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(identities.archiveFingerprint);
      $("copy").textContent = "Copied";
      setTimeout(() => ($("copy").textContent = "Copy"), 1500);
    } catch {
      $("copy").textContent = "Select it";
    }
  });

  for (const vector of app.vectors) {
    const row = document.createElement("tr");
    const request = document.createElement("td");
    const use = document.createElement("button");
    use.type = "button";
    use.className = "use";
    const text = show(vector.request);
    if (text.length > 48) {
      const shown = `${text.slice(0, 24)} … ${text.slice(-8)}`;
      use.textContent = shown;
      const note = document.createElement("div");
      note.className = "long";
      note.textContent = `${vector.request.length} bytes`;
      use.setAttribute("aria-label", `${shown}, ${vector.request.length} bytes`);
      request.append(use, note);
    } else {
      use.textContent = text === "" ? "(empty)" : text;
      request.append(use);
    }
    use.addEventListener("click", () => {
      $("request").value = text;
      $("request").focus();
    });
    const answer = document.createElement("td");
    const state = document.createElement("span");
    chip(state, show(vector.response), answerState(show(vector.response)));
    answer.append(state);
    row.append(request, answer);
    $("examples").append(row);
  }

  $("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const raw = $("request").value;
    $("echo").textContent = raw === "" ? "(empty)" : raw;
    try {
      const response = show(await app.dispatch(parse(raw)));
      chip($("response"), response, answerState(response));
    } catch (error) {
      chip($("response"), `dispatch failed: ${describe(error)}`, "bad");
    }
  });

  async function replay() {
    const button = $("replay");
    button.disabled = true;
    chip($("replayed"), "replaying", "wait");
    try {
      const result = await app.acceptance();
      chip($("replayed"), `${result.passed} of ${result.total} passed`, result.passed === result.total ? "good" : "bad");
    } catch (error) {
      chip($("replayed"), `failed: ${describe(error)}`, "bad");
    } finally {
      button.disabled = false;
    }
  }
  $("replay").addEventListener("click", replay);
  await replay();
}

main();
