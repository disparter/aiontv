(function (global) {
  'use strict';

  var ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ç'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '?'],
    ['SPACE', 'BKSP', 'OK']
  ];

  function Keyboard(rootId, onChange, onSubmit) {
    this.rootId = rootId || 'keyboard';
    this.root = document.getElementById(rootId);
    this.onChange = onChange || function () {};
    this.onSubmit = onSubmit || null;
    this.value = '';
    this.shift = false;
  }

  Keyboard.prototype.mount = function () {
    var self = this;
    if (!this.root) return;
    var html = '';
    var id = 0;
    var prefix = this.rootId + '_key_';
    for (var r = 0; r < ROWS.length; r++) {
      for (var c = 0; c < ROWS[r].length; c++) {
        var key = ROWS[r][c];
        var label = key === 'SPACE' ? 'Espaço' : (key === 'BKSP' ? '⌫' : (key === 'OK' ? 'OK' : key));
        var cls = 'key';
        if (key === 'SPACE') cls += ' space';
        if (key === 'BKSP' || key === 'OK') cls += ' wide';
        var kid = prefix + (id++);
        html += '<button type="button" class="' + cls + '" id="' + kid + '"'
          + ' data-focusable="true" data-action="key" data-key="' + key + '">'
          + label + '</button>';
      }
    }
    this.root.innerHTML = html;
    this.root.querySelectorAll('[data-action="key"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.press(btn.getAttribute('data-key'));
      });
    });
  };

  Keyboard.prototype.press = function (key) {
    if (key === 'SPACE') this.value += ' ';
    else if (key === 'BKSP') this.value = this.value.slice(0, -1);
    else if (key === 'OK') {
      this.onChange(this.value);
      if (this.onSubmit) this.onSubmit(this.value);
      return 'submit';
    } else this.value += this.shift ? key.toUpperCase() : key;
    this.onChange(this.value);
    return null;
  };

  Keyboard.prototype.clear = function () {
    this.value = '';
    this.onChange('');
  };

  Keyboard.prototype.setValue = function (v) {
    this.value = v || '';
    this.onChange(this.value);
  };

  /** Primeiro botão focável deste teclado (IDs únicos por root). */
  Keyboard.prototype.firstKeyId = function () {
    return this.rootId + '_key_0';
  };

  global.AiOnTvKeyboard = Keyboard;
})(window);
