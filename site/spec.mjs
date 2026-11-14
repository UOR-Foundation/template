// The spec, loaded the first time it opens: bootstrap/page.mjs renders it to
// spec.html at build, from the holo and its LexLean source; this module
// brings it in with its styles (spec.css), wires its controls, and shows
// what this browser checked (state, from app.mjs). A visitor who never opens
// the spec never loads any of it.

const CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.2 5 8.5l4.5-5"/></svg>';
const CROSS = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5"/></svg>';
const $ = (id) => document.getElementById(id);

export async function mount(body, state) {
  const [html, css] = await Promise.all(
    ["./spec.html", "./spec.css"].map((path) => fetch(path).then((response) => {
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      return response.text();
    })),
  );
  // A constructed sheet, as the frame adopts its own: the page's policy
  // hashes the one inline stylesheet, and this one never touches the HTML.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  body.innerHTML = html;

  // The three facts lead to their evidence; a term opens its definition in
  // place; the examples show six until asked for all.
  body.addEventListener("click", (event) => {
    const go = event.target.closest("[data-go]");
    if (go) {
      $(go.dataset.go)?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    const term = event.target.closest("button.term");
    if (term) {
      const open = term.getAttribute("aria-expanded") !== "true";
      term.setAttribute("aria-expanded", String(open));
      $(term.getAttribute("aria-controls")).hidden = !open;
    }
  });
  $("ex-more")?.addEventListener("click", (event) => {
    for (const row of $("ex-rows").querySelectorAll("li[hidden]")) row.hidden = false;
    event.currentTarget.remove();
  });
  $("copy")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.fingerprint || $("fp").textContent);
      $("copy").textContent = "Copied";
    } catch {
      $("copy").textContent = "Select it";
    }
    setTimeout(() => ($("copy").textContent = "Copy"), 1500);
  });
  // The board's raw requests, kept until the spec gives them a place.
  const evidence = $("evidence-hold");
  if (evidence?.firstElementChild && $("session-slot")) {
    $("session-slot").append(...evidence.childNodes);
    $("session-slot").hidden = false;
  }
  apply(state);
}

// What this browser found: the fingerprint it computed, and the replay.
export function apply(state) {
  if (state.fingerprint && $("fp")) $("fp").textContent = state.fingerprint;
  const result = state.result;
  if (!result || !$("ex-sum")) return;
  if (result.error) {
    $("ex-sum").textContent = result.error;
    return;
  }
  const failed = new Set(result.failed);
  for (let i = 0; i < result.total; i++) {
    const tick = $(`vt-${i}`);
    if (tick) [tick.className, tick.innerHTML] = failed.has(i) ? ["tick bad", CROSS] : ["tick good", CHECK];
  }
  const all = result.passed === result.total;
  $("ex-sum").textContent = `${result.passed} of ${result.total} hold`;
  $("ex-sum").className = all ? "ok" : "";
  if ($("ck-ex")) {
    $("ck-ex").textContent = `${result.passed} of ${result.total} examples hold`;
    $("ck-ex-dot").className = `dot ${all ? "good" : "bad"}`;
    $("ck-ex-dot").innerHTML = all ? CHECK : CROSS;
  }
}
