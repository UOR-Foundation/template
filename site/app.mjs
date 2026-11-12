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

// The canonical <prism-frame>, run only if it matches the pointer's SHA-256.
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

// Heavy work waits for first contentful paint (or a timer), to keep LCP low.
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

// The holo loads and verifies on the first touch, key, scroll or focus, not
// on load, to keep the page within its size and blocking-time budget.
const firstIntent = () => new Promise((resolve) => {
  const events = ["pointerdown", "keydown", "touchstart", "wheel", "focusin"];
  const start = () => {
    for (const name of events) removeEventListener(name, start, true);
    removeEventListener("hashchange", start);
    resolve();
  };
  if (location.hash || $("input")?.value) return start();
  for (const name of events) addEventListener(name, start, { capture: true, passive: true });
  addEventListener("hashchange", start);
});

// The verified guest runs in a worker, so nothing blocks the page; without
// workers it runs here.
async function offThread(app) {
  if (typeof Worker !== "function") return app;
  const { resolveArchive } = await import("./vendor/prism-code/src/index.mjs");
  const wasm = resolveArchive(app.archive).guest.content;
  const worker = new Worker("./guest-worker.mjs", { type: "module" });
  const waiting = new Map();
  let next = 0;
  worker.onmessage = ({ data: reply }) => {
    const settle = waiting.get(reply.id);
    waiting.delete(reply.id);
    if (reply.ok) settle.resolve(reply.value);
    else settle.reject(new Error(reply.error));
  };
  // A crashed worker fails every call; the page falls back to the instance.
  worker.onerror = (event) => {
    event.preventDefault?.();
    for (const settle of waiting.values()) settle.reject(new Error("the guest worker failed"));
    waiting.clear();
  };
  const call = (kind, payload) => new Promise((resolve, reject) => {
    const id = next++;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, kind, ...payload });
  });
  try {
    await call("init", { wasm, limits: app.limits ?? {} });
  } catch {
    worker.terminate();
    return app;
  }
  return {
    dispatch: (request) => call("dispatch", { request }),
    acceptance: () => call("acceptance", { vectors: app.vectors }),
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

// The form, live from first paint; the answer shows under it with its state.
const STATES = { good: "Answer", bad: "Refused", refuse: "Not understood", wait: "Verifying", error: "Error" };
function workspace(ready) {
  const input = $("input");
  const form = $("ask");
  if (!input || !form) return;
  const out = $("out");
  const tag = $("state");
  const hist = $("hist");
  let seq = 0;
  let shown = 0;
  let last = "";
  let settled;
  ready.then((runner) => { settled = runner; }, () => { settled = null; });
  const links = data.answerLinks ?? {};
  // "key value" lines; answerLinks link a value.
  const line = (text) => {
    const row = document.createElement("li");
    const at = text.indexOf(" ");
    if (at <= 0) { row.textContent = text; return row; }
    const key = text.slice(0, at);
    const value = text.slice(at + 1);
    const k = document.createElement("span");
    k.className = "key";
    k.textContent = key.charAt(0).toUpperCase() + key.slice(1);
    let v;
    if (links[key] && /^[\w.:-]+$/.test(value)) {
      v = document.createElement("a");
      v.href = links[key].split("{}").join(encodeURIComponent(value));
    } else {
      v = document.createElement("span");
    }
    v.className = "val";
    v.textContent = value;
    row.append(k, v);
    return row;
  };
  const say = (state, text, lines) => {
    out.className = state;
    if (lines) {
      const list = document.createElement("ul");
      list.className = "lines";
      list.append(...lines.map(line));
      out.replaceChildren(list);
    } else {
      out.textContent = text;
    }
    // Counted, so a test can tell a new answer.
    if (state !== "idle" && state !== "wait") out.dataset.answers = String(++shown);
    tag.hidden = state === "idle";
    tag.className = `tag ${state}`;
    tag.textContent = STATES[state] ?? "";
    form.setAttribute("aria-busy", String(state === "wait"));
  };
  const remember = (text, response) => {
    if (!text || text === last) return;
    last = text;
    const row = document.createElement("li");
    const again = document.createElement("button");
    again.type = "button";
    again.className = "again";
    const req = document.createElement("span");
    req.textContent = text.length > 22 ? `${text.slice(0, 20)}…` : text;
    const t = document.createElement("span");
    t.className = `tag ${answerState(response)}`;
    t.textContent = STATES[answerState(response)] ?? "Answer";
    again.append(req, t);
    again.addEventListener("click", () => { input.value = text; answer(); });
    row.append(again);
    hist.prepend(row);
    while (hist.children.length > 30) hist.lastChild.remove();
  };
  async function answer() {
    const text = input.value;
    const n = ++seq;
    if (text.trim() === "") {
      say("refuse", `Type a ${(data.inputLabel || "request").toLowerCase()} first, or pick an example.`);
      input.focus({ preventScroll: true });
      return;
    }
    let runner = settled;
    if (runner === undefined) {
      say("wait", "Checking this app in your browser before it answers. This takes a moment, once.");
      runner = await ready;
      if (n !== seq) return;
    }
    if (!runner) {
      say("error", "This app could not be verified in your browser, so it will not answer. Reload the page to try again.");
      return;
    }
    let response;
    try {
      response = show(await runner.dispatch(parse(text)));
    } catch (error) {
      if (n !== seq) return;
      if (error?.message === "malformed hex") response = data.answers?.refusal ?? "invalid request";
      else {
        say("error", `The app could not run this request: ${describe(error)}`);
        return;
      }
    }
    if (n !== seq) return;
    const state = answerState(response);
    if (state === "refuse") say("refuse", `That is not a valid ${(data.inputLabel || "request").toLowerCase()}. Try one of the examples.`);
    else {
      const lines = response.split("\n").map((x) => x.trim()).filter(Boolean);
      say(state, response, lines.length ? lines : [response]);
    }
    remember(text, response);
  }
  form.addEventListener("submit", (event) => { event.preventDefault(); answer(); });
  input.addEventListener("input", () => { seq++; if (out.className !== "idle") say("idle", data.idle ?? ""); });
  for (const button of $("tries").querySelectorAll("button[data-request]")) {
    button.addEventListener("click", () => { input.value = button.dataset.request; answer(); });
  }
}

async function main() {
  // The stand-in bar is drawn; the live frame replaces it after first paint.
  afterFirstFrame().then(frame);
  offline();
  spec();

  let ready;
  const verified = new Promise((resolve) => { ready = resolve; });
  workspace(verified);

  let app;
  try {
    await afterFirstFrame();
    verdict("wait", "Verifies when you start");
    await firstIntent();
    verdict("wait", "Verifying in this browser");
    const { load } = await import("./vendor/prism-code/src/browser.mjs");
    app = await load("./app.holo");
  } catch (error) {
    verdict("bad", "The app failed to load");
    replayed("error");
    report({ error: `the app failed to load: ${describe(error)}` });
    ready(null);
    await card(null, "no app");
    return;
  }

  const { identities } = app;
  const runner = await offThread(app);
  const ok = identities.verified;
  verdict(ok ? "good" : "bad", ok ? "Verified in this browser" : "NOT verified", identities.archiveFingerprint);
  checked.fingerprint = identities.archiveFingerprint;
  ready(ok ? runner : null);
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
