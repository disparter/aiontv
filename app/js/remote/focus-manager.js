(function (global) {
  'use strict';

  function FocusManager() {
    this.focusId = null;
    this.screen = 'home';
  }

  FocusManager.prototype.setScreen = function (screen) {
    this.screen = screen;
  };

  FocusManager.prototype.visibleFocusables = function () {
    var root = document.getElementById('screen_' + this.screen) || document.getElementById('app');
    var nodes = root.querySelectorAll('[data-focusable="true"]');
    var list = [];
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i].disabled && nodes[i].offsetParent !== null) {
        list.push(nodes[i]);
      }
    }
    return list;
  };

  FocusManager.prototype.focus = function (id) {
    var el = document.getElementById(id);
    if (!el || el.getAttribute('data-focusable') !== 'true') return false;
    var prev = document.querySelector('.focused');
    if (prev) prev.classList.remove('focused');
    el.classList.add('focused');
    try { el.focus(); } catch (e) { /* ignore */ }
    this.focusId = id;
    return true;
  };

  FocusManager.prototype.ensureFocus = function () {
    if (this.focusId && this.focus(this.focusId)) return;
    var list = this.visibleFocusables();
    if (list.length) this.focus(list[0].id);
  };

  FocusManager.prototype.move = function (dir) {
    var list = this.visibleFocusables();
    if (!list.length) return null;
    var current = document.getElementById(this.focusId) || list[0];
    var best = null;
    var bestScore = Infinity;
    var cr = current.getBoundingClientRect();
    var cx = cr.left + cr.width / 2;
    var cy = cr.top + cr.height / 2;

    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === current) continue;
      var r = el.getBoundingClientRect();
      var ex = r.left + r.width / 2;
      var ey = r.top + r.height / 2;
      var dx = ex - cx;
      var dy = ey - cy;
      var ok = false;
      if (dir === 'ArrowLeft' && dx < -8) ok = true;
      if (dir === 'ArrowRight' && dx > 8) ok = true;
      if (dir === 'ArrowUp' && dy < -8) ok = true;
      if (dir === 'ArrowDown' && dy > 8) ok = true;
      if (!ok) continue;
      var primary = (dir === 'ArrowLeft' || dir === 'ArrowRight') ? Math.abs(dx) : Math.abs(dy);
      var secondary = (dir === 'ArrowLeft' || dir === 'ArrowRight') ? Math.abs(dy) : Math.abs(dx);
      var score = primary + secondary * 2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) {
      this.focus(best.id);
      return best.id;
    }
    return this.focusId;
  };

  global.AiOnTvFocusManager = FocusManager;
})(window);
