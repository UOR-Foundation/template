// The dark ground is the brand's primary mode: follow the system, remember a
// choice. Runs before first paint so the page never flashes the other ground.
// Immersive is the dark ground with a photo behind it; the frame paints the
// photo when it arrives.
(function () {
  var stored = null;
  try { stored = localStorage.getItem("prism-theme"); } catch (e) {}
  var dark = stored ? stored !== "light" : matchMedia("(prefers-color-scheme: dark)").matches;
  if (dark) document.documentElement.classList.add("dark");
  if (stored === "immersive") document.documentElement.classList.add("immersive");
})();
