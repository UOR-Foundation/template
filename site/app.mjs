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

// The top bar repeats the identity verdict as a shield in its state's
// colour. Its label says it in words, with the full fingerprint.
function trust(label, state, fingerprint = "") {
  const words = fingerprint ? `${label}, fingerprint ${fingerprint}` : label;
  $("trust").className = `chip chip-${state} trust`;
  $("trust").setAttribute("aria-label", words);
  $("trust").title = words;
}

// Sharing. On a phone the share button hands the page to the system's share
// sheet, which knows every app on the device. Elsewhere it opens the share
// panel: the card every platform will show, the link to copy, and one tap to
// X, LinkedIn, Facebook or email (and the system sheet, where there is one).
// Every link is the app's live URL, never the address it was opened from.
function share() {
  const { url, title, text } = data.share;
  const button = $("share");
  const panel = $("share-panel");
  const native = typeof navigator.share === "function";
  const popover = typeof panel.showPopover === "function";
  const phone = matchMedia("(pointer: coarse)").matches;

  const say = (words) => {
    $("bar-status").textContent = words;
    setTimeout(() => ($("bar-status").textContent = ""), 1600);
  };
  // True when the sheet shared or the visitor dismissed it; false when it failed.
  const sheet = async () => {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch (error) {
      return error?.name === "AbortError";
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  };
  // The tick on the share icon, when there is no panel to show it in.
  const flash = async () => {
    const copied = await copy();
    button.classList.toggle("copied", copied);
    button.title = copied ? "Link copied" : `Copy the link: ${url}`;
    say(button.title);
    setTimeout(() => {
      button.classList.remove("copied");
      button.title = "Share";
    }, 1600);
  };

  if ((phone && native) || !popover) {
    // The button no longer opens the panel; the sheet, or the clipboard, does it all.
    button.removeAttribute("popovertarget");
    button.addEventListener("click", async () => {
      if (native && (await sheet())) return;
      await flash();
    });
    return;
  }

  // The panel opens under the share button, its right edge on the button's,
  // and never closer than 16 px to either side of the window.
  panel.addEventListener("beforetoggle", (event) => {
    if (event.newState !== "open") return;
    const bar = document.querySelector(".topbar").getBoundingClientRect();
    const edge = button.getBoundingClientRect();
    const view = document.documentElement.clientWidth;
    const width = Math.min(23 * parseFloat(getComputedStyle(document.documentElement).fontSize), view - 32);
    const right = Math.max(16, Math.min(view - edge.right, view - width - 16));
    panel.style.setProperty("--share-top", `${Math.round(bar.bottom + 8)}px`);
    panel.style.setProperty("--share-right", `${Math.round(right)}px`);
    // The card is fetched the first time the panel opens, never with the page.
    if (!$("share-image").firstChild) {
      const image = new Image(1200, 630);
      image.src = "./og.png";
      image.alt = "";
      image.decoding = "async";
      $("share-image").append(image);
    }
  });

  $("share-copy").addEventListener("click", async () => {
    const copied = await copy();
    const control = $("share-copy");
    control.classList.toggle("copied", copied);
    $("share-copy-label").textContent = copied ? "Copied" : "Select the link";
    say(copied ? "Link copied" : "Copy failed; select the link");
    setTimeout(() => {
      control.classList.remove("copied");
      $("share-copy-label").textContent = "Copy link";
    }, 1600);
  });

  // A platform opens in a new tab; the panel closes behind it.
  for (const target of panel.querySelectorAll("a.share-target")) {
    target.addEventListener("click", () => panel.hidePopover());
  }

  if (native) {
    $("share-more-item").hidden = false;
    $("share-more").addEventListener("click", async () => {
      panel.hidePopover();
      if (!(await sheet())) await flash();
    });
  }
}

// The address bar, as an omnibox. It reads holo://name, this app's address.
// Focus it and it becomes a search over every Prism app Holo Search knows:
// type a name or a hash prefix, or paste a full address (a sha256 or blake3
// digest, an IPFS CID, a shared link), and Enter hands it to Holo Search,
// which fetches the app, checks the bytes against the address and replays
// its examples before it opens. This page never trusts the registry: it
// only suggests; Holo Search verifies. The registry is fetched the first
// time the bar is focused, never with the page.
const here = { fingerprint: "" };

function omnibox() {
  const form = $("address");
  const input = $("omnibox");
  const list = $("omnibox-list");
  const bar = document.querySelector(".topbar-inner");
  const shown = input.value;
  const slug = shown.replace(/^holo:\/\//, "");
  const name = document.title;
  const search = data.search;
  let index = null;
  let loading = null;
  let rows = [];
  let active = 0;

  const short = (hex) => (hex.length > 12 ? `${hex.slice(0, 8)}…${hex.slice(-4)}` : hex);
  const fold = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const load = () =>
    (loading ??= fetch(new URL("registry/index.json", search), { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : []))
      .then((entries) => (index = Array.isArray(entries) ? entries : []))
      .catch(() => (index = [])));

  // What was typed, without holo:// or the Holo Search link around it.
  const clean = (text) => {
    let query = text.trim();
    try {
      const link = new URL(query);
      if (link.href.startsWith(search) && link.searchParams.get("r")) query = link.searchParams.get("r");
    } catch {
      // Not a link.
    }
    return query.replace(/^holo:\/\//i, "").trim();
  };
  const address = (query) =>
    /^(sha256:|blake3:)?[0-9a-f]{8,64}$/i.test(query) || /^baf[a-z2-7]{20,}$/i.test(query) || /^https?:\/\//i.test(query);

  // The rows for what was typed: this app, the registry's apps that match by
  // name or hash prefix, and what was typed itself, as an address to open or
  // a search to run.
  function suggest(raw) {
    const query = raw === shown ? "" : clean(raw);
    const key = fold(query);
    const hex = query.replace(/^(sha256|blake3):/i, "").toLowerCase();
    const hashy = /^[0-9a-f]{4,64}$/.test(hex);
    const named = (text) => !key || fold(text).includes(key);
    const hashed = (digest) => hashy && Boolean(digest) && digest.startsWith(hex);
    const out = [];
    if (named(name) || named(slug) || hashed(here.fingerprint)) {
      const print = here.fingerprint ? ` · blake3:${short(here.fingerprint)}` : "";
      out.push({ kind: "self", title: name, sub: `holo://${slug}${print} · this app`, match: query });
    }
    // One row per app when matched by name, as Chrome shows a site once: its
    // holo first, then its model, then its image. A hash names one entry, so
    // a hash match shows exactly that one.
    const rank = { holo: 0, model: 1, image: 2 };
    const seen = new Map();
    let known = false;
    for (const entry of index ?? []) {
      if (entry.blake3 && entry.blake3 === here.fingerprint) continue;
      const byName = named(entry.module ?? "");
      const byHash = hashed(entry.sha256) || hashed(entry.blake3);
      if (query && !byName && !byHash) continue;
      const holo = Boolean(entry.blake3);
      const kind = holo ? "holo" : entry.kind === "image" ? "image" : "model";
      known ||= byHash;
      if (!byHash) {
        const kept = seen.get(fold(entry.module ?? ""));
        if (kept && rank[kept.kind] <= rank[kind]) continue;
        if (kept) out.splice(out.indexOf(kept), 1);
      }
      const row = {
        kind,
        title: entry.module ?? "Untitled",
        sub: `${holo ? `blake3:${short(entry.blake3)}` : `sha256:${short(entry.sha256)}`} · ${kind}`,
        target: holo ? `blake3:${entry.blake3}` : entry.sha256,
        match: byName ? query : "",
      };
      out.push(row);
      if (!byHash) seen.set(fold(entry.module ?? ""), row);
    }
    const top = out.slice(0, 6);
    // A digest keeps its algorithm and loses its middle; a long link its tail.
    const label = (text) => {
      const digest = text.match(/^((?:sha256|blake3):)?([0-9a-f]{13,})$/i);
      if (digest) return `${digest[1] ?? ""}${short(digest[2])}`;
      return text.length > 48 ? `${text.slice(0, 47)}…` : text;
    };
    const exact = hex.length === 64 && hex === here.fingerprint;
    // An address Holo Search must look up gets its own row; one the registry
    // already knows is that app's row.
    if (query && address(query) && !exact && !known) {
      top.unshift({ kind: "open", title: `Open ${label(query)}`, sub: "Fetched and verified in Holo Search", target: query });
    } else if (query && !exact && !known) {
      top.push({ kind: "search", title: query, sub: "Search Prism apps in Holo Search", target: query });
    }
    return top;
  }

  const icons = {
    self: '<path d="M12 3 4 6v6c0 4.6 3.4 8.4 8 9 4.6-.6 8-4.4 8-9V6z" /><path d="m8.5 12 2.5 2.5 4.5-5" />',
    holo: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" />',
    model: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" />',
    image: '<path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" />',
    open: '<path d="M5 12h14M13 6l6 6-6 6" />',
    search: '<circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" />',
  };

  // The title with what was typed in plain weight and the rest in bold, as
  // Chrome shows a completion. Every string from the registry goes in as text.
  const title = (text, match) => {
    const span = document.createElement("span");
    span.className = "opt-title";
    const bold = (part) => {
      const b = document.createElement("b");
      b.textContent = part;
      return b;
    };
    const at = match ? text.toLowerCase().indexOf(match.toLowerCase()) : -1;
    if (at < 0) span.append(bold(text));
    else span.append(bold(text.slice(0, at)), text.slice(at, at + match.length), bold(text.slice(at + match.length)));
    return span;
  };

  function render() {
    rows = suggest(input.value);
    active = Math.min(active, Math.max(rows.length - 1, 0));
    const items = rows.map((row, i) => {
      const li = document.createElement("li");
      li.id = `omnibox-${i}`;
      li.className = `opt opt-${row.kind}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === active));
      const icon = document.createElement("span");
      icon.className = "opt-icon";
      icon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">${icons[row.kind]}</svg>`;
      const text = document.createElement("span");
      text.className = "opt-text";
      const sub = document.createElement("span");
      sub.className = "opt-sub";
      sub.textContent = row.sub;
      text.append(title(row.title, row.match), sub);
      li.append(icon, text);
      li.addEventListener("pointerdown", (event) => event.preventDefault());
      li.addEventListener("pointermove", () => select(i));
      li.addEventListener("click", () => choose(row));
      return li;
    });
    if (!index) {
      const note = document.createElement("li");
      note.className = "opt-note";
      note.setAttribute("role", "presentation");
      note.textContent = "Loading Prism apps";
      items.push(note);
    }
    list.replaceChildren(...items);
    list.hidden = items.length === 0;
    input.setAttribute("aria-expanded", String(!list.hidden));
    if (rows.length) input.setAttribute("aria-activedescendant", `omnibox-${active}`);
    else input.removeAttribute("aria-activedescendant");
  }

  function select(i) {
    if (!rows.length) return;
    active = (i + rows.length) % rows.length;
    for (const li of list.querySelectorAll(".opt")) li.setAttribute("aria-selected", String(li.id === `omnibox-${active}`));
    input.setAttribute("aria-activedescendant", `omnibox-${active}`);
    $(`omnibox-${active}`)?.scrollIntoView({ block: "nearest" });
  }

  function close() {
    bar.classList.remove("editing");
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    input.value = shown;
    active = 0;
  }

  function choose(row) {
    if (row.kind === "self") {
      input.blur();
      close();
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
      return;
    }
    list.hidden = true;
    location.assign(`${search}?r=${encodeURIComponent(row.target)}`);
  }

  input.addEventListener("focus", () => {
    bar.classList.add("editing");
    input.select();
    active = 0;
    render();
    load().then(() => document.activeElement === input && render());
  });
  input.addEventListener("input", () => {
    active = 0;
    render();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (list.hidden) render();
      select(active + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (input.value !== shown) {
        input.value = shown;
        input.select();
        active = 0;
        render();
      } else {
        input.blur();
        close();
      }
    }
  });
  input.addEventListener("blur", close);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const row = rows[active] ?? rows[0];
    if (row) choose(row);
    else if (clean(input.value)) choose({ kind: "search", target: clean(input.value) });
  });
}

function theme() {
  const root = document.documentElement;
  const button = $("theme");
  const paint = () => {
    // The icon follows the html class in CSS; only the words change here.
    const label = `Switch to ${root.classList.contains("dark") ? "light" : "dark"} theme`;
    button.setAttribute("aria-label", label);
    button.title = label;
  };
  paint();
  button.addEventListener("click", () => {
    root.classList.toggle("dark");
    try {
      localStorage.setItem("prism-theme", root.classList.contains("dark") ? "dark" : "light");
    } catch {
      // A private window keeps no preference; the page still switches.
    }
    paint();
  });
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
  theme();
  share();
  omnibox();
  offline();

  let app;
  try {
    await afterFirstFrame();
    const { load } = await import("./vendor/prism-code/src/browser.mjs");
    app = await load("./app.holo");
  } catch (error) {
    chip($("verified"), `failed to load: ${describe(error)}`, "bad");
    chip($("replayed"), "no app", "bad");
    trust("The app failed to load", "bad");
    return;
  }

  const { identities } = app;
  chip($("verified"), identities.verified ? "verified" : "NOT verified", identities.verified ? "good" : "bad");
  trust(identities.verified ? "Verified in this browser" : "NOT verified", identities.verified ? "good" : "bad", identities.archiveFingerprint);
  here.fingerprint = identities.archiveFingerprint;
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
