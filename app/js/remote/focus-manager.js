(function (global) {
  'use strict';

  function FocusManager() {
    this.focusId = null;
    this.screen = 'home';
  }

  FocusManager.prototype.setScreen = function (screen) {
    this.screen = screen;
  };

  /** Visível na tela — não usa offsetParent (quebra com transform/fixed no Tizen). */
  FocusManager.prototype.isShown = function (el) {
    if (!el || el.disabled) return false;
    var onRate = this.screen === 'rate' || this.screen === 'tv_login' || this.screen === 'title_rate'
        || (el.closest && (el.closest('#screen_rate') || el.closest('#screen_tv_login')
            || el.closest('#screen_title_rate')));
    var node = el;
    while (node && node.nodeType === 1) {
      if (node.hidden) return false;
      if (node.classList && node.classList.contains('hidden')) return false;
      var st = null;
      try { st = global.getComputedStyle(node); } catch (e) { /* ignore */ }
      if (st) {
        if (st.display === 'none' || st.visibility === 'hidden') return false;
        // opacity:0 em ancestrais quebra foco das estrelas no Tizen durante fade
        if (!onRate && st.opacity === '0') return false;
      }
      if (node === document.body || node === document.documentElement) break;
      node = node.parentElement;
    }
    if (onRate) return true;
    try {
      return el.getClientRects().length > 0;
    } catch (e2) {
      return true;
    }
  };

  FocusManager.prototype.visibleFocusables = function () {
    var root = document.getElementById('screen_' + this.screen) || document.getElementById('app');
    var nodes = root.querySelectorAll('[data-focusable="true"]');
    var list = [];
    for (var i = 0; i < nodes.length; i++) {
      if (this.isShown(nodes[i])) list.push(nodes[i]);
    }
    return list;
  };

  FocusManager._seq = 0;

  /** Garante id estável — chips/botões sem id quebravam o D-pad (focus falhava em silêncio). */
  FocusManager.prototype.ensureId = function (el) {
    if (!el) return '';
    if (el.id) return el.id;
    FocusManager._seq += 1;
    el.id = 'focus_auto_' + FocusManager._seq;
    return el.id;
  };

  FocusManager.prototype.focus = function (idOrEl) {
    var el = null;
    if (idOrEl && typeof idOrEl === 'object' && idOrEl.nodeType === 1) {
      el = idOrEl;
    } else if (idOrEl) {
      el = document.getElementById(String(idOrEl));
    }
    if (!el || el.getAttribute('data-focusable') !== 'true') return false;
    if (!this.isShown(el)) return false;
    var id = this.ensureId(el);
    var prev = document.querySelector('.focused');
    if (prev) prev.classList.remove('focused');
    el.classList.add('focused');
    try {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      el.focus();
    } catch (e) { /* ignore */ }
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
    if (!current || list.indexOf(current) < 0) current = list[0];
    this.ensureId(current);

    var inKeyboard = !!(current.closest && current.closest('.keyboard'));
    var cr = current.getBoundingClientRect();
    var cx = cr.left + cr.width / 2;
    var cy = cr.top + cr.height / 2;

    function pickBest(mode) {
      // mode: 'any' | 'keyboard' | 'outside'
      var best = null;
      var bestScore = Infinity;
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (el === current) continue;
        var elInKb = !!(el.closest && el.closest('.keyboard'));
        if (mode === 'keyboard' && !elInKb) continue;
        if (mode === 'outside' && elInKb) continue;
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
      return best;
    }

    // No teclado: ↑/↓ entre linhas; na borda saem p/ chips / Catálogo / Enviar
    var best = null;
    if (inKeyboard && (dir === 'ArrowUp' || dir === 'ArrowDown')) {
      best = pickBest('keyboard');
      if (!best) best = pickBest('outside');
    }
    if (!best) best = pickBest('any');

    if (best && this.focus(best)) {
      return this.focusId;
    }
    // Escape explícito se a geometria falhar (ex.: chips sem id no passado)
    if (inKeyboard && dir === 'ArrowUp') {
      var escapeUp = document.getElementById('chip_serie')
          || document.querySelector('#quick_chips [data-focusable="true"]')
          || document.getElementById('btn_back_catalog')
          || document.getElementById('btn_search_home');
      if (escapeUp && this.focus(escapeUp)) return this.focusId;
    }
    if (inKeyboard && dir === 'ArrowDown') {
      var escapeDown = document.getElementById('btn_send')
          || document.getElementById('btn_clear');
      if (escapeDown && this.focus(escapeDown)) return this.focusId;
    }
    // Fallback linear na fileira de estrelas / botões
    var idx = list.indexOf(current);
    if (idx >= 0) {
      var next = idx;
      if (dir === 'ArrowRight' || dir === 'ArrowDown') next = Math.min(list.length - 1, idx + 1);
      if (dir === 'ArrowLeft' || dir === 'ArrowUp') next = Math.max(0, idx - 1);
      if (next !== idx && this.focus(list[next])) {
        return this.focusId;
      }
    }
    return this.focusId;
  };

  global.AiOnTvFocusManager = FocusManager;
})(window);
