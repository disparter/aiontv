/* Resolve API a partir do host da página (TV/PC) — evita IP fixo errado. */
(function () {
  // Fallback = NIC do quarto (lab). Em runtime usa o host de onde a TV carregou a SPA.
  var host = (typeof location !== 'undefined' && location.hostname) ? location.hostname : '192.168.15.8';
  var port = (typeof location !== 'undefined' && location.port) ? location.port : '8080';
  if (!port) port = '8080';
  var isHttps = (typeof location !== 'undefined' && location.protocol === 'https:');
  var proto = isHttps ? 'https:' : 'http:';
  var wsProto = isHttps ? 'wss:' : 'ws:';
  var httpBase = proto + '//' + host + ':' + port;
  window.AiOnTvConfig = {
    apiBase: httpBase,
    wsUrl: wsProto + '//' + host + ':' + port + '/ws/tv',
    appVersion: '0.6.40',
    pingIntervalMs: 15000,
    reconnectBaseMs: 1000,
    reconnectMaxMs: 30000
  };
})();
