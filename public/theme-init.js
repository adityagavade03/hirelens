// Resolve the theme before styles or React load. Storage can be unavailable in private browsers.
(function () {
  var preference = "system";
  try {
    var saved = localStorage.getItem("hirelens.theme");
    if (saved === "light" || saved === "dark") preference = saved;
  } catch (_) {}
  var dark =
    preference === "dark" ||
    (preference === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document.documentElement.style.backgroundColor = dark ? "#171512" : "#f8f7f4";
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#171512" : "#f8f7f4");
})();
