// The Prism app page: verifies app.holo, answers as you type, replays its
// examples. page.mjs renders the text; this adds what the browser checks.

const $ = (id) => document.getElementById(id);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const describe = (error) => error?.code ?? error?.message ?? String(error);
const data = JSON.parse($("app-data").textContent);

const hex = (bytes) =>
  "hex:" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

// Text when plain UTF-8, else hex, so binary stays readable and reusable.
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

// The canonical <prism-frame>, run only if its bytes match the pointer's
// SHA-256, so a template change reaches every app and nothing stands in for
// it. ?frame=<sha256> pins one; offline, the service worker serves the last.
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

// The frame's shield: the verdict, and the replay ("passed/total").
function verdict(state, label, fingerprint = "") {
  const element = $("frame");
  element.setAttribute("verdict", state);
  element.setAttribute("verdict-label", label);
  if (fingerprint) element.setAttribute("fingerprint", fingerprint);
}
const replayed = (examples) => $("frame").setAttribute("examples", examples);

// The service worker, after load; an update reloads only when asked.
function offline() {
  const paint = () => ($("offline").hidden = navigator.onLine);
  paint();
  addEventListener("online", paint);
  addEventListener("offline", paint);
  if (!("serviceWorker" in navigator)) return;
  const register = () => navigator.serviceWorker.register("./sw.js").then((registration) => {
    // The first worker claims the page without a reload.
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

// An answer's meaning, from app.json ("*" ends a prefix).
const matches = (text, list) => (list ?? []).some((e) => (e.endsWith("*") ? text.startsWith(e.slice(0, -1)) : text === e));
function answerState(text) {
  if (matches(text, data.answers?.positive)) return "good";
  if (text === data.answers?.refusal) return "refuse";
  if (matches(text, data.answers?.negative)) return "bad";
  return "";
}

// The frame, runtime and holo wait for the first contentful paint (the fonts
// are optional, so the first frame may have no text): fetched earlier, they
// pushed every app's LCP past 1.5 s on a simulated phone. A background tab
// never paints, so a timer stands in.
const afterFirstFrame = () => new Promise((resolve) => {
  const after = () => requestAnimationFrame(() => setTimeout(resolve, 0));
  setTimeout(resolve, 1000);
  if (performance.getEntriesByName("first-contentful-paint").length) return after();
  try {
    const watch = new PerformanceObserver((list) => {
      if (!list.getEntriesByName("first-contentful-paint").length) return;
      watch.disconnect();
      after();
    });
    watch.observe({ type: "paint", buffered: true });
  } catch {
    after();
  }
});

// Verification belongs to the worker too: loading a large model can block
// the UI before the guest ever runs. Only unavailable/broken worker transport
// falls back to the same fully verified runtime on the page. A runtime refusal
// is final, not evidence that workers are unavailable.
async function offThread(source) {
  const onPage = async () => {
    const { load } = await import("./vendor/prism-code/src/browser.mjs");
    return load(source);
  };
  if (typeof Worker !== "function") return onPage();
  let worker;
  try {
    worker = new Worker("./guest-worker.mjs", { type: "module" });
  } catch {
    return onPage();
  }
  const waiting = new Map();
  let next = 0;
  let failure = null;
  const stop = () => {
    failure ??= Object.assign(new Error("the guest worker failed"), { code: "frame.worker" });
    worker.terminate();
    for (const settle of waiting.values()) settle.reject(failure);
    waiting.clear();
  };
  worker.onmessage = ({ data: reply }) => {
    const settle = waiting.get(reply?.id);
    if (!settle || typeof reply.ok !== "boolean") { stop(); return; }
    waiting.delete(reply.id);
    if (reply.ok) settle.resolve(reply.value);
    else settle.reject(Object.assign(new Error(reply.error), { code: reply.code, runtimeRefusal: true }));
  };
  worker.onerror = (event) => { event.preventDefault?.(); stop(); };
  worker.onmessageerror = stop;
  const call = (kind, payload = {}) => new Promise((resolve, reject) => {
    if (failure) { reject(failure); return; }
    const id = next++;
    waiting.set(id, { resolve, reject });
    try { worker.postMessage({ id, kind, ...payload }); } catch { stop(); }
  });
  let identities;
  try {
    identities = await call("init", { source });
  } catch (error) {
    worker.terminate();
    if (error.runtimeRefusal) throw error;
    return onPage();
  }
  return {
    identities,
    dispatch: (request) => call("dispatch", { request }),
    acceptance: () => call("acceptance"),
  };
}

// The app's own card.mjs gets the verified instance, or null and the reason.
async function card(runner, reason) {
  if (!data.card) return;
  try {
    const { default: start } = await import("./card.mjs");
    await start({ app: runner, reason, $, chip, show, parse });
  } catch (error) {
    console.error("card:", error);
  }
}

// The spec opens beside the window (the frame reads --prism-aside); #spec,
// "." and Escape open and close it. Its content (spec.mjs) loads on first open.
const checked = { fingerprint: "", result: null };
let specModule = null;
function spec() {
  const root = document.documentElement;
  const aside = $("spec");
  const link = $("open-spec");
  let loading = null;
  const set = (open, focus = true) => {
    root.classList.toggle("spec-open", open);
    aside.inert = !open;
    link.setAttribute("aria-expanded", String(open));
    if (open && location.hash !== "#spec") history.replaceState(null, "", "#spec");
    if (!open && location.hash === "#spec") history.replaceState(null, "", location.pathname + location.search);
    if (focus) (open ? aside : link).focus({ preventScroll: true });
    loading ??= open ? import("./spec.mjs").then(async (module) => {
      await module.mount($("spec-body"), checked);
      specModule = module;
    }).catch((error) => {
      loading = null;
      $("spec-body").textContent = `The spec could not load: ${describe(error)}`;
    }) : null;
  };
  link.addEventListener("click", (event) => { event.preventDefault(); set(true); });
  $("close-spec").addEventListener("click", () => set(false));
  addEventListener("hashchange", () => set(location.hash === "#spec"));
  addEventListener("keydown", (event) => {
    if (event.key === "Escape" && root.classList.contains("spec-open")) set(false);
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "");
    if (event.key === "." && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) set(!root.classList.contains("spec-open"));
  });
  if (location.hash === "#spec") set(true, false);
}
const report = (result) => {
  checked.result = result;
  specModule?.apply(checked);
};

// Answer as the visitor types; keep a request once they pause, press Enter or pick one.
function workspace(runner) {
  const input = $("input");
  if (!input) return;
  const out = $("out");
  const hist = $("hist");
  const size = () => input.style.setProperty("--chars", String(Math.max((input.value || input.placeholder).length, 4)));
  let seq = 0;
  let settle = 0;
  let last = "";
  const remember = (text, response) => {
    if (!text || text === last) return;
    last = text;
    const row = document.createElement("li");
    const again = document.createElement("button");
    again.type = "button";
    again.className = "again";
    const req = document.createElement("span");
    req.textContent = text.length > 22 ? `${text.slice(0, 20)}…` : text;
    const tag = document.createElement("span");
    tag.className = `tag ${answerState(response)}`;
    tag.textContent = response.length > 18 ? `${response.length} bytes` : response;
    again.append(req, tag);
    again.addEventListener("click", () => { input.value = text; answer(true); input.focus(); });
    row.append(again);
    hist.prepend(row);
    while (hist.children.length > 30) hist.lastChild.remove();
  };
  async function answer(commit = false) {
    const text = input.value;
    const n = ++seq;
    size();
    clearTimeout(settle);
    if (text === "") {
      out.textContent = "—";
      out.className = "idle";
      return;
    }
    if (!runner) return;
    let response;
    try {
      response = show(await runner.dispatch(parse(text)));
    } catch (error) {
      response = error?.message === "malformed hex" ? data.answers?.refusal ?? "invalid request" : `dispatch failed: ${describe(error)}`;
    }
    if (n !== seq) return;
    const state = answerState(response);
    out.textContent = state === "refuse" ? `Not a valid ${(data.inputLabel || "request").toLowerCase()}` : response.charAt(0).toUpperCase() + response.slice(1);
    out.className = state;
    if (commit) remember(text, response);
    else settle = setTimeout(() => remember(text, response), 900);
  }
  input.addEventListener("input", () => answer());
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") answer(true); });
  for (const button of $("tries").querySelectorAll("button[data-request]")) {
    button.addEventListener("click", () => { input.value = button.dataset.request; answer(true); input.focus({ preventScroll: true }); });
  }
  size();
  if (input.value) answer();
}

async function main() {
  // The stand-in bar is drawn; the live frame replaces it after first paint.
  afterFirstFrame().then(frame);
  offline();
  spec();

  let app;
  try {
    await afterFirstFrame();
    app = await offThread(new URL("./app.holo", document.baseURI).href);
  } catch (error) {
    verdict("bad", "The app failed to load");
    replayed("error");
    report({ error: `the app failed to load: ${describe(error)}` });
    await card(null, "no app");
    return;
  }

  const { identities } = app;
  const runner = app;
  const ok = identities.verified;
  verdict(ok ? "good" : "bad", ok ? "Verified in this browser" : "NOT verified", identities.archiveFingerprint);
  checked.fingerprint = identities.archiveFingerprint;
  workspace(ok ? runner : null);
  card(ok ? runner : null, ok ? "" : "not verified");
  if (!ok) {
    replayed("error");
    report({ error: "not verified: nothing replays" });
    return;
  }

  // The replay feeds the shield and marks each example in the spec.
  replayed("running");
  try {
    const result = await runner.acceptance();
    replayed(`${result.passed}/${result.total}`);
    report({ total: result.total, passed: result.passed, failed: (result.failed ?? []).map((f) => f.index) });
  } catch (error) {
    replayed("error");
    report({ error: `failed: ${describe(error)}` });
  }
}

main();
