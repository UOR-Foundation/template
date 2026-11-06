// <prism-frame>: the canonical frame every Prism app opens in, as one web
// component. UOR-Foundation/template publishes it, content-addressed, on
// every push to main (frame/publish.mjs); every app page, and Holo Search,
// loads the current one at run time and checks its SHA-256 before running it.
// Change the frame in the template and every Prism app shows the change on
// its next load: no app is rebuilt.
//
// The contract (prism/frame/1):
//   <prism-frame name address live repo home purpose card identity
//                verdict verdict-label fingerprint>
//     <span slot="status">…</span>     optional: shown in the bar, e.g. "Update available"
//   </prism-frame>
// name      the app's name ("Luhn check")
// address   its holo:// name ("luhn-check"); derived from name when absent
// live      the app's canonical URL, which every share uses
// repo      its source; the GitHub icon hides when absent
// home      Holo Search: the home icon, and where the address bar resolves
// purpose   one or more sentences; the first is the share text
// card      the 1200 x 630 social card; live + "og.png" when absent
// identity  where the shield links (default "#identity-title")
// verdict   wait | good | bad: the shield's state; verdict-label says it in
//           words, fingerprint is the holo's (shown in the label, matched by
//           the address bar)
// The frame owns the theme: it toggles the dark class on <html> and
// remembers the choice as "prism-theme", as the page's theme bootstrap reads.

const CSS = "/*CSS*/";
const BRAND = "/*BRAND*/";
const HOME = "https://humuhumu33.github.io/holo-search/";

const escape = (text) =>
  String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugOf = (name) =>
  name.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";
const sheetOf = (text) => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(text);
  return sheet;
};
let frameSheet = null;

// The frame's markup. Every value in it is escaped by render().
const markup = (e) => `
  <div class="bar"><div class="inner">
    <a id="home" class="ghost icon" href="${e.home}" aria-label="Home" title="Home"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v12h14V9" /><path d="M10 21v-6h4v6" /></svg></a>
    <form id="address" class="address" role="search" action="${e.home}" method="get" autocomplete="off">
      <span class="dot" aria-hidden="true"></span>
      <span class="field">
        <span class="url" aria-hidden="true"><span class="scheme">holo://</span><span class="host">${e.slug}</span></span>
        <input id="omnibox" class="omnibox" name="r" type="text" value="holo://${e.slug}" role="combobox" aria-label="Search Prism apps, or paste a holo address or hash" aria-autocomplete="list" aria-expanded="false" aria-controls="omnibox-list" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go" />
      </span>
      <a id="trust" class="chip chip-wait trust" href="${e.identity}" aria-label="Verifying the app in this browser" title="Verifying the app in this browser"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path class="body" d="M12 3 4 6v6c0 4.6 3.4 8.4 8 9 4.6-.6 8-4.4 8-9V6z" /><path class="wait" d="M8.5 12h.01M12 12h.01M15.5 12h.01" /><path class="ok" d="m8.5 12 2.5 2.5 4.5-5" /><path class="bad" d="M12 8v4.5M12 16h.01" /></svg></a>
      <ul id="omnibox-list" class="omnibox-list" role="listbox" aria-label="Prism apps" hidden></ul>
    </form>
    <slot name="status"></slot>
    <button id="share" class="ghost icon" type="button" popovertarget="share-panel" aria-label="Share this app" title="Share"><svg class="share" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg><svg class="done" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></button>
    <a id="github" class="ghost icon" href="${e.repo}" aria-label="Source on GitHub" title="Source on GitHub"><svg class="gh" viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" focusable="false"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" /></svg></a>
    <span id="bar-status" class="sr" aria-live="polite"></span>
    <button id="theme" class="ghost icon" type="button" aria-label="Switch theme" title="Switch theme"><svg class="moon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg><svg class="sun" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg></button>
  </div></div>
  <div id="share-panel" class="share-panel" popover aria-labelledby="share-title">
    <p id="share-title" class="share-title">Share ${e.name}</p>
    <div id="share-image" class="share-image"></div>
    <div class="share-link">
      <code class="share-url">${e.host}</code>
      <button id="share-copy" class="primary" type="button" autofocus><svg class="link" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M10 13.5a4.5 4.5 0 0 0 6.4.4l2.8-2.8a4.5 4.5 0 0 0-6.4-6.4l-1.3 1.3" /><path d="M14 10.5a4.5 4.5 0 0 0-6.4-.4l-2.8 2.8a4.5 4.5 0 0 0 6.4 6.4l1.3-1.3" /></svg><svg class="done" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg><span id="share-copy-label">Copy link</span></button>
    </div>
    <ul class="share-targets">
      <li><a class="share-target" href="${e.x}" target="_blank" rel="noopener noreferrer"><span class="share-glyph"><svg class="fill" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z" /></svg></span>X</a></li>
      <li><a class="share-target" href="${e.linkedin}" target="_blank" rel="noopener noreferrer"><span class="share-glyph"><svg class="fill" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13M7.12 20.45H3.56V9h3.56zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0" /></svg></span>LinkedIn</a></li>
      <li><a class="share-target" href="${e.facebook}" target="_blank" rel="noopener noreferrer"><span class="share-glyph"><svg class="fill" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07" /></svg></span>Facebook</a></li>
      <li><a class="share-target" href="${e.email}"><span class="share-glyph"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></svg></span>Email</a></li>
      <li id="share-more-item" hidden><button id="share-more" class="share-target" type="button"><span class="share-glyph"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg></span>More</button></li>
    </ul>
  </div>
`;

class PrismFrame extends HTMLElement {
  static observedAttributes = ["name", "address", "live", "repo", "home", "purpose", "card", "identity", "verdict", "verdict-label", "fingerprint"];

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    frameSheet ??= sheetOf(CSS);
    this.shadowRoot.adoptedStyleSheets = [frameSheet];
    this.$ = (id) => this.shadowRoot.getElementById(id);
  }

  connectedCallback() {
    // A page without the brand's tokens gets them, so the frame never draws unstyled.
    if (!getComputedStyle(document.documentElement).getPropertyValue("--background").trim()) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheetOf(BRAND)];
    }
    this.render();
    this.watchTheme();
    this.watchScroll();
  }

  disconnectedCallback() {
    this.themeWatch?.disconnect();
    this.scrollWatch?.disconnect();
    this.mark?.remove();
  }

  attributeChangedCallback(name, before, after) {
    if (!this.shadowRoot.firstChild || before === after) return;
    if (name === "verdict" || name === "verdict-label" || name === "fingerprint") this.paintVerdict();
    else this.render();
  }

  // Everything the markup needs, from the attributes.
  model() {
    const name = this.getAttribute("name") ?? document.title;
    const slug = this.getAttribute("address") ?? slugOf(name);
    const home = this.getAttribute("home") ?? HOME;
    const live = this.getAttribute("live") ?? location.href;
    const purpose = this.getAttribute("purpose") ?? "";
    const text = purpose ? `${name}: ${purpose.split(/(?<=\.)\s/)[0]}` : name;
    const url = new URL(live, location.href);
    const query = (params) => new URLSearchParams(params).toString();
    return {
      name,
      slug,
      home,
      live: url.href,
      text,
      repo: this.getAttribute("repo") ?? "",
      card: this.getAttribute("card") ?? new URL("og.png", url).href,
      identity: this.getAttribute("identity") ?? "#identity-title",
      host: (url.host + url.pathname).replace(/\/$/, ""),
      x: `https://x.com/intent/post?${query({ text, url: url.href })}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?${query({ url: url.href })}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?${query({ u: url.href })}`,
      email: `mailto:?subject=${encodeURIComponent(name)}&body=${encodeURIComponent(`${text}\n\n${url.href}`)}`,
    };
  }

  render() {
    const m = this.model();
    const e = Object.fromEntries(Object.entries(m).map(([key, value]) => [key, escape(value)]));
    this.data = m;
    this.shadowRoot.innerHTML = markup(e);
    if (!m.repo) this.$("github").hidden = true;
    this.paintVerdict();
    this.paintTheme();
    this.share();
    this.omnibox();
    this.$("theme").addEventListener("click", () => this.toggleTheme());
  }

  // The shield: the verdict the page reached on the holo, in its state's colour.
  paintVerdict() {
    const state = this.getAttribute("verdict") ?? "wait";
    const label = this.getAttribute("verdict-label") ?? "Verifying the app in this browser";
    const fingerprint = this.getAttribute("fingerprint") ?? "";
    const words = fingerprint ? `${label}, fingerprint ${fingerprint}` : label;
    const shield = this.$("trust");
    shield.className = `chip chip-${["good", "bad"].includes(state) ? state : "wait"} trust`;
    shield.setAttribute("aria-label", words);
    shield.title = words;
  }

  // The theme lives on <html>, where the page's own bootstrap set it before
  // first paint; the frame mirrors it and toggles it.
  watchTheme() {
    this.themeWatch = new MutationObserver(() => this.paintTheme());
    this.themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }
  paintTheme() {
    const dark = document.documentElement.classList.contains("dark");
    this.toggleAttribute("dark", dark);
    const button = this.$("theme");
    if (!button) return;
    const label = `Switch to ${dark ? "light" : "dark"} theme`;
    button.setAttribute("aria-label", label);
    button.title = label;
  }
  toggleTheme() {
    const root = document.documentElement;
    root.classList.toggle("dark");
    try {
      localStorage.setItem("prism-theme", root.classList.contains("dark") ? "dark" : "light");
    } catch {
      // A private window keeps no preference; the page still switches.
    }
  }

  // The spectrum lights once the page scrolls under the bar: a one-pixel mark
  // at the very top of the page, watched, not a scroll handler.
  watchScroll() {
    if (!("IntersectionObserver" in window) || this.mark) return;
    this.mark = document.createElement("div");
    this.mark.setAttribute("aria-hidden", "true");
    Object.assign(this.mark.style, { position: "absolute", top: "0", left: "0", width: "1px", height: "1px", pointerEvents: "none" });
    document.body.prepend(this.mark);
    this.scrollWatch = new IntersectionObserver(([entry]) => this.toggleAttribute("scrolled", !entry.isIntersecting));
    this.scrollWatch.observe(this.mark);
  }

  share() {
    const frame = this;
    const { live: url, name: title, text, card } = frame.data;
    const button = frame.$("share");
    const panel = frame.$("share-panel");
    const native = typeof navigator.share === "function";
    const popover = typeof panel.showPopover === "function";
    const phone = matchMedia("(pointer: coarse)").matches;

    const say = (words) => {
      frame.$("bar-status").textContent = words;
      setTimeout(() => (frame.$("bar-status").textContent = ""), 1600);
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
      const bar = frame.shadowRoot.querySelector(".bar").getBoundingClientRect();
      const edge = button.getBoundingClientRect();
      const view = document.documentElement.clientWidth;
      const width = Math.min(23 * parseFloat(getComputedStyle(document.documentElement).fontSize), view - 32);
      const right = Math.max(16, Math.min(view - edge.right, view - width - 16));
      panel.style.setProperty("--share-top", `${Math.round(bar.bottom + 8)}px`);
      panel.style.setProperty("--share-right", `${Math.round(right)}px`);
      // The card is fetched the first time the panel opens, never with the page.
      if (!frame.$("share-image").firstChild) {
        const image = new Image(1200, 630);
        image.src = card;
        image.alt = "";
        image.decoding = "async";
        frame.$("share-image").append(image);
      }
    });

    frame.$("share-copy").addEventListener("click", async () => {
      const copied = await copy();
      const control = frame.$("share-copy");
      control.classList.toggle("copied", copied);
      frame.$("share-copy-label").textContent = copied ? "Copied" : "Select the link";
      say(copied ? "Link copied" : "Copy failed; select the link");
      setTimeout(() => {
        control.classList.remove("copied");
        frame.$("share-copy-label").textContent = "Copy link";
      }, 1600);
    });

    // A platform opens in a new tab; the panel closes behind it.
    for (const target of panel.querySelectorAll("a.share-target")) {
      target.addEventListener("click", () => panel.hidePopover());
    }

    if (native) {
      frame.$("share-more-item").hidden = false;
      frame.$("share-more").addEventListener("click", async () => {
        panel.hidePopover();
        if (!(await sheet())) await flash();
      });
    }
  }

  omnibox() {
    const frame = this;
    const form = frame.$("address");
    const input = frame.$("omnibox");
    const list = frame.$("omnibox-list");
    const bar = frame.shadowRoot.querySelector(".inner");
    const shown = input.value;
    const slug = shown.replace(/^holo:\/\//, "");
    const name = frame.data.name;
    const search = frame.data.home;
    // The fingerprint is read when needed: the page sets it once the holo verifies.
    const here = { get fingerprint() { return frame.getAttribute("fingerprint") ?? ""; } };
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
      frame.$(`omnibox-${active}`)?.scrollIntoView({ block: "nearest" });
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
      load().then(() => frame.shadowRoot.activeElement === input && render());
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
}

if (!customElements.get("prism-frame")) customElements.define("prism-frame", PrismFrame);
