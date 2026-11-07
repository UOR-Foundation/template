// What the bar needs only once the visitor moves: every panel's styles
// (frame/panels.css), the theme panel, and the immersive photos (the nine
// built in, any other found on Unsplash, each fetched once and kept).
// frame/publish.mjs publishes it beside the frame, named by its SHA-256,
// and writes that hash into the frame, which fetches it after the visitor's
// first move, checks it and imports it: the page's first load carries none
// of it.
const CSS = "/*PANELS_CSS*/";
export const sheet = new CSSStyleSheet();
sheet.replaceSync(CSS);

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
// Never with the page, though: immersive is every new visitor's theme, and
// an app's Lighthouse budget allows two third-party requests, which the
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
