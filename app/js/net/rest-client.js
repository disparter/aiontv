(function (global) {
  'use strict';

  var DEFAULT_TIMEOUT_MS = 20000;

  function RestClient(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  RestClient.prototype._fetch = function (path, init, timeoutMs) {
    var ms = timeoutMs == null ? DEFAULT_TIMEOUT_MS : timeoutMs;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var opts = {};
    var src = init || {};
    for (var k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k)) opts[k] = src[k];
    }
    if (ctrl) opts.signal = ctrl.signal;
    var timer = null;
    if (ctrl && ms > 0) {
      timer = setTimeout(function () {
        try { ctrl.abort(); } catch (e) { /* */ }
      }, ms);
    }
    function clear() {
      if (timer) clearTimeout(timer);
    }
    return fetch(this.baseUrl + path, opts).then(function (r) {
      clear();
      return r;
    }, function (e) {
      clear();
      if (e && (e.name === 'AbortError' || (e.message && e.message.indexOf('aborted') >= 0))) {
        throw new Error('Timeout (' + Math.round(ms / 1000) + 's) em ' + path);
      }
      throw e;
    });
  };

  RestClient.prototype.get = function (path, timeoutMs) {
    return this._fetch(path, undefined, timeoutMs).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  };

  RestClient.prototype.post = function (path, body) {
    return this._json('POST', path, body);
  };

  RestClient.prototype.put = function (path, body) {
    return this._json('PUT', path, body);
  };

  RestClient.prototype.del = function (path) {
    return this._json('DELETE', path, {});
  };

  /** Multipart (áudio companion) — não seta Content-Type (boundary do browser). */
  RestClient.prototype.postForm = function (path, formData) {
    return this._fetch(path, {
      method: 'POST',
      body: formData
    }).then(function (r) {
      return r.text().then(function (raw) {
        var data = null;
        if (raw) {
          try { data = JSON.parse(raw); } catch (e) { /* ignore */ }
        }
        if (!r.ok) {
          throw new Error((data && data.message) || ('HTTP ' + r.status));
        }
        return data || {};
      });
    });
  };

  RestClient.prototype._json = function (method, path, body) {
    return this._fetch(path, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.text().then(function (raw) {
        var data = null;
        if (raw) {
          try { data = JSON.parse(raw); } catch (e) { /* ignore */ }
        }
        if (!r.ok) {
          var err = new Error((data && data.message) || ('HTTP ' + r.status));
          err.status = r.status;
          err.payload = data || {};
          throw err;
        }
        return data || {};
      });
    });
  };

  global.AiOnTvRestClient = RestClient;
})(window);
