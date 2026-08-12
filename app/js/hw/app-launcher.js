/**
 * Lançamento nativo de apps (Netflix, Max, etc.) via AppControl + deep link.
 *
 * Privilege necessário em config.xml:
 *   http://tizen.org/privilege/application.launch
 *
 * Fallback: se não for Tizen, retorna { ok:false, code:'not_tizen' } — o Spring
 * deve então usar macro remota / open app cego.
 */
(function (global) {
  'use strict';

  var hw = global.AiOnTvHardware;
  if (!hw) {
    try { console.warn('[AiOnTvHardware] app-launcher: adapter ausente'); } catch (e) { /* */ }
    return;
  }

  /**
   * @param {string} appId  Application ID Tizen (ex.: org.tizen.netflix)
   * @param {string} [metaTag] Deep-link / PAYLOAD (URI ou JSON serializado pelo app)
   * @param {function} [done] callback opcional(result)
   * @returns {object} result síncrono quando falha imediata; async via done
   */
  function launchDeepLink(appId, metaTag, done) {
    var cb = typeof done === 'function' ? done : function () {};

    if (!hw.isTizen()) {
      var skip = hw.result(false, 'not_tizen', 'launchDeepLink ignorado fora da TV');
      hw.log('launchDeepLink skip', skip);
      cb(skip);
      return skip;
    }
    if (!appId) {
      var bad = hw.result(false, 'bad_args', 'appId obrigatório');
      cb(bad);
      return bad;
    }

    try {
      var tizen = global.tizen;
      var data = [];
      if (metaTag != null && String(metaTag).length) {
        // Padrão Samsung streaming: ApplicationControlData PAYLOAD
        data.push(new tizen.ApplicationControlData('PAYLOAD', [String(metaTag)]));
      }
      var appControl = new tizen.ApplicationControl(
        'http://tizen.org/appcontrol/operation/view',
        null,
        null,
        null,
        data.length ? data : null
      );

      tizen.application.launchAppControl(
        appControl,
        String(appId),
        function () {
          var ok = hw.result(true, 'launched', 'AppControl ok', {
            appId: appId,
            metaTag: metaTag || null
          });
          hw.log('launchDeepLink ok', ok);
          cb(ok);
        },
        function (err) {
          var fail = hw.result(false, 'launch_failed',
              (err && (err.message || err.name)) || 'launchAppControl falhou',
              { appId: appId, error: err });
          hw.log('launchDeepLink fail', fail);
          cb(fail);
        }
      );
      return hw.result(true, 'pending', 'launchAppControl disparado', { appId: appId });
    } catch (e) {
      var ex = hw.result(false, 'exception', e.message || String(e), { appId: appId });
      hw.log('launchDeepLink exception', ex);
      cb(ex);
      return ex;
    }
  }

  /** Atalho: só ID, sem deep link (abre home do app). */
  function launchApp(appId, done) {
    return launchDeepLink(appId, null, done);
  }

  hw.launcher = {
    launchDeepLink: launchDeepLink,
    launchApp: launchApp
  };
})(window);
