// What the bar needs only once the visitor moves: every panel's styles
// (frame/panels.css), the theme panel, and the immersive photos (the nine
// built in, any other found on Unsplash, each fetched once and kept).
// frame/publish.mjs publishes it beside the frame, named by its SHA-256,
// and writes that hash into the frame, which fetches it after the visitor's
// first move, checks it and imports it: the page's first load carries none
// of it.
const CSS = "/*PANELS_CSS*/";
export const sheet = typeof CSSStyleSheet === "function" ? new CSSStyleSheet() : null;
sheet?.replaceSync(CSS);

const UNSPLASH = "utm_source=prism&utm_medium=referral";
const UNSPLASH_PROXY = "https://prism-unsplash.trinity-03d.workers.dev/";
const FRAME_HOST = "https://uor-foundation.github.io/template/frame/";
const BACKDROPS = [
  {
    id: "E0AHdsENmDg",
    image: "https://images.unsplash.com/photo-1464802686167-b939a6910659?ixid=M3w4OTc5NTl8MHwxfHNlYXJjaHwxfHxzcGFjZXxlbnwxfDB8fHwxNzk0MDU1OTU2fDA&ixlib=rb-4.1.0",
    color: "#0c2659",
    alt: "The Milky Way in blue and violet",
    name: "Jeremy Thomas",
    user: "jeremythomasphoto",
    page: "https://unsplash.com/photos/blue-and-purple-galaxy-digital-wallpaper-E0AHdsENmDg",
  },
  {
    id: "qtRF_RxCAo0",
    image: "https://images.unsplash.com/photo-1610296669228-602fa827fc1f?ixid=M3w4OTc5NTl8MHwxfHNlYXJjaHw0fHxzcGFjZXxlbnwxfDB8fHwxNzk0MDU1OTU2fDA&ixlib=rb-4.1.0",
    color: "#262626",
    alt: "A nebula in blue, gold and rust",
    name: "Aldebaran S",
    user: "aldebarans",
    page: "https://unsplash.com/photos/blue-and-black-galaxy-digital-wallpaper-qtRF_RxCAo0",
  },
  {
    id: "RF4p4rTM-2s",
    image: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?ixid=M3w4OTc5NTl8MHwxfHNlYXJjaHw1fHxtaWxreSUyMHdheXxlbnwxfDB8fHwxNzk0MDU2MjUxfDA&ixlib=rb-4.1.0",
    color: "#262626",
    alt: "The Andromeda galaxy among stars",
    name: "Bryan Goff",
    user: "bryangoffphoto",
    page: "https://unsplash.com/photos/galaxy-with-starry-night-RF4p4rTM-2s",
  },
  {
    id: "Q1p7bh3SHj8",
    image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?ixid=M3w4OTc5NTl8MHwxfHNlYXJjaHw1fHxzcGFjZXxlbnwxfDB8fHwxNzk0MDU1OTU2fDA&ixlib=rb-4.1.0",
    color: "#0c2626",
    alt: "City lights across Earth at night, from orbit",
    name: "NASA",
    user: "nasa",
    page: "https://unsplash.com/photos/photo-of-outer-space-Q1p7bh3SHj8",
  },
  {
    id: "t7EL2iG3jMc",
    image: "https://images.unsplash.com/photo-1534996858221-380b92700493?ixid=M3w4OTc5NTl8MHwxfHNlYXJjaHw5fHxzcGFjZXxlbnwxfDB8fHwxNzk0MDU1OTU2fDA&ixlib=rb-4.1.0",
    color: "#59598c",
    alt: "Earth's blue horizon against space",
    name: "ActionVance",
    user: "actionvance",
    page: "https://unsplash.com/photos/outer-space-photography-of-earth-t7EL2iG3jMc",
  },
  {
    id: "9wH624ALFQA",
    image: "https://images.unsplash.com/photo-1515705576963-95cad62945b6?ixid=M3w4OTc5NTl8MHwxfHNlYXJjaHwxfHxtaWxreSUyMHdheXxlbnwxfDB8fHwxNzk0MDU2MjUxfDA&ixlib=rb-4.1.0",
    color: "#0c2640",
    alt: "The Milky Way rising over mountains",
    name: "Dns Dgn",
    user: "dnsdgn",
    page: "https://unsplash.com/photos/milky-way-on-mountains-9wH624ALFQA",
  },
  {
    id: "oMcTmNHclZI",
    image: "https://images.unsplash.com/photo-1628818144466-856f7d477125?ixid=M3w4OTc5NTl8MHwxfGFsbHx8fHx8fHx8fDE3OTQwNTIyMTV8&ixlib=rb-4.1.0",
    color: "#0c2626",
    alt: "Green and violet aurora over a starry sky",
    name: "Condor Wei",
    user: "cwcanchn",
    page: "https://unsplash.com/photos/aurora-borealis-in-starry-night-sky-oMcTmNHclZI",
  },
  {
    id: "cZgVpseeazg",
    image: "https://images.unsplash.com/photo-1545431766-45ff67845191?ixid=M3w4OTc5NTl8MHwxfGFsbHx8fHx8fHx8fDE3OTQwNTIyMTB8&ixlib=rb-4.1.0",
    color: "#26260c",
    alt: "A soft blur of rainbow light",
    name: "Sean Sinclair",
    user: "seanwsinclair",
    page: "https://unsplash.com/photos/abstract-rainbow-color-blur-cZgVpseeazg",
  },
  {
    id: "0wFwSZn6I-I",
    image: "https://images.unsplash.com/photo-1709625862266-014ef072fd93?ixid=M3w4OTc5NTl8MHwxfGFsbHx8fHx8fHx8fDE3OTQwNTIyMTJ8&ixlib=rb-4.1.0",
    color: "#262626",
    alt: "Dark curved forms in soft light",
    name: "Pawel Czerwinski",
    user: "pawel_czerwinski",
    page: "https://unsplash.com/photos/a-black-and-white-photo-of-a-curved-object-0wFwSZn6I-I",
  },
];
// A photo as a data: URL. Every page the frame runs on may show data:
// images, while most may show no image from elsewhere. A built-in photo is
// fetched from the frame's own host, which every app page's connect-src
// names, so it works in every Prism app and in Holo Search, unrebuilt; any
// other comes through the worker. Each is fetched once per page, and only
// once it is to be shown.
//
// Never with the page, though: a visitor who chose immersive gets it on every
// load, and an app's Lighthouse budget allows two third-party requests, which the
// frame's pointer and module take. A photo shown before comes from this
// origin's cache at once, with no request; a new one waits for the
// visitor's first move (a pointer, a touch, a key, a scroll), as the stars
// and the Prism index do, and its ground is the photo's colour until then.
// The cache is not named prism-*: those are the app's service worker's.
const SHOWN = "holo-backdrops";
const KEPT = 4;
const shownBefore = async (url) => {
  try {
    return (await (await caches.open(SHOWN)).match(url)) ?? null;
  } catch {
    return null; // No Cache API here (an insecure origin): fetched as new.
  }
};
// The last few photos shown, and no more: each is a few hundred kilobytes.
const keep = async (url, response) => {
  try {
    const cache = await caches.open(SHOWN);
    await cache.put(url, response);
    const kept = await cache.keys();
    for (const old of kept.slice(0, Math.max(0, kept.length - KEPT))) await cache.delete(old);
  } catch {
    // Kept for this page only.
  }
};
const pictures = new Map();
const picture = (url, { thumb = false } = {}) => {
  if (!pictures.has(url)) {
    const loading = (async () => {
      // A thumbnail is asked for only by the open panel, after a move.
      let response = thumb ? null : await shownBefore(url);
      if (!response) {
        response = await fetch(url);
        if (!response.ok) throw new Error(`backdrop: HTTP ${response.status}`);
        if (!thumb) keep(url, response.clone());
      }
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    })();
    // A failed fetch is tried again the next time the photo is wanted.
    loading.catch(() => pictures.delete(url));
    pictures.set(url, loading);
  }
  return pictures.get(url);
};
const builtIn = (photo) => BACKDROPS.some((p) => p.id === photo.id);
const pictureOf = (photo, thumb = false) =>
  picture(
    builtIn(photo)
      ? new URL(`backdrops/${photo.id}${thumb ? "-thumb" : ""}.jpg`, FRAME_HOST).href
      : `${UNSPLASH_PROXY}image?${new URLSearchParams(thumb ? { src: photo.image, w: "240", h: "150" } : { src: photo.image, w: "2400" })}`,
    { thumb },
  );
// Search is offered where the page lets the frame reach the worker: a page
// whose policy names it (every app page built from this template) or one
// with no policy (Holo Search).
const searchable = () => {
  const policy = document.querySelector('meta[http-equiv="Content-Security-Policy" i]')?.content ?? "";
  const rule = /(?:^|;)\s*connect-src\s([^;]*)/i.exec(policy) ?? /(?:^|;)\s*default-src\s([^;]*)/i.exec(policy);
  if (!rule) return true;
  const origin = new URL(UNSPLASH_PROXY).origin;
  return rule[1].trim().split(/\s+/).some((source) => source === "*" || source.replace(/\/$/, "") === origin);
};

// The photo in use: a built-in one, one found and chosen before, or, where
// the browser keeps nothing (a private window), the one chosen this visit.
export function current(frame, core) {
  const { photo: id, recent } = core.storedTheme();
  const wanted = id ?? frame.chosen?.id;
  return [...BACKDROPS, ...recent, frame.chosen].find((p) => p && p.id === wanted) ?? BACKDROPS[0];
}

// The photo behind the page, and the panel's pressed photo and credit.
export function paint(frame, core) {
  const mode = frame.mode();
  // A photo found through the worker shows only where the page lets the
  // frame reach it; elsewhere (an app built before) the first built-in one.
  const chosen = current(frame, core);
  const shown = builtIn(chosen) || searchable() ? chosen : BACKDROPS[0];
  const root = document.documentElement;
  if (mode === "immersive") {
    root.style.setProperty("--prism-backdrop-color", shown.color);
    if (frame.backdrop !== shown.id) {
      frame.backdrop = shown.id;
      // Until it arrives, or if it cannot, the photo's own colour is the ground.
      pictureOf(shown)
        .then((url) => {
          if (frame.backdrop === shown.id) root.style.setProperty("--prism-backdrop", `url("${url}")`);
        })
        .catch(() => {
          // Not shown, so the next paint (a click, a reload) asks again.
          if (frame.backdrop === shown.id) frame.backdrop = null;
        });
    }
  }
  for (const choice of frame.shadowRoot.querySelectorAll(".mode")) choice.setAttribute("aria-pressed", String(choice.dataset.mode === mode));
  for (const choice of frame.shadowRoot.querySelectorAll("button.photo-pick")) choice.setAttribute("aria-pressed", String(choice.dataset.photo === shown.id));
  const credit = frame.$("credit-name");
  if (!credit) return;
  credit.textContent = shown.name;
  credit.href = `https://unsplash.com/@${shown.user}?${UNSPLASH}`;
}

// The panel's photos and search, wired to this render of the frame.
export function panel(frame, core) {
  for (const choice of frame.$("theme-panel").querySelectorAll(".mode")) {
    choice.addEventListener("click", () => frame.setTheme(choice.dataset.mode));
  }
  const grid = frame.$("photos");
  const note = frame.$("photos-note");
  const more = frame.$("photos-more");
  const find = frame.$("find");
  const input = frame.$("find-input");
  find.hidden = !searchable();
  let query = "";
  let page = 1;
  let asking = null;
  let timer = 0;

  // A photo's tile: its colour at once, the photo fading in over it.
  const tile = (photo) => {
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "photo-pick";
    pick.dataset.photo = photo.id;
    const words = `${photo.alt || "Photo"}, by ${photo.name}`;
    pick.setAttribute("aria-label", words);
    pick.title = words;
    pick.setAttribute("aria-pressed", String(photo.id === current(frame, core).id));
    pick.style.backgroundColor = photo.color;
    const img = new Image(240, 150);
    img.alt = "";
    img.decoding = "async";
    img.addEventListener("load", () => pick.classList.add("ready"), { once: true });
    pictureOf(photo, true).then((url) => (img.src = url)).catch(() => {});
    pick.append(img);
    pick.addEventListener("click", () => {
      frame.setTheme("immersive", photo);
      // Unsplash is told once a photo it found is put to use.
      if (!builtIn(photo)) fetch(`${UNSPLASH_PROXY}use?id=${encodeURIComponent(photo.id)}`, { method: "POST" }).catch(() => {});
    });
    return pick;
  };
  const unique = (photos) => photos.filter((photo, i) => photos.findIndex((p) => p.id === photo.id) === i);
  const say = (words) => {
    note.textContent = words;
    note.hidden = !words;
  };
  // Nine, as a search shows: the recent ones first, then the built-in
  // ones, never leaving out the photo in use.
  const home = () => {
    const chosen = frame.chosen && !builtIn(frame.chosen) ? [frame.chosen] : [];
    const all = unique([...chosen, ...core.storedTheme().recent, ...BACKDROPS]);
    const shown = all.slice(0, 9);
    const inUse = current(frame, core);
    if (!shown.some((p) => p.id === inUse.id)) shown[shown.length - 1] = inUse;
    grid.replaceChildren(...shown.map(tile));
    more.hidden = true;
    say("");
  };
  const skeleton = () =>
    grid.replaceChildren(...Array.from({ length: 9 }, () => {
      const blank = document.createElement("span");
      blank.className = "photo-pick blank";
      return blank;
    }));
  const settle = (control) => {
    if (asking !== control) return;
    find.classList.remove("busy");
    grid.setAttribute("aria-busy", "false");
  };
  async function ask(words, next = 0) {
    asking?.abort();
    const control = (asking = new AbortController());
    find.classList.add("busy");
    grid.setAttribute("aria-busy", "true");
    if (!next) {
      skeleton();
      more.hidden = true;
      say("");
    }
    let status = 0;
    try {
      const response = await fetch(`${UNSPLASH_PROXY}search?${new URLSearchParams({ q: words, page: String(next || 1) })}`, { signal: control.signal });
      status = response.status;
      const found = await response.json();
      if (!response.ok) throw new Error(found.error ?? `HTTP ${status}`);
      const photos = (Array.isArray(found.photos) ? found.photos : []).map(core.photoOf).filter(Boolean);
      page = found.page ?? 1;
      if (next) grid.append(...photos.map(tile));
      else grid.replaceChildren(...photos.map(tile));
      more.hidden = !found.more || !photos.length;
      if (!next && !photos.length) say(`No photos for “${words}”`);
    } catch (error) {
      if (error.name === "AbortError") return;
      if (!next) home();
      say(status === 429 ? "Unsplash needs a short rest. Try again soon." : "Search isn’t available right now.");
    } finally {
      settle(control);
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const words = input.value.trim();
    if (words === query) return;
    query = words;
    if (!words) {
      asking?.abort();
      settle(asking);
      home();
      return;
    }
    timer = setTimeout(() => ask(words), 280);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      clearTimeout(timer);
      if (query) ask(query);
    } else if (event.key === "Escape" && input.value) {
      // The first Escape clears the search; the next closes the panel.
      event.preventDefault();
      event.stopPropagation();
      input.value = "";
      input.dispatchEvent(new Event("input"));
    }
  });
  more.addEventListener("click", () => query && ask(query, page + 1));
  return { open: () => query || home() };
}

// Prism ids (prism/identity/4, identity/PROTOCOL.md). A visitor's Prism id
// is stitch's Prism id (afflom/stitch, pinned in identity/stitch.lock): the
// κ of its genesis, held by devices whose keys never leave them. Each app's
// origin keeps its own device of the id, made here with no prompt; another
// device or app joins the same id by stitch's link offer, confirmed with a
// six-digit code, and a recovery kit brings it back after every device is
// lost. Devices meet on stitch's substrate (its relay), so nothing here
// needs a server of Prism's own.
//
// Signing in is the device signing one action for this app,
// "prism/session/1", which lets a session key made here act for the id on
// this origin until it expires. verifySession checks that action against the
// id's log with Prism id's own verifyAction, here and for anyone the app
// shows a signature to. A failed check is an IdentityError naming which.
const SESSION_ACTION = "prism/session/1";
const MAX_SESSION_MS = 8 * 24 * 60 * 60 * 1000;
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export class IdentityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IdentityError";
    this.code = code;
  }
}
const deny = (code, message) => {
  throw new IdentityError(code, message);
};

// Prism id itself (identity/prism-id.mjs), published beside the frame and
// named by its SHA-256, which frame/publish.mjs writes here. It is fetched
// when the visitor reaches for the account icon, and checked as the frame
// checks this module. Unpublished (tests, a checkout), it is read from the
// repository.
const PRISM_ID = "/*PRISM_ID*/";
let prismModule = null;
export const prismId = () =>
  (prismModule ??= (async () => {
    if (!/^[0-9a-f]{64}$/.test(PRISM_ID)) return import("../identity/prism-id.mjs");
    const bytes = await (await fetch(new URL(`${PRISM_ID}/prism-id.mjs`, FRAME_HOST))).arrayBuffer();
    const hex = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
    if (hex !== PRISM_ID) throw new Error("Prism id is not the module this frame names");
    const url = URL.createObjectURL(new Blob([bytes], { type: "text/javascript" }));
    try {
      return await import(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  })().catch((error) => {
    prismModule = null;
    throw error;
  }));

// A session: { app, envelope, records }. The envelope is the id's
// "prism/session/1" action for `app`, naming the session key and its expiry;
// records are the id's log as the signing device knew it. `fresh` is the
// window in which it must be checked after signing (Prism id's actionFresh);
// anyone checking a kept session later checks it as of its own signing
// (fresh: 0), and its expiry bounds it.
export async function verifySession(session, { now = Date.now(), fresh = 60000, hear = true } = {}) {
  const Prism = await prismId();
  const { app, envelope, records } = session ?? {};
  const body = envelope?.body;
  if (typeof app !== "string" || !/^https?:\/\/[^/]+$/.test(app)) deny("app", "The session names no app");
  if (body?.action !== SESSION_ACTION) deny("action", "The signature is not a session");
  const { sessionKey, expires } = body.payload ?? {};
  if (typeof sessionKey !== "string" || !/^[\w-]{87}$/.test(sessionKey)) deny("key", "The session key is malformed");
  if (!Number.isSafeInteger(expires) || expires <= now) deny("expired", "The session has expired");
  if (expires > body.at + MAX_SESSION_MS) deny("expired", "The session lasts too long");
  let log;
  try {
    log = await Prism.logFromRecords(records);
  } catch (error) {
    if (error instanceof Prism.PrismIdError) deny("log", "The log does not parse");
    throw error;
  }
  const at = fresh ? now : body.at;
  let verdict;
  try {
    // With the relay known, also hear removals the signing device did not
    // present (the id's public log). `hear: false` is for the device that
    // just made the id: nothing about it can be on the relay yet.
    verdict = await Prism.verifyAction(body.prism, log, envelope, { audience: app, now: at, window: fresh || 1, ...(relay && hear ? { bus: bus(Prism) } : {}) });
  } catch (error) {
    if (error instanceof Prism.PrismIdError) deny("log", `The log does not resolve: ${error.message}`);
    throw error;
  }
  if (!verdict.allowed) deny(verdict.reason === "scope" ? "scope" : "signature", `The session was refused (${verdict.reason})`);
  return { account: body.prism, key: envelope.signer, sessionKey, expires };
}

// ---------------------------------------------------------------- this origin's device

// The device and its view of the id, in this origin's IndexedDB. IndexedDB
// keeps CryptoKeys as they are: a non-extractable key stays one.
function deviceStore(mode, work) {
  return new Promise((done, fail) => {
    const open = indexedDB.open("prism-id", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("prism");
    open.onerror = () => fail(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("prism", mode);
      const request = work(tx.objectStore("prism"));
      tx.oncomplete = () => (open.result.close(), done(request?.result));
      tx.onerror = () => (open.result.close(), fail(tx.error));
    };
  });
}
export const loadDevice = () => deviceStore("readonly", (s) => s.get("self")).catch(() => null);
const saveDevice = (held) => deviceStore("readwrite", (s) => s.put(held, "self"));
const forgetDevice = () => deviceStore("readwrite", (s) => s.delete("self"));
const loadKit = () => deviceStore("readonly", (s) => s.get("kit")).catch(() => null);
const saveKit = (kit) => deviceStore("readwrite", (s) => s.put(kit, "kit"));
const forgetKit = () => deviceStore("readwrite", (s) => s.delete("kit"));

// The bus to the id's other devices: stitch's relay (the frame's
// PRISM_RELAY), which the page's connect-src must name; the page build reads
// it from the frame. A page that does not admit it keeps the id on this
// device: the id, its session and recovery work, linking and syncing wait.
let relay = null;
let relayBus = null;
const relayAdmitted = (origin) => {
  const policy = [...document.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]')].map((meta) => meta.content).join(";");
  const connect = /(?:^|;)\s*connect-src([^;]*)/.exec(policy)?.[1] ?? /(?:^|;)\s*default-src([^;]*)/.exec(policy)?.[1];
  return connect === undefined || connect.includes(origin);
};
const bus = (Prism) => (relayBus ??= Prism.createRelayBus({ relay: relay && relayAdmitted(new URL(relay).origin) ? relay : null }));

// Share this device's log with the id's other devices, under every boundary
// key it holds, so a device that has not taken up a rotation still hears,
// and publish its public records where apps hear removals.
async function share(Prism, held) {
  for (const keyId of held.keyring.keys()) await Prism.publishSync(held, bus(Prism), { keyId }).catch(() => {});
  await Prism.publishLog(held, bus(Prism)).catch(() => {});
}
// Take in what the other devices shared. A message that does not open or
// resolve is someone else's or stale: it is skipped, never trusted.
async function pull(Prism, held) {
  for (const keyId of [...held.keyring.keys()]) {
    const topic = await Prism.syncTopic(held, keyId).catch(() => null);
    if (!topic) continue;
    for (const bytes of await bus(Prism).retained(topic).catch(() => [])) {
      try {
        held = await Prism.receiveSync(held, bytes);
      } catch (error) {
        if (!(error instanceof Prism.PrismIdError) && !(error instanceof DOMException) && !(error instanceof SyntaxError)) throw error;
      }
    }
  }
  return held;
}
// The id's log as apps see it: this device's, with what the public log holds.
// `own`: the log is this device's, so a heard record that would fork it (an
// old recovery kit replayed) is refused, as stitch's admitRecords does.
const heard = (Prism, held, own = true) => Prism.heardLog(held.prism, held.log, bus(Prism), { own }).catch(() => held.log);

// A recovery kit: the paper share of the id's recovery device (stitch's
// threshold recovery, one share of one) and the id's log. It is as secret as
// the id: whoever holds it can take the id over.
const KIT = "prism/recovery-kit/1";
const ONE_PAPER_SHARE = { threshold: 1, guardians: [{ paper: true }] };
const kitOf = (held, share) => ({ kind: KIT, prism: held.prism, share, records: [...held.log.values()] });

// A QR code as one SVG path, with its four-module quiet zone.
function drawQr(svg, { size, modules }) {
  let d = "";
  modules.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x + 4} ${y + 4}h1v1h-1z`)));
  svg.setAttribute("viewBox", `0 0 ${size + 8} ${size + 8}`);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  svg.replaceChildren(path);
}

const json = (value) => new TextEncoder().encode(JSON.stringify(value));
const parse = (bytes) => JSON.parse(new TextDecoder().decode(bytes));
const short = (id) => `${id.slice(0, 15)}…${id.slice(-4)}`;
const sentence = (text) => (text ? text[0].toUpperCase() + text.slice(1) + (/[.!?]$/.test(text) ? "" : ".") : text);
const KIND_LABEL = { browser: "Browser", native: "App", mobile: "Phone", embedded: "Device", recovery: "Recovery kit" };

const ACCOUNT_PANEL = `
<button class="account-close" type="button" popovertarget="account-panel" popovertargetaction="hide" aria-label="Close"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
<h2 id="account-title" class="account-title">Prism id</h2>
<p id="account-sub" class="account-sub"></p>
<div id="account-view-held" class="account-in" hidden>
  <p class="account-id"><code id="account-id"></code><button id="account-copy" class="text" type="button">Copy</button></p>
  <button id="account-kit-save" class="primary" type="button" hidden>Save recovery kit</button>
  <button id="account-link" class="row" type="button">Add a device or app</button>
  <button id="account-devices" class="row" type="button">Devices</button>
  <button id="account-join" class="row" type="button">Use my Prism id from another device or app</button>
  <button id="account-recover" class="row" type="button">Use a recovery kit</button>
</div>
<div id="account-view-offer" class="account-in" hidden>
  <p>On a phone, scan this code. On another app or computer, open the person icon, choose <b>Use my Prism id from another device or app</b>, and paste the link. It works once, for five minutes.</p>
  <svg id="account-qr" class="account-qr" role="img" aria-label="QR code of the link"></svg>
  <p class="account-id"><code id="account-offer"></code><button id="account-offer-copy" class="text" type="button">Copy</button></p>
  <label id="account-confirm" hidden>Type the code the new device shows <input id="account-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" /></label>
  <button id="account-accept" class="primary" type="button" hidden>Add it</button>
</div>
<div id="account-view-join" class="account-in" hidden>
  <p>On a device or app that has your Prism id, open the person icon, choose <b>Add a device or app</b>, and paste its link here.</p>
  <input id="account-uri" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Link from your other device" />
  <button id="account-join-go" class="primary" type="button">Join</button>
  <p id="account-join-code" class="account-code" hidden></p>
</div>
<div id="account-view-recover" class="account-in" hidden>
  <p>Choose the recovery kit you saved. This browser becomes your Prism id's device, every other device is removed, and you get a new kit to save.</p>
  <input id="account-kit-file" type="file" accept=".json,application/json" aria-label="Recovery kit" />
</div>
<div id="account-view-devices" class="account-in" hidden>
  <ul id="account-device-list" class="account-devices"></ul>
</div>
<p id="account-error" class="account-error" role="alert" hidden></p>
<button id="account-back" class="row" type="button" hidden>Back</button>
`;

const TITLES = {
  held: ["Prism id", "Every Prism app knows you by it. There is nothing to sign in to."],
  kit: ["Prism id", "Save your recovery kit: if you lose every device, it brings your id back. Anyone holding it can take your id, so keep it offline."],
  offer: ["Add a device or app", ""],
  join: ["Use your Prism id here", ""],
  recover: ["Use a recovery kit", ""],
  devices: ["Devices", "Removing one stops it signing the next time it syncs."],
};

// The account panel, drawn in the frame. Every step is stitch's Prism id
// running in this page; the relay only carries what the devices exchange.
export function accounts(frame, core) {
  const { SESSION_DAYS, store, accountChannel, loadSession } = core;
  relay = core.PRISM_RELAY ?? null;
  frame.$("account-panel").innerHTML = ACCOUNT_PANEL;
  const $ = (id) => frame.$(`account-${id}`);
  const panel = frame.$("account-panel");
  let held = null;
  let view = "held";
  let kit = null;
  let link = null;

  const say = (words) => {
    frame.$("bar-status").textContent = words;
    setTimeout(() => (frame.$("bar-status").textContent = ""), 1600);
  };
  const changed = () => {
    paint();
    frame.dispatchEvent(new CustomEvent("accountchange", { detail: frame.account, bubbles: true, composed: true }));
  };
  function paint() {
    core.paint();
    for (const name of ["held", "offer", "join", "recover", "devices"]) $(`view-${name}`).hidden = name !== view;
    const [title, sub] = TITLES[view === "held" && kit ? "kit" : view];
    $("title").textContent = title;
    $("sub").textContent = sub;
    $("sub").hidden = !sub;
    $("kit-save").hidden = !kit;
    for (const name of ["link", "devices"]) $(name).hidden = !held;
    $("back").hidden = view === "held";
    $("id").textContent = held ? short(held.prism) : "Making your Prism id";
    $("id").title = held?.prism ?? "";
  }
  const show = (next) => {
    view = next;
    $("error").hidden = true;
    paint();
  };
  const fail = (words) => {
    $("error").textContent = words;
    $("error").hidden = false;
  };
  const run = async (task) => {
    panel.classList.add("busy");
    frame.$("account").classList.add("busy");
    $("error").hidden = true;
    try {
      const Prism = await prismId();
      try {
        await task(Prism);
      } catch (error) {
        if (error instanceof Prism.PrismIdError || error instanceof IdentityError) fail(sentence(error.message));
        else throw error;
      }
    } catch {
      fail("That did not work. Try again.");
    } finally {
      panel.classList.remove("busy");
      frame.$("account").classList.remove("busy");
    }
  };
  const keep = async (Prism, next) => {
    held = next;
    await saveDevice(held);
    await share(Prism, held);
  };

  // This app's session, made without asking: take in what the other
  // devices shared first, so a device removed elsewhere stops here (it then
  // forgets the device and makes a new id), then sign this app's session.
  // An id made this moment has no other device and nothing to hear, so it
  // asks the relay nothing.
  const session = async (Prism, { fresh = false } = {}) => {
    if (!fresh) held = await pull(Prism, held);
    await saveDevice(held);
    if (!fresh && !(await Prism.canSign(held.prism, await heard(Prism, held), held.device.id))) {
      await forgetDevice();
      await forgetKit();
      held = null;
      kit = null;
      return ensure(Prism);
    }
    const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
    const sessionKey = b64u(await crypto.subtle.exportKey("raw", keys.publicKey));
    const expires = Date.now() + SESSION_DAYS * 864e5;
    const envelope = await Prism.signAction(held, SESSION_ACTION, { sessionKey, expires }, { now: Date.now(), audience: location.origin });
    const delegation = { app: location.origin, envelope, records: [...held.log.values()] };
    const who = await verifySession(delegation, { hear: !fresh });
    const saved = { ...who, delegation, privateKey: keys.privateKey };
    await store("readwrite", (s) => s.put(saved, "current"));
    accountChannel.session = saved;
    changed();
  };

  // The recovery kit of a new id or a recovery waits in this origin's
  // storage until it is saved; the panel offers it, nothing asks for it.
  const holdKit = async (share) => {
    kit = kitOf(held, share);
    await saveKit(kit);
  };

  // ---- the id itself: made on first use, with nothing to click. Every
  // app keeps its own device; linking joins them into one id.
  let ensuring = null;
  async function ensure(Prism) {
    held ??= await loadDevice();
    kit ??= await loadKit();
    // A new id stays on this device until it links or is recovered: there
    // is no other device to share with, so nothing goes to the relay.
    let fresh = false;
    if (!held) {
      const made = await Prism.createRecovery(await Prism.createPrism({ deviceClass: "browser", protection: "software" }), ONE_PAPER_SHARE);
      held = made.session;
      await saveDevice(held);
      await holdKit(made.shares[0]);
      fresh = true;
    }
    await loadSession();
    if (accountChannel.session) await stillHeld(Prism);
    if (!accountChannel.session) await session(Prism, { fresh });
    paint();
  }
  // Once per page: a device removed elsewhere drops its session here.
  let checked = false;
  async function stillHeld(Prism) {
    if (checked) return;
    checked = true;
    held = await pull(Prism, held);
    await saveDevice(held);
    if (await Prism.canSign(held.prism, await heard(Prism, held), held.device.id)) return;
    await store("readwrite", (s) => s.delete("current")).catch(() => {});
    accountChannel.session = null;
    changed();
  }
  const quietly = () => (ensuring ??= prismId().then(ensure).catch(() => {}).finally(() => (ensuring = null)));

  $("kit-save").addEventListener("click", async () => {
    if (!kit) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(kit, null, 1)], { type: "application/json" }));
    a.download = "prism-id-recovery-kit.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    kit = null;
    await forgetKit().catch(() => {});
    paint();
    say("Recovery kit saved");
  });

  // ---- this device offers a link; the new one answers on the rendezvous topic.
  const endLink = () => {
    link?.stop?.();
    link = null;
    $("code").value = "";
    $("confirm").hidden = true;
    $("accept").hidden = true;
    $("join-code").hidden = true;
  };
  $("link").addEventListener("click", () =>
    run(async (Prism) => {
      endLink();
      held = await pull(Prism, held);
      const { uri, pending } = await Prism.createLinkOffer(held, { now: Date.now() });
      const topic = await Prism.rendezvousTopic(pending.offer.secret);
      link = { pending, topic, request: null };
      link.stop = bus(Prism).subscribe(topic, (bytes) => {
        let request;
        try {
          request = parse(bytes);
        } catch {
          return;
        }
        if (request?.kind !== Prism.KIND.request || !link || link.request) return;
        link.request = request;
        $("confirm").hidden = false;
        $("accept").hidden = false;
        $("code").focus();
      });
      $("offer").textContent = uri;
      $("offer").title = uri;
      drawQr($("qr"), Prism.linkQr(uri));
      show("offer");
    }),
  );
  $("offer-copy").addEventListener("click", () => copy($("offer-copy"), $("offer").textContent));
  $("accept").addEventListener("click", () =>
    run(async (Prism) => {
      if (!link?.request) return;
      const accepted = await Prism.acceptLinkRequest(held, link.pending, link.request, { now: Date.now(), confirmCode: $("code").value.trim() });
      await bus(Prism).publish(link.topic, json(accepted.response));
      await keep(Prism, accepted.session);
      endLink();
      show("held");
      panel.hidePopover();
      say("Device added");
    }),
  );

  $("join-go").addEventListener("click", () =>
    run(async (Prism) => {
      endLink();
      const offer = Prism.parseLinkUri($("uri").value.trim());
      if (offer.expires <= Date.now()) deny("offer", "That link has expired. Make a new one");
      const device = await Prism.createDevice({ deviceClass: "browser", protection: "software" });
      const topic = await Prism.rendezvousTopic(offer.secret);
      const joined = new Promise((done, failed) => {
        link = { topic };
        link.stop = bus(Prism).subscribe(topic, (bytes) => {
          let response;
          try {
            response = parse(bytes);
          } catch {
            return;
          }
          if (response?.kind !== Prism.KIND.response) return;
          Prism.completeLink(device, offer, response).then(done, failed);
        });
        setTimeout(() => failed(new IdentityError("offer", "The other device did not answer. Make a new link and try again")), Math.max(0, offer.expires - Date.now()));
      });
      await bus(Prism).publish(topic, json(await Prism.requestLink(device, offer)));
      $("join-code").textContent = `Type ${await Prism.linkCode(offer.secret, device.record)} on your other device.`;
      $("join-code").hidden = false;
      panel.classList.remove("busy");
      try {
        await keep(Prism, await joined);
      } finally {
        endLink();
      }
      $("uri").value = "";
      kit = null;
      await forgetKit();
      await session(Prism);
      show("held");
      say("This app uses your Prism id");
    }),
  );

  // ---- recovery: the kit's recovery device binds this one, removes every
  // other device and makes a new kit, which retires the old one.
  $("kit-file").addEventListener("change", () =>
    run(async (Prism) => {
      const file = $("kit-file").files[0];
      $("kit-file").value = "";
      let saved;
      try {
        saved = JSON.parse(await file.text());
      } catch {
        deny("kit", "That is not a recovery kit");
      }
      if (saved?.kind !== KIT || !Array.isArray(saved.records)) deny("kit", "That is not a recovery kit");
      const device = await Prism.createDevice({ deviceClass: "browser", protection: "software" });
      const recovered = await Prism.recoverPrism({ prism: saved.prism, records: saved.records, shares: [saved.share], device, rotateRecovery: ONE_PAPER_SHARE });
      // The kit's log may be older than the id's: what the other devices
      // shared since, and the id's public log, show a kit already used. Its
      // retirement never kept what this replay signed, so this device cannot
      // sign, or the two retirements fork the log. Either way nothing is
      // kept or published.
      const synced = await pull(Prism, recovered.session);
      const log = await heard(Prism, synced, false);
      const used = () => deny("kit", "That recovery kit was already used, and replaced by a newer one");
      const state = await Prism.resolvePrism(synced.prism, log).catch((error) => (error?.code === "fork" ? used() : Promise.reject(error)));
      const newer = state.active.filter((id) => state.roles[id] === "recovery" && id !== recovered.shares[0].recovery);
      if (newer.length || !(await Prism.canSign(synced.prism, log, synced.device.id))) used();
      await keep(Prism, synced);
      await holdKit(recovered.shares[0]);
      await store("readwrite", (s) => s.delete("current")).catch(() => {});
      accountChannel.session = null;
      await session(Prism);
      show("held");
      say("Prism id recovered");
    }),
  );

  // ---- the id's devices, from its log; Remove is Prism id's revokeDevice,
  // which rotates the private boundary key.
  const listDevices = async (Prism) => {
    const state = await Prism.resolvePrism(held.prism, held.log);
    $("device-list").replaceChildren(
      ...state.active.map((id) => {
        const item = document.createElement("li");
        const record = state.devices[id];
        const label = document.createElement("span");
        const code = document.createElement("code");
        code.textContent = id.slice(7, 15);
        code.title = id;
        label.append(`${KIND_LABEL[record.class] ?? "Device"} `, code, id === held.device.id ? " (this one)" : "");
        item.append(label);
        if (id !== held.device.id && state.roles[id] !== "recovery") {
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "text";
          remove.textContent = "Remove";
          remove.addEventListener("click", () =>
            run(async (P) => {
              await keep(P, await P.revokeDevice(await pull(P, held), id));
              await listDevices(P);
            }),
          );
          item.append(remove);
        }
        return item;
      }),
    );
  };
  $("devices").addEventListener("click", () =>
    run(async (Prism) => {
      held = await pull(Prism, held);
      await saveDevice(held);
      await listDevices(Prism);
      show("devices");
    }),
  );

  $("join").addEventListener("click", () => (show("join"), $("uri").focus()));
  $("recover").addEventListener("click", () => show("recover"));
  $("back").addEventListener("click", () => {
    endLink();
    show("held");
  });
  const copy = async (button, text) => {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select it";
    }
    setTimeout(() => (button.textContent = "Copy"), 1600);
  };
  $("copy").addEventListener("click", () => copy($("copy"), held?.prism ?? ""));

  const reach = () => {
    paint();
    return quietly();
  };
  panel.addEventListener("beforetoggle", (event) => {
    if (event.newState === "open") {
      endLink();
      view = "held";
      reach();
    }
  });

  reach();
  return { reach };
}

// The theme panel's contents, which the frame puts in its empty panel.
export const THEME_PANEL = `
    <p id="theme-title" class="theme-title">Theme</p>
    <div class="modes" role="group" aria-labelledby="theme-title">
      <button class="mode" type="button" aria-pressed="false" data-mode="immersive"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><rect x="2" y="3" width="12" height="10" rx="2" /><circle cx="5.75" cy="6.5" r="1" /><path d="m2.5 11.5 3.25-3 2.5 2 2-1.75 3.25 2.75" /></svg>Immersive</button>
      <button class="mode" type="button" aria-pressed="false" data-mode="dark"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M13.5 9.6A5.6 5.6 0 1 1 6.4 2.5a4.5 4.5 0 0 0 7.1 7.1z" /></svg>Dark</button>
      <button class="mode" type="button" aria-pressed="false" data-mode="light"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="2.75" /><path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" /></svg>Light</button>
    </div>
    <label id="find" class="find" hidden><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg><input id="find-input" type="search" placeholder="Search Unsplash" aria-label="Search Unsplash for a background" aria-controls="photos" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search" /><span id="find-busy" class="find-busy" aria-hidden="true"></span></label>
    <div id="photos" class="photos" role="group" aria-label="Immersive background" aria-busy="false"></div>
    <p id="photos-note" class="photos-note" role="status" hidden></p>
    <button id="photos-more" class="photos-more" type="button" hidden>More photos</button>
    <p class="credit">Photo by <a id="credit-name" target="_blank" rel="noopener noreferrer"></a> on <a href="https://unsplash.com/?${UNSPLASH}" target="_blank" rel="noopener noreferrer">Unsplash</a></p>
`;
