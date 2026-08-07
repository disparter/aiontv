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
    return fetch(this.baseUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  };

  global.AiOnTvRestClient = RestClient;
})(window);
