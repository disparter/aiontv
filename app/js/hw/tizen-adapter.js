/**
 * Núcleo da Camada de Abstração de Hardware (HAL).
 * Isola detecção Tizen / webapis do resto da SPA.
 *
 * Privilege base (internet / d-pad): http://tizen.org/privilege/internet
 * Privilege teclas: http://tizen.org/privilege/tv.inputdevice
 */
(function (global) {
  'use strict';

  function safeGlobal(name) {
    try {
      return typeof global[name] !== 'undefined' ? global[name] : null;
    } catch (e) {
      return null;
    }
  }

  function isTizen() {
    return !!safeGlobal('tizen');
  }

  function isWebapis() {
    return !!safeGlobal('webapis');
  }

  /** Ambiente TV Samsung (TizenBrew / .wgt), não browser PC/celular. */
  function isTvRuntime() {
    if (!isTizen()) return false;
    try {
      var ua = (global.navigator && navigator.userAgent) || '';
      if (/Tizen|SMART-TV|Samsung/i.test(ua)) return true;
    } catch (e) { /* ignore */ }
    return true;
  }

  /**
   * Snapshot de capacidades — o Spring usa isso (session.hello / system.capabilities)
   * para decidir comando nativo vs macro cega do controle.
   */
  function probeCapabilities() {
    var tizenOk = isTizen();
    var webapisOk = isWebapis();
    var launch = false;
    var hdmi = false;
    var avplay = false;
    if (tizenOk) {
      try { launch = !!(global.tizen.application && global.tizen.application.launchAppControl); } catch (e) { /* */ }
      try { hdmi = !!(global.tizen.tvwindow && global.tizen.tvwindow.setSource); } catch (e2) { /* */ }
      try {
        if (global.tizen.systeminfo && global.tizen.systeminfo.getPropertyValue) hdmi = hdmi || true;
      } catch (e3) { /* */ }
    }
    if (webapisOk) {
      try { avplay = !!(global.webapis.avplay); } catch (e4) { /* */ }
    }
    return {
      tizen: tizenOk,
      webapis: webapisOk,
      tvRuntime: isTvRuntime(),
      nativeLaunch: launch,
      nativeHdmi: hdmi,
      avplay: avplay,
      // flags curtas pro array capabilities do session.hello
      flags: (function () {
        var out = ['dpad', 'websocket', 'streaming_text'];
        if (tizenOk) out.push('tizen');
        if (launch) out.push('native_launch');
        if (hdmi) out.push('native_hdmi');
        if (avplay) out.push('avplay');
        return out;
      })()
    };
  }

  function log(msg, detail) {
    try {
      if (global.console && console.log) {
        console.log('[AiOnTvHardware] ' + msg, detail == null ? '' : detail);
      }
    } catch (e) { /* ignore */ }
  }

  /**
   * Resultado padronizado das operações nativas.
   * @returns {{ ok: boolean, code: string, message: string, detail?: object }}
   */
  function result(ok, code, message, detail) {
    var r = { ok: !!ok, code: code || (ok ? 'ok' : 'error'), message: message || '' };
    if (detail) r.detail = detail;
    return r;
  }

  var api = {
    isTizen: isTizen,
    isWebapis: isWebapis,
    isTvRuntime: isTvRuntime,
    probeCapabilities: probeCapabilities,
    log: log,
    result: result,
    /** Preenchidos pelos módulos de capacidade (launcher / hdmi / avplay). */
    launcher: null,
    hdmi: null,
    avplay: null
  };

  global.AiOnTvHardware = api;
})(window);
