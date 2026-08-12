/**
 * Troca absoluta de fonte de vídeo para HDMI N (PS5 / Switch / PC).
 *
 * Privileges em config.xml:
 *   http://tizen.org/privilege/tv.window     (tizen.tvwindow.setSource / show)
 *   (systeminfo VIDEOSOURCE não exige privilege extra em TVs recentes)
 *
 * Nota: em alguns firmwares/TizenBrew isto opera a janela TV do app (fonte embutida),
 * não o seletor global "Fonte" do menu. Se setSource falhar ou privilege negar,
 * o backend deve cair na macro remota (LEFT×N + RIGHT).
 */
(function (global) {
  'use strict';

  var hw = global.AiOnTvHardware;
  if (!hw) {
    try { console.warn('[AiOnTvHardware] hdmi: adapter ausente'); } catch (e) { /* */ }
    return;
  }

  function findHdmiSource(videoSource, portNumber) {
    var connected = (videoSource && videoSource.connected) || [];
    var want = Math.min(4, Math.max(1, parseInt(portNumber, 10) || 1));
    var i;
    var fallback = null;
    for (i = 0; i < connected.length; i++) {
      var src = connected[i];
      if (!src) continue;
      var type = String(src.type || '').toUpperCase();
      if (type !== 'HDMI') continue;
      var num = parseInt(src.number, 10);
      if (num === want) return src;
      if (!fallback) fallback = src;
    }
    return null;
  }

  /**
   * @param {number} portNumber 1..4
   * @param {function} [done] callback(result)
   */
  function switchToHdmi(portNumber, done) {
    var cb = typeof done === 'function' ? done : function () {};
    var port = Math.min(4, Math.max(1, parseInt(portNumber, 10) || 0));

    if (!hw.isTizen()) {
      var skip = hw.result(false, 'not_tizen', 'switchToHdmi ignorado fora da TV', { port: port });
      hw.log('switchToHdmi skip', skip);
      cb(skip);
      return skip;
    }
    if (!port) {
      var bad = hw.result(false, 'bad_args', 'portNumber 1..4 obrigatório');
      cb(bad);
      return bad;
    }

    try {
      var tizen = global.tizen;
      if (!tizen.systeminfo || !tizen.tvwindow) {
        var nosup = hw.result(false, 'unsupported', 'tvwindow/systeminfo indisponível', { port: port });
        cb(nosup);
        return nosup;
      }

      tizen.systeminfo.getPropertyValue(
        'VIDEOSOURCE',
        function (videoSource) {
          var src = findHdmiSource(videoSource, port);
          if (!src) {
            var miss = hw.result(false, 'hdmi_not_found',
                'HDMI ' + port + ' não listado em VIDEOSOURCE.connected',
                { port: port, connected: videoSource && videoSource.connected });
            hw.log('switchToHdmi miss', miss);
            cb(miss);
            return;
          }
          try {
            tizen.tvwindow.setSource(
              src,
              function () {
                try {
                  // Mostra o sinal na janela principal (coords fullscreen típicas 1920x1080)
                  tizen.tvwindow.show(
                    function () {
                      var ok = hw.result(true, 'hdmi_switched', 'Fonte → HDMI ' + port, {
                        port: port,
                        number: src.number,
                        type: src.type
                      });
                      hw.log('switchToHdmi ok', ok);
                      cb(ok);
                    },
                    function (err) {
                      // setSource ok mas show falhou — ainda útil
                      var partial = hw.result(true, 'hdmi_set_show_failed',
                          'setSource ok; show falhou: ' + ((err && err.message) || ''),
                          { port: port });
                      hw.log('switchToHdmi partial', partial);
                      cb(partial);
                    },
                    ['0px', '0px', '1920px', '1080px']
                  );
                } catch (showEx) {
                  var ok2 = hw.result(true, 'hdmi_set_no_show',
                      'setSource ok; show exception: ' + (showEx.message || showEx),
                      { port: port });
                  cb(ok2);
                }
              },
              function (err) {
                var fail = hw.result(false, 'set_source_failed',
                    (err && (err.message || err.name)) || 'setSource falhou',
                    { port: port });
                hw.log('switchToHdmi fail', fail);
                cb(fail);
              }
            );
          } catch (setEx) {
            var ex = hw.result(false, 'exception', setEx.message || String(setEx), { port: port });
            cb(ex);
          }
        },
        function (err) {
          var vsFail = hw.result(false, 'videosource_failed',
              (err && (err.message || err.name)) || 'VIDEOSOURCE falhou',
              { port: port });
          hw.log('switchToHdmi videosource', vsFail);
          cb(vsFail);
        }
      );
      return hw.result(true, 'pending', 'consultando VIDEOSOURCE', { port: port });
    } catch (e) {
      var top = hw.result(false, 'exception', e.message || String(e), { port: port });
      hw.log('switchToHdmi exception', top);
      cb(top);
      return top;
    }
  }

  hw.hdmi = {
    switchToHdmi: switchToHdmi
  };
})(window);
