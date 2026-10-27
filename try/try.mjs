import { load } from "./vendor/prism-code/src/browser.mjs";

const $ = (id) => document.getElementById(id);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function describe(error) {
  return error?.code ?? error?.message ?? String(error);
}

async function main() {
  const status = $("verified");
  let app;

  try {
    app = await load("./vendor/prism-code/fixtures/Calculator.holo");
  } catch (error) {
    status.textContent = `failed to load: ${describe(error)}`;
    status.classList.add("bad");
    $("application").textContent = "—";
    $("limits").textContent = "—";
    return;
  }

  const { identities } = app;
  status.textContent = identities.verified ? "verified" : "NOT verified";
  status.classList.add(identities.verified ? "good" : "bad");
  $("fingerprint").textContent = identities.archiveFingerprint;
  $("application").textContent = `${app.name ?? "unnamed"} (${app.kind}, ${app.profile ?? "no profile"})`;
  $("limits").textContent = app.limits
    ? `request ${app.limits.request} · response ${app.limits.response} · guest ${app.limits.guestAllocation}`
    : "—";

  $("calc").addEventListener("submit", async (event) => {
    event.preventDefault();
    const request = encoder.encode(
      `1\t${$("op").value}\t${$("a").value}\t${$("b").value}`,
    );
    try {
      const response = decoder.decode(await app.dispatch(request));
      $("raw").textContent = response;
      const [, outcome, value] = response.split("\t");
      $("answer").textContent = outcome === "ok" ? value : response;
    } catch (error) {
      $("raw").textContent = `dispatch failed: ${describe(error)}`;
      $("answer").textContent = "—";
    }
  });

  $("replay").addEventListener("click", async () => {
    const button = $("replay");
    button.disabled = true;
    $("vectors").textContent = "replaying…";
    const failures = $("failures");
    failures.replaceChildren();
    try {
      const result = await app.acceptance();
      $("vectors").textContent = `${result.passed}/${result.total}`;
      for (const failure of result.failed) {
        const item = document.createElement("li");
        const actual = failure.actual
          ? decoder.decode(failure.actual)
          : String(failure.error);
        item.textContent = `vector ${failure.index}: expected ${decoder.decode(failure.expected)}, got ${actual}`;
        failures.appendChild(item);
      }
    } catch (error) {
      $("vectors").textContent = `failed: ${describe(error)}`;
    } finally {
      button.disabled = false;
    }
  });
}

main();
