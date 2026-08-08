(function (global) {
  'use strict';

  function RestClient(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  RestClient.prototype.get = function (path) {
    return fetch(this.baseUrl + path).then(function (r) {
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

  /** Multipart (áudio companion) — não seta Content-Type (boundary do browser). */
  RestClient.prototype.postForm = function (path, formData) {
    return fetch(this.baseUrl + path, {
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
    return fetch(this.baseUrl + path, {
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
          throw new Error((data && data.message) || ('HTTP ' + r.status));
        }
        return data || {};
      });
    });
  };

  global.AiOnTvRestClient = RestClient;
})(window);
