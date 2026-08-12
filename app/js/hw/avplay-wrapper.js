/**
 * Wrapper opcional do player de hardware Samsung (webapis.avplay).
 * Para .mkv / codecs que <video> HTML5 não cobre bem no Tizen antigo.
 *
 * Privilege / feature típicos:
 *   http://developer.samsung.com/privilege/avplay
 *   (e privilege de filesystem se path local/USB)
 *
 * Este módulo só expõe open/play/stop mínimos — UI do player continua no main.
 */
(function (global) {
  'use strict';

  var hw = global.AiOnTvHardware;
  if (!hw) {
    try { console.warn('[AiOnTvHardware] avplay: adapter ausente'); } catch (e) { /* */ }
    return;
  }

  function av() {
    try {
      return global.webapis && global.webapis.avplay ? global.webapis.avplay : null;
    } catch (e) {
      return null;
    }
  }

  function open(url, done) {
    var cb = typeof done === 'function' ? done : function () {};
    var player = av();
    if (!player) {
      var skip = hw.result(false, 'no_avplay', 'webapis.avplay indisponível');
      cb(skip);
      return skip;
    }
    try {
      player.open(String(url));
      var ok = hw.result(true, 'opened', 'avplay.open', { url: url });
      cb(ok);
      return ok;
    } catch (e) {
      var fail = hw.result(false, 'exception', e.message || String(e));
      cb(fail);
      return fail;
    }
  }

  function prepareAndPlay(done) {
    var cb = typeof done === 'function' ? done : function () {};
    var player = av();
    if (!player) {
      var skip = hw.result(false, 'no_avplay', 'webapis.avplay indisponível');
      cb(skip);
      return skip;
    }
    try {
      player.prepareAsync(
        function () {
          try {
            player.play();
            cb(hw.result(true, 'playing', 'avplay.play'));
          } catch (e) {
            cb(hw.result(false, 'play_failed', e.message || String(e)));
          }
        },
        function (err) {
          cb(hw.result(false, 'prepare_failed',
              (err && (err.message || err.name)) || 'prepareAsync falhou'));
        }
      );
      return hw.result(true, 'pending', 'prepareAsync');
    } catch (e) {
      var fail = hw.result(false, 'exception', e.message || String(e));
      cb(fail);
      return fail;
    }
  }

  function stop(done) {
    var cb = typeof done === 'function' ? done : function () {};
    var player = av();
    if (!player) {
      var skip = hw.result(false, 'no_avplay', 'webapis.avplay indisponível');
      cb(skip);
      return skip;
    }
    try {
      player.stop();
      player.close();
      var ok = hw.result(true, 'stopped', 'avplay.stop/close');
      cb(ok);
      return ok;
    } catch (e) {
      var fail = hw.result(false, 'exception', e.message || String(e));
      cb(fail);
      return fail;
    }
  }

  hw.avplay = {
    open: open,
    prepareAndPlay: prepareAndPlay,
    stop: stop,
    available: function () { return !!av(); }
  };
})(window);
