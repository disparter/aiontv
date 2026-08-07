(function (global) {
  'use strict';

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function WsClient(options) {
    this.url = options.url;
    this.onMessage = options.onMessage || function () {};
    this.onStatus = options.onStatus || function () {};
    this.pingIntervalMs = options.pingIntervalMs || 15000;
    this.reconnectBaseMs = options.reconnectBaseMs || 1000;
    this.reconnectMaxMs = options.reconnectMaxMs || 30000;
    this.sessionId = null;
    this.resumeToken = null;
    this._ws = null;
    this._pingTimer = null;
    this._reconnectAttempt = 0;
    this._closed = false;
    this._queue = [];
  }

  WsClient.prototype.connect = function () {
    var self = this;
    this._closed = false;
    this.onStatus('connecting');
    try {
      this._ws = new WebSocket(this.url);
    } catch (e) {
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = function () {
      self._reconnectAttempt = 0;
      self.onStatus('open');
      self.send('session.hello', {
        device: {
          model: '50RU7100',
          platform: 'tizen',
          appVersion: (global.AiOnTvConfig && global.AiOnTvConfig.appVersion) || '0.1.0',
          screen: { w: 1920, h: 1080 }
        },
        locale: 'pt-BR',
        capabilities: ['dpad', 'websocket', 'streaming_text'],
        resumeToken: self.resumeToken
      });
      self._flushQueue();
      self._startPing();
    };

    this._ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.type === 'session.ready' && msg.sessionId) {
        self.sessionId = msg.sessionId;
        if (msg.payload && msg.payload.resumeToken) {
          self.resumeToken = msg.payload.resumeToken;
        }
      }
      if (msg.type === 'pong') return;
      self.onMessage(msg);
    };

    this._ws.onclose = function () {
      self._stopPing();
      self.onStatus('closed');
      if (!self._closed) self._scheduleReconnect();
    };

    this._ws.onerror = function () {
      self.onStatus('error');
    };
  };

  WsClient.prototype.close = function () {
    this._closed = true;
    this._stopPing();
    if (this._ws) this._ws.close();
  };

  WsClient.prototype.send = function (type, payload) {
    var envelope = {
      v: 1,
      type: type,
      id: uuid(),
      ts: Date.now(),
      sessionId: this.sessionId,
      payload: payload || {}
    };
    if (!this._ws || this._ws.readyState !== 1) {
      if (type !== 'ping' && type !== 'session.hello') this._queue.push(envelope);
      return envelope.id;
    }
    this._ws.send(JSON.stringify(envelope));
    return envelope.id;
  };

  WsClient.prototype._flushQueue = function () {
    while (this._queue.length && this._ws && this._ws.readyState === 1) {
      var msg = this._queue.shift();
      msg.sessionId = this.sessionId;
      this._ws.send(JSON.stringify(msg));
    }
  };

  WsClient.prototype._startPing = function () {
    var self = this;
    this._stopPing();
    this._pingTimer = setInterval(function () {
      self.send('ping', {});
    }, this.pingIntervalMs);
  };

  WsClient.prototype._stopPing = function () {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  };

  WsClient.prototype._scheduleReconnect = function () {
    var self = this;
    var delay = Math.min(
      this.reconnectBaseMs * Math.pow(2, this._reconnectAttempt),
      this.reconnectMaxMs
    );
    this._reconnectAttempt += 1;
    this.onStatus('reconnect_in_' + delay);
    setTimeout(function () {
      if (!self._closed) self.connect();
    }, delay);
  };

  global.AiOnTvWsClient = WsClient;
})(window);
