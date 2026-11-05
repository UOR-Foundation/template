// The dark ground is the brand's primary mode: follow the system, remember a
// choice. Runs before first paint so the page never flashes the other ground.
(function () {
  var stored = null;
  try { stored = localStorage.getItem("prism-theme"); } catch (e) {}
  var dark = stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  if (dark) document.documentElement.classList.add("dark");
})();
