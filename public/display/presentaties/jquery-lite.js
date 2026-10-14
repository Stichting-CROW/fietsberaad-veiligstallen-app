/** Minimal DOM helpers for slide2 fade (no jQuery dependency on signage). */
window.$ = function (sel) {
  var nodes = document.querySelectorAll(sel);
  return {
    length: nodes.length,
    addClass: function (c) {
      nodes.forEach(function (n) {
        n.classList.add(c);
      });
      return this;
    },
    removeClass: function (c) {
      nodes.forEach(function (n) {
        n.classList.remove(c);
      });
      return this;
    },
    fadeIn: function (_speed, cb) {
      nodes.forEach(function (n) {
        n.style.display = "block";
        n.style.opacity = "1";
      });
      if (cb) setTimeout(cb, 600);
      return this;
    },
    fadeOut: function (_speed, cb) {
      nodes.forEach(function (n) {
        n.style.opacity = "0";
      });
      setTimeout(function () {
        nodes.forEach(function (n) {
          n.style.display = "none";
        });
        if (cb) cb();
      }, 600);
      return this;
    },
  };
};
