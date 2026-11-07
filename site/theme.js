// Immersive is the default: the dark ground with a photo behind the app,
// which the frame paints when it arrives. A visitor's choice of light or
// dark is remembered. Runs before first paint so the page never flashes the
// other ground.
(function () {
  var stored = null;
  try { stored = localStorage.getItem("prism-theme"); } catch (e) {}
  var root = document.documentElement.classList;
  if (stored !== "light") root.add("dark");
  if (stored !== "light" && stored !== "dark") root.add("immersive");
})();
