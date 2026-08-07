(function (global) {
  'use strict';

  var TIZEN_KEYS = {
    37: 'ArrowLeft',
    38: 'ArrowUp',
    39: 'ArrowRight',
    40: 'ArrowDown',
    13: 'Enter',
    10009: 'Back',
    461: 'Back',
    415: 'MediaPlay',
    19: 'MediaPause',
    403: 'ColorRed',
    404: 'ColorGreen',
    405: 'ColorYellow',
    406: 'ColorBlue'
  };

  for (var d = 0; d <= 9; d++) {
    TIZEN_KEYS[48 + d] = 'Digit' + d;
  }

  function normalizeKey(event) {
    if (event.key && event.key !== 'Unidentified') {
      if (event.key === 'Escape') return 'Back';
      return event.key;
    }
    var code = event.keyCode || event.which;
    if (TIZEN_KEYS[code]) return TIZEN_KEYS[code];
    if (code >= 48 && code <= 57) return 'Digit' + (code - 48);
    return null;
  }

  function registerMediaKeys() {
    try {
      if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
        var keys = [
          'MediaPlay', 'MediaPause', 'MediaStop',
          'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
          '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
        ];
        tizen.tvinputdevice.registerKeyBatch(keys);
      }
    } catch (e) {
      /* browser / sem privilege */
    }
  }

  global.AiOnTvKeyMap = {
    normalizeKey: normalizeKey,
    registerMediaKeys: registerMediaKeys
  };
})(window);
