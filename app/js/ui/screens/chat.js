(function (global) {
  'use strict';

  var streamBuffers = {};

  function showChat(focusManager) {
    var home = document.getElementById('screen_home');
    var chat = document.getElementById('screen_chat');
    home.hidden = true;
    home.classList.add('hidden');
    chat.hidden = false;
    chat.classList.remove('hidden');
    focusManager.setScreen('chat');
    if (!focusManager.focus('sug_2')) {
      focusManager.focus('sug_1');
    }
  }

  function appendLine(role, text) {
    var log = document.getElementById('chat_log');
    var line = document.createElement('div');
    line.className = 'chat-line ' + role;
    line.textContent = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
    return line;
  }

  function beginStream(correlationId) {
    var line = appendLine('assistant', '');
    streamBuffers[correlationId] = { el: line, text: '' };
  }

  function appendChunk(correlationId, delta) {
    var buf = streamBuffers[correlationId];
    if (!buf) {
      beginStream(correlationId);
      buf = streamBuffers[correlationId];
    }
    buf.text += delta;
    buf.el.textContent = buf.text;
    var log = document.getElementById('chat_log');
    log.scrollTop = log.scrollHeight;
  }

  function endStream(correlationId) {
    delete streamBuffers[correlationId];
  }

  global.AiOnTvChatScreen = {
    show: showChat,
    appendLine: appendLine,
    beginStream: beginStream,
    appendChunk: appendChunk,
    endStream: endStream
  };
})(window);
