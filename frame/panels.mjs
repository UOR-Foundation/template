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

// The theme panel's contents, which the frame puts in its empty panel.
// Prism accounts (prism/identity/1, identity/PROTOCOL.md): the checks the
// sign-in page's answer must pass. The page is trusted with nothing; every
// signature is checked here, in the visitor's browser, as the frame checks
// the holo's bytes. A failed check is an IdentityError naming which one.
const MAX_CHAIN = 5;
const enc = new TextEncoder();
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (text) => {
  if (typeof text !== "string" || !/^[\w-]*$/.test(text)) throw new IdentityError("encoding", "A value is not base64url");
  return Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
};
const digest = async (bytes) => new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

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

// The origins whose signatures count, each with its WebAuthn rpId.
export const originsOf = (accounts) => ({ [new URL(accounts).origin]: new URL(accounts).hostname });

const ALGORITHMS = {
  [-7]: { key: { name: "ECDSA", namedCurve: "P-256" }, verify: { name: "ECDSA", hash: "SHA-256" } },
  [-257]: { key: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, verify: { name: "RSASSA-PKCS1-v1_5" } },
};

// WebAuthn's ECDSA signatures are DER; WebCrypto's are the two 32-byte halves.
function rawSignature(der) {
  let at = 2;
  const integer = () => {
    if (der[at++] !== 0x02) deny("signature", "The signature is not DER");
    const length = der[at++];
    let value = der.slice(at, (at += length));
    while (value.length > 32 && value[0] === 0) value = value.slice(1);
    if (value.length > 32 || at > der.length) deny("signature", "The signature is not DER");
    const out = new Uint8Array(32);
    out.set(value, 32 - value.length);
    return out;
  };
  if (der[0] !== 0x30 || der[1] !== der.length - 2) deny("signature", "The signature is not DER");
  const r = integer();
  const s = integer();
  return new Uint8Array([...r, ...s]);
}

// One WebAuthn assertion: the passkey of record signed message. The six
// checks of PROTOCOL.md, in its order, failing closed.
export async function verifySigned(record, signed, message, origins) {
  if (signed?.credential !== record.credential) deny("credential", "The signature is from another passkey");
  let client;
  try {
    client = JSON.parse(new TextDecoder().decode(unb64u(signed.clientDataJSON)));
  } catch {
    deny("client", "The signed client data is not JSON");
  }
  if (client.type !== "webauthn.get") deny("type", "The signature is not a sign-in");
  if (client.challenge !== b64u(await digest(enc.encode(message)))) deny("challenge", "The signature is for another request");
  const rp = Object.hasOwn(origins, client.origin) ? origins[client.origin] : null;
  if (!rp) deny("origin", "The signature was made on another site");
  const data = unb64u(signed.authenticatorData);
  if (data.length < 37 || b64u(data.slice(0, 32)) !== b64u(await digest(enc.encode(rp)))) deny("rp", "The passkey belongs to another site");
  if ((data[32] & 0x05) !== 0x05) deny("flags", "The device did not verify its user");
  const algorithm = ALGORITHMS[record.alg] ?? deny("algorithm", "The passkey's algorithm is not ES256 or RS256");
  const key = await crypto.subtle.importKey("spki", unb64u(record.spki), algorithm.key, false, ["verify"]).catch(() => deny("key", "The public key does not parse"));
  let signature = unb64u(signed.signature);
  if (record.alg === -7) signature = rawSignature(signature);
  const body = new Uint8Array([...data, ...(await digest(unb64u(signed.clientDataJSON)))]);
  if (!(await crypto.subtle.verify(algorithm.verify, key, signature, body))) deny("signature", "The signature does not verify");
}

// A key record, accepted only when its name is its key's hash and it is the
// account's first key or bound to it by a key already accepted.
export async function acceptRecord(credential, records, origins, depth = 0) {
  const record = records.find((r) => r?.credential === credential);
  if (!record || record.spec !== "prism/identity/key/1") deny("record", "The passkey has no record");
  if (b64u(await digest(unb64u(record.spki))) !== record.key) deny("key", "The record's name is not its key's hash");
  if (record.key === record.account) {
    if (record.binding) deny("binding", "An account's first key has no binding");
    return record;
  }
  if (depth >= MAX_CHAIN || !record.binding) deny("binding", "The key is not bound to its account");
  const parent = await acceptRecord(record.binding.credential, records, origins, depth + 1);
  if (parent.account !== record.account) deny("binding", "The key is bound by another account");
  await verifySigned(parent, record.binding, `prism/identity/bind/1\n${record.account}\n${record.key}`, origins);
  return record;
}

// A session: the account's passkey let one browser key act for it, on one
// app's origin, until it expires. Anyone holding the session can check it.
export async function verifySession(session, origins, now = Date.now()) {
  const { app, nonce, sessionKey, expires, assertion, records } = session ?? {};
  if (!Number.isSafeInteger(expires) || expires <= now) deny("expired", "The session has expired");
  const record = await acceptRecord(assertion?.credential, records ?? [], origins);
  await verifySigned(record, assertion, `prism/identity/session/1\n${app}\n${nonce}\n${sessionKey}\n${expires}`, origins);
  return { account: record.account, key: record.key, credential: record.credential, expires };
}


const ACCOUNT_PANEL = `
<button class="account-close" type="button" popovertarget="account-panel" popovertargetaction="hide" aria-label="Close"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
<h2 id="account-title" class="account-title">Sign in</h2>
<p id="account-sub" class="account-sub">One account for every Prism app. No password.</p>
<div id="account-in" class="account-in" hidden>
  <p class="account-id"><code id="account-id"></code><button id="account-copy" class="text" type="button">Copy</button></p>
  <button id="account-add" class="row" type="button">Add device</button>
  <button id="account-out" class="row" type="button">Sign out</button>
</div>
<div id="account-ceremony" class="account-ceremony"></div>
<button id="account-window" class="primary" type="button" hidden>Continue</button>
`;

// The account panel (prism/identity/1, identity/PROTOCOL.md): the sign-in
// page from the accounts origin in an iframe, loaded when the visitor reaches
// for the icon, so the panel opens ready. A page whose policy will not frame
// that origin gets the same page in a small window instead. The page says
// nothing the frame takes on trust: every signature is checked here (core's
// verifySession) before a session is kept.
export function accounts(frame, core) {
  const { SESSION_DAYS, store, accountChannel, loadSession } = core;
  frame.$("account-panel").innerHTML = ACCOUNT_PANEL;
  const button = frame.$("account");
  const panel = frame.$("account-panel");
  const target = new URL(frame.data.accounts);
  const origin = target.origin;
  const origins = originsOf(target.href);
  const SPEC = "prism/identity/1";
  const box = frame.$("account-ceremony");
  const windowButton = frame.$("account-window");
  let ceremony = null;

  const policy = [...document.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]')].map((meta) => meta.content).join(";");
  const directive = (name) => new RegExp(`(?:^|;)\\s*${name}([^;]*)`).exec(policy)?.[1];
  const frames = directive("frame-src") ?? directive("child-src") ?? directive("default-src");
  const framed = frames === undefined || frames.split(/\s+/).some((source) => source === "*" || source === origin || (source === "'self'" && origin === location.origin));

  const say = (words) => {
    frame.$("bar-status").textContent = words;
    setTimeout(() => (frame.$("bar-status").textContent = ""), 1600);
  };
  const paint = () => {
    const saved = accountChannel.session;
    core.paint();
    frame.$("account-in").hidden = !saved;
    frame.$("account-title").textContent = saved ? "Prism account" : "Sign in";
    frame.$("account-sub").textContent = saved ? "Signed in on this device." : "One account for every Prism app. No password.";
    if (saved) {
      frame.$("account-id").textContent = `${saved.account.slice(0, 8)}…${saved.account.slice(-4)}`;
      frame.$("account-id").title = saved.account;
    }
  };
  const changed = () => {
    paint();
    frame.dispatchEvent(new CustomEvent("accountchange", { detail: frame.account, bubbles: true, composed: true }));
  };
  const close = () => {
    box.replaceChildren();
    ceremony?.popup?.close();
    ceremony = null;
    windowButton.hidden = true;
    button.classList.remove("busy");
  };

  // One ceremony at a time, each with its own session key and nonce, used once.
  const begin = (mode) => {
    if (ceremony?.mode === mode) return;
    close();
    paint();
    if (mode === "add") {
      frame.$("account-title").textContent = "Add a device";
      frame.$("account-sub").textContent = "Your phone or another computer joins this account.";
    }
    const saved = accountChannel.session;
    ceremony = {
      mode,
      ready: crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]).then(async (keys) => ({
        keys,
        request: {
          type: `${SPEC}/request`,
          mode,
          nonce: b64u(crypto.getRandomValues(new Uint8Array(32))),
          sessionKey: b64u(await crypto.subtle.exportKey("raw", keys.publicKey)),
          expires: Date.now() + SESSION_DAYS * 864e5,
          ...(mode === "add" ? { account: saved.account, credential: saved.credential } : {}),
        },
      })),
    };
    if (!framed) {
      windowButton.hidden = false;
      return;
    }
    const iframe = document.createElement("iframe");
    const page = new URL(target);
    page.hash = `theme=${document.documentElement.classList.contains("dark") ? "dark" : "light"}`;
    iframe.src = page.href;
    iframe.title = mode === "add" ? "Add device" : "Sign in";
    iframe.allow = "publickey-credentials-get; publickey-credentials-create";
    iframe.referrerPolicy = "no-referrer";
    box.replaceChildren(iframe);
    ceremony.iframe = iframe;
    const waiting = ceremony;
    // A policy the frame cannot read (a header, not a meta tag) that will
    // not frame the accounts origin says so here: the window takes over.
    document.addEventListener(
      "securitypolicyviolation",
      (event) => {
        if (ceremony !== waiting || !/^(frame|child|default)-src/.test(event.effectiveDirective) || !String(event.blockedURI).startsWith(origin)) return;
        waiting.answered = true;
        box.replaceChildren();
        windowButton.hidden = false;
      },
      { signal: frame.accountWatch.signal },
    );
    // The iframe shows only once the page answers, so a page that fails
    // leaves no browser error page in the panel. A slow network is not a
    // failure: past 8 s the panel says it is still trying and keeps the
    // page, which shows the moment it answers. Only past 30 s does it give
    // up, with one plain sentence, and the next reach tries again.
    setTimeout(() => {
      if (ceremony !== waiting || waiting.answered) return;
      waiting.slow = true;
      frame.$("account-sub").textContent = "Accounts are slow to answer. Still trying.";
    }, 8000);
    setTimeout(() => {
      if (ceremony !== waiting || waiting.answered) return;
      close();
      frame.$("account-sub").textContent = "Accounts are unreachable right now. Try again soon.";
    }, 30000);
  };

  windowButton.addEventListener("click", () => {
    const page = new URL(target);
    page.hash = `popup&theme=${document.documentElement.classList.contains("dark") ? "dark" : "light"}`;
    ceremony.popup = open(page.href, "prism-identity", "popup,width=420,height=420");
    if (!ceremony.popup) say("Allow pop-ups for this page to sign in");
  });

  const finish = async (data) => {
    const { keys, request } = await ceremony.ready;
    const delegation = { app: location.origin, nonce: request.nonce, sessionKey: request.sessionKey, expires: request.expires, assertion: data.assertion, records: data.records };
    try {
      const who = await verifySession(delegation, origins);
      const saved = { ...who, delegation, privateKey: keys.privateKey };
      await store("readwrite", (s) => s.put(saved, "current"));
      accountChannel.session = saved;
      close();
      panel.hidePopover();
      changed();
      say("Signed in");
    } catch (error) {
      close();
      begin("signin");
      frame.$("account-sub").textContent = error instanceof IdentityError ? `Sign-in was refused: ${error.message.toLowerCase()}.` : "Sign-in did not finish. Try again.";
    }
  };

  frame.accountWatch?.abort();
  frame.accountWatch = new AbortController();
  addEventListener(
    "message",
    async (event) => {
      if (!ceremony || event.origin !== origin || event.source !== (ceremony.iframe?.contentWindow ?? ceremony.popup)) return;
      const data = event.data ?? {};
      ceremony.answered = true;
      if (data.type === `${SPEC}/ready`) ceremony.iframe?.classList.add("ready");
      if (data.type === `${SPEC}/ready` && ceremony.slow) {
        ceremony.slow = false;
        paint();
      }
      if (data.type === `${SPEC}/ready`) event.source.postMessage((await ceremony.ready).request, origin);
      else if (data.type === `${SPEC}/size` && ceremony.iframe) ceremony.iframe.style.height = `${Math.min(Math.max(Number(data.height) || 0, 48), 480)}px`;
      else if (data.type === `${SPEC}/busy`) button.classList.toggle("busy", Boolean(data.on));
      else if (data.type === `${SPEC}/session` && ceremony.mode === "signin") await finish(data);
      else if (data.type === `${SPEC}/added` && ceremony.mode === "add") {
        close();
        panel.hidePopover();
        say("Device added");
      }
    },
    { signal: frame.accountWatch.signal },
  );

  // Only once the saved session is known, so a quick hover never starts a
  // sign-in for someone already signed in.
  const reach = () => loadSession().then(() => !accountChannel.session && begin("signin"));

  // The dialog opens centred over the app (panels.css); opening it asks.
  panel.addEventListener("beforetoggle", (event) => {
    if (event.newState === "open") {
      paint();
      return void reach();
    }
    if (ceremony?.mode === "add") close();
  });

  frame.$("account-add").addEventListener("click", () => begin("add"));
  frame.$("account-out").addEventListener("click", async () => {
    await store("readwrite", (s) => s.delete("current")).catch(() => {});
    accountChannel.session = null;
    close();
    panel.hidePopover();
    changed();
    say("Signed out");
  });
  frame.$("account-copy").addEventListener("click", async () => {
    const copy = frame.$("account-copy");
    try {
      await navigator.clipboard.writeText(accountChannel.session?.account ?? "");
      copy.textContent = "Copied";
    } catch {
      copy.textContent = "Select it";
    }
    setTimeout(() => (copy.textContent = "Copy"), 1600);
  });

  paint();
  loadSession().then(paint);
  return { reach };
}

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
