// Plain dark is the default: the brand's warm ground. A visitor's choice of
// light, dark or immersive (the photo the frame paints when it arrives) is
// remembered. Runs before first paint so the page never flashes the other
// ground.
(function () {
  var stored = null;
  try { stored = localStorage.getItem("prism-theme"); } catch (e) {}
  var root = document.documentElement.classList;
  if (stored !== "light") root.add("dark");
  if (stored === "immersive") root.add("immersive");
})();
