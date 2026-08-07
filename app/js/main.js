(function () {
  'use strict';

  var cfg = window.AiOnTvConfig;
  var focus = new window.AiOnTvFocusManager();
  var rest = new window.AiOnTvRestClient(cfg.apiBase);
  var ws = null;
  var currentScreen = 'home';
  var keyboard = null;
  var busy = false;

  function setStatus(text) {
    var el = document.getElementById('status_line');
    if (el) el.textContent = text;
    var c = document.getElementById('chat_status');
    if (c && currentScreen === 'chat') c.textContent = text;
  }

  function showScreen(name) {
    currentScreen = name;
    var home = document.getElementById('screen_home');
    var chat = document.getElementById('screen_chat');
    if (name === 'chat') {
      home.classList.add('hidden');
      home.hidden = true;
      chat.classList.remove('hidden');
      chat.hidden = false;
      focus.setScreen('chat');
      focus.ensureFocus();
      if (!document.querySelector('#keyboard .focused')) {
        var firstKey = document.querySelector('#keyboard .key');
        if (firstKey) focus.focus(firstKey.id);
        else focus.focus('btn_send');
      }
    } else {
      chat.classList.add('hidden');
      chat.hidden = true;
      home.classList.remove('hidden');
      home.hidden = false;
      focus.setScreen('home');
      focus.ensureFocus();
    }
  }

  function updatePreview(v) {
    var el = document.getElementById('prompt_preview');
    if (el) el.textContent = v || 'Digite com o teclado ↓';
  }

  function playPayload(payload) {
    if (!payload || busy) return;
    busy = true;
    setStatus('Abrindo ' + (payload.title || payload.appName || 'app') + '…');
    var body = {
      appId: payload.appId || '',
      appName: payload.appName || '',
      title: payload.title || '',
      posterUrl: payload.posterUrl || '',
      source: 'catalog'
    };
    rest.post('/api/v1/catalog/play', body).then(function (res) {
      busy = false;
      setStatus(res && res.ok ? (res.message || 'OK') : ((res && res.message) || 'Falhou'));
      // atualiza fileira de histórico
      loadCatalogQuiet();
    }).catch(function (e) {
      busy = false;
      setStatus('Erro ao abrir: ' + (e.message || e));
    });
  }

  function requestAi(text) {
    if (!ws || !text || !text.trim()) return;
    showScreen('chat');
    window.AiOnTvChatUi.appendLine('user', text);
    setStatus('Pensando…');
    document.getElementById('chat_status').textContent = 'Pensando…';
    var corr = ws.send('ai_request', {
      agentHint: 'chat',
      input: { mode: 'text', text: text },
      uiContext: {
        screen: currentScreen,
        focusId: focus.focusId,
        visibleLabels: []
      },
      options: { stream: true, maxTokens: 512 }
    });
    window.AiOnTvChatUi.beginStream(corr);
  }

  function activateFocused() {
    var el = document.getElementById(focus.focusId);
    if (!el) return;
    var action = el.getAttribute('data-action');

    if (action === 'chat') {
      showScreen('chat');
      return;
    }
    if (action === 'home') {
      showScreen('home');
      return;
    }
    if (action === 'play-hero') {
      playPayload(window.AiOnTvCatalogView.currentPlayPayload());
      return;
    }
    if (action === 'ask-hero') {
      var p = window.AiOnTvCatalogView.currentPlayPayload();
      if (p) requestAi('Abra ' + p.title + (p.appName ? ' no ' + p.appName : ''));
      return;
    }
    if (action === 'play-title') {
      var item = el._catalogItem || {};
      playPayload({
        appId: el.getAttribute('data-app-id') || '',
        appName: el.getAttribute('data-app-name') || '',
        title: el.getAttribute('data-title') || '',
        posterUrl: item.posterUrl || ''
      });
      return;
    }
    if (action === 'key') {
      var result = keyboard.press(el.getAttribute('data-key'));
      if (result === 'submit') {
        requestAi(keyboard.value);
        keyboard.clear();
      }
      return;
    }
    if (action === 'send') {
      requestAi(keyboard.value);
      keyboard.clear();
      return;
    }
    if (action === 'clear') {
      keyboard.clear();
      return;
    }
  }

  function handleServerMessage(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'session.ready') {
      setStatus('Conectado · catálogo pronto');
      return;
    }
    if (msg.type === 'update_ui_element' && msg.payload) {
      window.AiOnTvRenderer.applyOps(msg.payload.ops, focus);
      return;
    }
    if (msg.type === 'ai_response_chunk' && msg.payload) {
      window.AiOnTvChatUi.appendChunk(msg.payload.correlationId, msg.payload.delta || '');
      return;
    }
    if (msg.type === 'ai_response_done' && msg.payload) {
      window.AiOnTvChatUi.endStream(msg.payload.correlationId);
      document.getElementById('chat_status').textContent = 'Pronto';
      return;
    }
    if (msg.type === 'ai_response_error' && msg.payload) {
      document.getElementById('chat_status').textContent = msg.payload.message || 'Erro';
      window.AiOnTvChatUi.appendLine('system', msg.payload.message || 'Erro na IA');
    }
  }

  function onKeyDown(event) {
    var key = window.AiOnTvKeyMap.normalizeKey(event);
    if (!key) return;

    // typing from PC keyboard while on chat
    if (currentScreen === 'chat' && key.length === 1 && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      keyboard.value += key;
      updatePreview(keyboard.value);
      return;
    }
    if (currentScreen === 'chat' && key === 'Backspace') {
      event.preventDefault();
      keyboard.value = keyboard.value.slice(0, -1);
      updatePreview(keyboard.value);
      return;
    }

    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
      event.preventDefault();
      focus.move(key);
      var focused = document.getElementById(focus.focusId);
      if (focused && focused.classList.contains('tile')) {
        window.AiOnTvCatalogView.onTileFocus(focused);
      }
      return;
    }

    if (key === 'Enter') {
      event.preventDefault();
      activateFocused();
      return;
    }

    if (key === 'Back') {
      event.preventDefault();
      if (currentScreen === 'chat') showScreen('home');
      return;
    }
  }

  function loadCatalog() {
    setStatus('Carregando catálogo…');
    return rest.get('/api/v1/catalog/home').then(function (home) {
      window.AiOnTvCatalogView.render(home, focus);
      setStatus((home.source || 'catálogo') + ' · ' + ((home.rows && home.rows.length) || 0) + ' fileiras');
      showScreen('home');
    }).catch(function (e) {
      setStatus('Falha no catálogo: ' + (e.message || e));
      document.getElementById('hero_title').textContent = 'Catálogo indisponível';
      document.getElementById('hero_overview').textContent = 'Backend offline ou ainda iniciando. Tente de novo.';
    });
  }

  function loadCatalogQuiet() {
    rest.get('/api/v1/catalog/home').then(function (home) {
      if (currentScreen !== 'home') return;
      var keep = focus.focusId;
      window.AiOnTvCatalogView.render(home, focus);
      if (keep) focus.focus(keep);
    }).catch(function () { /* ignore */ });
  }

  function boot() {
    window.AiOnTvKeyMap.registerMediaKeys();

    keyboard = new window.AiOnTvKeyboard('keyboard', updatePreview);
    keyboard.mount();

    document.getElementById('btn_open_chat').addEventListener('click', function () { showScreen('chat'); });
    document.getElementById('btn_back_catalog').addEventListener('click', function () { showScreen('home'); });
    document.getElementById('btn_play_hero').addEventListener('click', function () {
      playPayload(window.AiOnTvCatalogView.currentPlayPayload());
    });
    document.getElementById('btn_ask_hero').addEventListener('click', activateFocused);
    document.getElementById('btn_send').addEventListener('click', function () {
      requestAi(keyboard.value);
      keyboard.clear();
    });
    document.getElementById('btn_clear').addEventListener('click', function () { keyboard.clear(); });

    showScreen('home');
    setStatus('Conectando…');

    ws = new window.AiOnTvWsClient({
      url: cfg.wsUrl,
      pingIntervalMs: cfg.pingIntervalMs,
      reconnectBaseMs: cfg.reconnectBaseMs,
      reconnectMaxMs: cfg.reconnectMaxMs,
      onStatus: function (s) {
        if (s === 'open') setStatus('WebSocket OK');
        else if (s.indexOf('reconnect') === 0) setStatus('Reconectando…');
        else if (s === 'closed' || s === 'error') setStatus('Sem WebSocket');
      },
      onMessage: handleServerMessage
    });
    ws.connect();

    loadCatalog();
    document.addEventListener('keydown', onKeyDown, true);

    // re-focus tile updates hero when focus class changes via ensureFocus
    var obs = new MutationObserver(function () {
      var el = document.querySelector('.tile.focused');
      if (el) window.AiOnTvCatalogView.onTileFocus(el);
    });
    obs.observe(document.getElementById('rows'), { attributes: true, subtree: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
