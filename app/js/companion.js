(function (global) {
  'use strict';

  function detectCompanion() {
    try {
      var q = new URLSearchParams(location.search || '');
      if (q.get('mode') === 'tv') return false;
      if (q.get('mode') === 'companion' || q.get('companion') === '1') return true;
      var w = Math.min(window.innerWidth || 9999, screen.width || 9999);
      var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      return touch && w < 920;
    } catch (e) {
      return false;
    }
  }

  function httpsCompanionUrl() {
    // Prefer hostname de onde a página carregou; fallback local
    var host = location.hostname || 'localhost';
    var path = location.pathname || '/tv/';
    var search = location.search || '?mode=companion';
    if (search.indexOf('mode=') < 0) {
      search += (search.indexOf('?') === 0 ? '&' : '?') + 'mode=companion';
    }
    if (search.indexOf('v=') < 0) {
      search += '&v=0.6.39';
    }
    return 'https://' + host + ':8443' + path + search;
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!global.isSecureContext && location.hostname !== 'localhost') return;
    var swUrl = 'sw.js';
    try {
      navigator.serviceWorker.register(swUrl, { scope: './' }).catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
  }

  /**
   * Android Chrome bloqueia mic em http://IP sem nem pedir permissão.
   * Companion deve rodar em https://IP:8443 (certificado local).
   */
  function ensureSecureCompanion() {
    if (!detectCompanion()) return false;
    if (global.isSecureContext) return false;
    if (location.protocol === 'https:') return false;
    var skip = false;
    try {
      skip = new URLSearchParams(location.search || '').get('httpMic') === '1';
    } catch (e) { /* */ }
    if (skip) return false;

    var target = httpsCompanionUrl();
    var banner = document.createElement('div');
    banner.id = 'companion_https_gate';
    banner.setAttribute('style',
        'position:fixed;inset:0;z-index:99999;background:#0a101c;color:#e8eef8;'
        + 'display:flex;flex-direction:column;justify-content:center;padding:24px;'
        + 'font-family:system-ui,sans-serif;gap:14px;');
    banner.innerHTML =
        '<div style="font-size:22px;font-weight:700">Microfone no Android</div>'
        + '<p style="margin:0;line-height:1.45;color:#8fa3bf;font-size:15px">'
        + 'O Chrome <b style="color:#e8eef8">não pede mic em HTTP</b>. '
        + 'Abra o companion em HTTPS (aceite o aviso de certificado uma vez) e o pedido de microfone aparece.</p>'
        + '<a id="btn_open_https" href="' + target + '" '
        + 'style="display:block;text-align:center;padding:16px;border-radius:14px;'
        + 'background:rgba(61,184,255,.2);border:1px solid rgba(61,184,255,.6);'
        + 'color:#3db8ff;font-weight:700;font-size:17px;text-decoration:none">'
        + 'Abrir com HTTPS (mic)</a>'
        + '<p style="margin:0;font-size:12px;color:#8fa3bf;word-break:break-all">' + target + '</p>'
        + '<button type="button" id="btn_stay_http" '
        + 'style="padding:12px;border-radius:12px;border:1px solid rgba(143,163,191,.3);'
        + 'background:#121a2b;color:#8fa3bf;font-size:14px">Continuar sem mic (só digitar)</button>';
    document.documentElement.appendChild(banner);
    document.getElementById('btn_stay_http').onclick = function () {
      banner.remove();
    };
    // Não redireciona sozinho: na sala (Wi-Fi) o HTTPS:8443 / certificado local
    // costuma quebrar o companion. Mic fica opcional via botão HTTPS.
    return true;
  }

  function applyDocumentMode(companion) {
    var meta = document.querySelector('meta[name="viewport"]');
    if (companion) {
      document.documentElement.classList.add('companion-mode');
      document.body.classList.add('companion-mode');
      if (meta) {
        meta.setAttribute('content',
            'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover');
      }
      document.title = 'JarvisTV · Companion';
    } else {
      document.documentElement.classList.remove('companion-mode');
      document.body.classList.remove('companion-mode');
      if (meta) {
        meta.setAttribute('content', 'width=1920, height=1080, user-scalable=no');
      }
    }
  }

  global.AiOnTvCompanion = {
    detect: detectCompanion,
    applyDocumentMode: applyDocumentMode,
    ensureSecureCompanion: ensureSecureCompanion,
    httpsCompanionUrl: httpsCompanionUrl,
    registerServiceWorker: registerServiceWorker
  };
})(window);
