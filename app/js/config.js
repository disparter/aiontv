/* Resolve API a partir do host da página (TV/PC) — evita IP fixo errado. */
(function () {
  var host = (typeof location !== 'undefined' && location.hostname) ? location.hostname : '192.168.15.2';
  var port = (typeof location !== 'undefined' && location.port) ? location.port : '8080';
  if (!port) port = '8080';
  var httpBase = 'http://' + host + ':' + port;
  window.AiOnTvConfig = {
    apiBase: httpBase,
    wsUrl: 'ws://' + host + ':' + port + '/ws/tv',
    appVersion: '0.2.0',
    pingIntervalMs: 15000,
    reconnectBaseMs: 1000,
    reconnectMaxMs: 30000
  };
})();
