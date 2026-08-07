(function (global) {
  'use strict';

  function applyOps(ops, focus) {
    if (!ops || !ops.length) return;
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (!op || !op.op) continue;
      if (op.op === 'set_text' && op.id) {
        var el = document.getElementById(op.id);
        if (el) el.textContent = op.text || '';
      }
      if (op.op === 'focus' && op.id && focus) {
        focus.focus(op.id);
      }
    }
  }

  // Chat helpers used by main
  var streams = {};

  function appendLine(role, text) {
    var log = document.getElementById('chat_log');
    if (!log) return;
    var div = document.createElement('div');
    div.className = 'chat-line ' + role;
    div.textContent = (role === 'user' ? 'Você: ' : role === 'assistant' ? 'IA: ' : '') + text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function beginStream(corr) {
    streams[corr] = '';
    var log = document.getElementById('chat_log');
    var div = document.createElement('div');
    div.className = 'chat-line assistant';
    div.id = 'stream_' + corr;
    div.textContent = 'IA: ';
    log.appendChild(div);
  }

  function appendChunk(corr, delta) {
    streams[corr] = (streams[corr] || '') + (delta || '');
    var el = document.getElementById('stream_' + corr);
    if (el) el.textContent = 'IA: ' + streams[corr];
    var log = document.getElementById('chat_log');
    if (log) log.scrollTop = log.scrollHeight;
  }

  function endStream(corr) {
    delete streams[corr];
  }

  global.AiOnTvRenderer = { applyOps: applyOps };
  global.AiOnTvChatUi = {
    appendLine: appendLine,
    beginStream: beginStream,
    appendChunk: appendChunk,
    endStream: endStream
  };
})(window);
