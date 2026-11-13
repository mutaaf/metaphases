// Moon Club page motion. Scroll-driven CSS animations where the browser has them (.sd); otherwise this scrubs the
// same CSS animations by scroll (.sdjs). Reduced motion (or no script) gets neither: a static, readable page.
// Same-origin file because the CSP allows no inline script. ?sd=0 forces the fallback (for testing).
(function (d) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var sd = !!(window.CSS && CSS.supports && CSS.supports("animation-timeline: view()")) && !/[?&]sd=0/.test(location.search);
  d.classList.add("fx", sd ? "sd" : "sdjs");
  if (sd) return;
  // Section offsets are measured once (and on resize/load), so a frame only reads scrollY and sets currentTime.
  var items = [], vh = 0, max = 1, raf = 0;
  function measure() {
    var y = window.scrollY; vh = window.innerHeight; max = Math.max(1, d.scrollHeight - vh); items = [];
    var els = document.querySelectorAll(".t-root, .t-sec, .t-duo");
    for (var i = 0; i < els.length; i++) {
      var el = els[i], anims = el.getAnimations ? el.getAnimations().filter(function (a) { return a.animationName && a.animationName.indexOf("x-") === 0; }) : [];
      if (!anims.length) continue;
      var cl = el.classList, kind = cl.contains("t-root") ? 0 : cl.contains("t-duo") ? 2 : 1, top = 0, h = 0;
      if (kind) { var s = el.closest(kind === 2 ? ".duo-track" : "[data-tl]"); if (!s) continue; var r = s.getBoundingClientRect(); top = r.top + y; h = r.height; }
      items.push({ a: anims, k: kind, t: top, h: h });
    }
    frame();
  }
  function frame() {
    raf = 0; var y = window.scrollY;
    for (var i = 0; i < items.length; i++) {
      var it = items[i], p = it.k === 0 ? y / max : it.k === 1 ? (y + vh - it.t) / (vh + it.h) : (y - it.t) / Math.max(1, it.h - vh);
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      for (var j = 0; j < it.a.length; j++) it.a[j].currentTime = p * 999;
    }
  }
  var rt = 0;
  addEventListener("scroll", function () { if (!raf) raf = requestAnimationFrame(frame); }, { passive: true });
  addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(measure, 120); });
  addEventListener("load", measure);
  document.addEventListener("DOMContentLoaded", function () { measure(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure); });
})(document.documentElement);
