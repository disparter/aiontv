(function () {
  'use strict';

  var cfg = window.AiOnTvConfig;
  var companionMode = window.AiOnTvCompanion && window.AiOnTvCompanion.detect();
  if (window.AiOnTvCompanion) {
    window.AiOnTvCompanion.applyDocumentMode(companionMode);
    // Android: mic só com HTTPS — redireciona companion http→https:8443
    if (companionMode && window.AiOnTvCompanion.ensureSecureCompanion()) {
      return;
    }
    if (companionMode && window.AiOnTvCompanion.registerServiceWorker) {
      window.AiOnTvCompanion.registerServiceWorker();
    }
  }

  var focus = new window.AiOnTvFocusManager();
  var rest = new window.AiOnTvRestClient(cfg.apiBase);
  window.__aionRest = rest;
  var ws = null;
  var currentScreen = companionMode ? 'companion' : 'home';
  var keyboard = null;
  var searchKeyboard = null;
  var busy = false;
  var companionCursor = 0;
  var companionPollTimer = null;
  var companionInboxCursor = 0;
  var companionSessionId = '';
  var pendingPinDeviceId = '';
  var companionEntered = false;
  var companionDeviceHint = '';
  var companionLoginPeople = [];
  var companionLoginPerson = null;
  var companionCatalogHome = null;
  var companionCatalogSearchTimer = null;
  var companionCatalogSearchSeq = 0;
  var companionCatalogRenderSeq = 0;
  var companionAdminUnlocked = false;
  var companionAdminEditPersonId = '';
  var companionToastTimer = null;
  var companionPendingMode = null; // 'title' | 'audit'
  var tvSelfDeviceId = '';
  var tvEntered = false;

  function queryParam(name) {
    try {
      return (new URLSearchParams(location.search || '').get(name) || '').trim();
    } catch (e) {
      return '';
    }
  }

  function ensureCompanionSession() {
    if (!companionSessionId) {
      try { companionSessionId = localStorage.getItem('aiontv_session') || ''; } catch (e) { /* */ }
    }
    if (!companionSessionId) {
      companionSessionId = 'sess_companion_' + Date.now().toString(36);
    }
    try { localStorage.setItem('aiontv_session', companionSessionId); } catch (e) { /* */ }
    return companionSessionId;
  }

  function resolveSelfDeviceId() {
    var fromQ = queryParam('deviceId') || queryParam('deviceHint');
    if (fromQ) {
      try { localStorage.setItem('aiontv_self_device', fromQ); } catch (e) { /* */ }
      return fromQ;
    }
    try {
      return localStorage.getItem('aiontv_self_device') || '';
    } catch (e) {
      return '';
    }
  }

  function showCompanionLoginGate(show) {
    var gate = document.getElementById('companion_login_gate');
    if (!gate) return;
    gate.hidden = !show;
  }

  function householdEnter(personId, deviceId) {
    ensureCompanionSession();
    return rest.post('/api/v1/household/enter', {
      personId: personId,
      deviceId: deviceId || undefined,
      deviceHint: companionDeviceHint || tvSelfDeviceId || undefined,
      sessionId: companionSessionId
    }).then(function (res) {
      if (res && res.sessionId) companionSessionId = res.sessionId;
      try { localStorage.setItem('aiontv_session', companionSessionId); } catch (e) { /* */ }
      try { localStorage.setItem('aiontv_last_person', personId); } catch (e) { /* */ }
      if (res && res.code === 'PIN_REQUIRED') {
        showCompanionPin(res.activeDeviceId || deviceId, res.pinMessage || res.message);
      }
      return res;
    });
  }

  function renderCompanionLoginChoices(items, onPick) {
    var root = document.getElementById('companion_login_choices');
    if (!root) return;
    root.innerHTML = '';
    (items || []).forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'companion-person';
      b.textContent = item.label;
      if (item.title) b.title = item.title;
      b.addEventListener('click', function () { onPick(item); });
      root.appendChild(b);
    });
  }

  function showCompanionPersonStep(sug) {
    companionLoginPerson = null;
    var title = document.getElementById('companion_login_title');
    var hint = document.getElementById('companion_login_hint');
    var back = document.getElementById('companion_login_back');
    if (title) title.textContent = 'Quem é você?';
    if (hint) {
      hint.textContent = companionDeviceHint
          ? ('Origem: ' + companionDeviceHint + ' — escolha o perfil')
          : 'Escolha o perfil pra controlar a casa';
    }
    if (back) back.hidden = true;
    companionLoginPeople = sug.people || [];
    var last = '';
    try { last = localStorage.getItem('aiontv_last_person') || ''; } catch (e) { /* */ }
    var items = companionLoginPeople.map(function (p) {
      var rooms = (p.devices || []).map(function (d) {
        return roomLabel(d.roomId);
      }).filter(function (v, i, a) { return a.indexOf(v) === i; });
      return {
        id: p.id,
        label: p.name + (rooms.length ? (' · ' + rooms.join(' · ')) : '') + (p.id === last ? ' · recente' : ''),
        title: (p.devices || []).map(function (d) { return roomLabel(d.roomId) + ' · ' + d.name; }).join('; '),
        person: p
      };
    });
    renderCompanionLoginChoices(items, function (item) {
      companionLoginPerson = item.person;
      showCompanionDeviceStep(item.person);
    });
    showCompanionLoginGate(true);
  }

  function showCompanionDeviceStep(person) {
    var title = document.getElementById('companion_login_title');
    var hint = document.getElementById('companion_login_hint');
    var back = document.getElementById('companion_login_back');
    if (title) title.textContent = 'Controlar qual aparelho?';
    if (hint) hint.textContent = (person.name || person.id) + ' — toque o aparelho';
    if (back) {
      back.hidden = false;
      back.onclick = function () { showCompanionPersonStep({ people: companionLoginPeople }); };
    }
    var devices = person.devices || [];
    if (devices.length === 1) {
      finishCompanionEnter(person.id, devices[0].id);
      return;
    }
    var items = devices.map(function (d) {
      return {
        id: d.id,
        label: roomLabel(d.roomId) + ' · ' + (d.name || d.id),
        deviceId: d.id
      };
    });
    renderCompanionLoginChoices(items, function (item) {
      finishCompanionEnter(person.id, item.deviceId);
    });
  }

  function finishCompanionEnter(personId, deviceId) {
    householdEnter(personId, deviceId).then(function (res) {
      companionEntered = true;
      showCompanionLoginGate(false);
      applyHousehold(res);
      refreshCompanionHousehold();
      showCompanionToast(res.message || ('Entrou: ' + (res.activePersonName || personId)));
      updateCompanionHeader(res);
    }).catch(function (e) {
      showCompanionToast((e.payload && e.payload.message) || e.message || 'Falha ao entrar');
    });
  }

  function startCompanionLogin() {
    companionDeviceHint = queryParam('deviceId') || queryParam('deviceHint') || '';
    ensureCompanionSession();
    var q = '/api/v1/household/suggest?sessionId=' + encodeURIComponent(companionSessionId);
    if (companionDeviceHint) q += '&deviceHint=' + encodeURIComponent(companionDeviceHint);
    rest.get(q).then(function (sug) {
      if (sug && sug.sessionBound && sug.sessionPersonId && sug.sessionDeviceId) {
        companionEntered = true;
        showCompanionLoginGate(false);
        return refreshCompanionHousehold().then(function (data) {
          if (data) applyHousehold(data);
          var sub = document.getElementById('companion_sub');
          if (sub) {
            sub.textContent = 'Perfil ' + ((data && data.activePersonName) || sug.sessionPersonId)
                + ' · sessão';
          }
        });
      }
      if (sug && sug.autoEnter && sug.personId && sug.deviceId) {
        return finishCompanionEnter(sug.personId, sug.deviceId);
      }
      showCompanionPersonStep(sug || { people: [] });
    }).catch(function () {
      setStatus('Household offline');
      showCompanionLoginGate(false);
    });
  }

  function startTvLogin() {
    tvSelfDeviceId = resolveSelfDeviceId();
    ensureCompanionSession();
    var q = '/api/v1/household/suggest?sessionId=' + encodeURIComponent(companionSessionId);
    if (tvSelfDeviceId) q += '&deviceHint=' + encodeURIComponent(tvSelfDeviceId);
    return rest.get(q, 12000).then(function (sug) {
      if (sug && sug.autoEnter && sug.personId && sug.deviceId) {
        return householdEnter(sug.personId, sug.deviceId).then(function (res) {
          tvEntered = true;
          applyHousehold(res);
          return res;
        });
      }
      var people = (sug && sug.people) || [];
      if (people.length === 1 && people[0].suggestedDeviceId) {
        return householdEnter(people[0].id, people[0].suggestedDeviceId).then(function (res) {
          tvEntered = true;
          applyHousehold(res);
          return res;
        });
      }
      return showTvLoginPicker(people);
    });
  }

  var AVATAR_COLORS = ['#e50914', '#1a73e8', '#34a853', '#f9ab00', '#a142f4', '#ff6d00', '#00acc1', '#c2185b'];

  function personInitials(name) {
    var n = (name || '?').trim();
    var parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }

  function personAvatarColor(id) {
    var s = String(id || 'x');
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

  function resolveAvatarUrl(url) {
    if (!url) return '';
    var u = String(url).trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u) || u.indexOf('data:') === 0) return u;
    if (u.charAt(0) === '/') return u;
    // relativo à pasta /tv/
    var base = (window.AiOnTvConfig && window.AiOnTvConfig.apiBase) || '';
    return base + '/tv/' + u.replace(/^\.\//, '');
  }

  function fillProfileAvatar(el, person) {
    if (!el || !person) return;
    var url = resolveAvatarUrl(person.avatarUrl || '');
    el.textContent = '';
    el.style.backgroundImage = '';
    if (url) {
      el.style.backgroundImage = 'url("' + url.replace(/"/g, '') + '")';
      el.style.backgroundColor = '#222';
    } else {
      el.style.backgroundColor = personAvatarColor(person.id);
      el.textContent = personInitials(person.name || person.id);
    }
  }

  var avatarCatalog = null;

  function loadAvatarCatalog() {
    if (avatarCatalog) return Promise.resolve(avatarCatalog);
    return rest.get('/tv/assets/avatars/avatars.json').then(function (res) {
      avatarCatalog = (res && res.avatars) || [];
      return avatarCatalog;
    }).catch(function () {
      avatarCatalog = [];
      return avatarCatalog;
    });
  }

  function renderAvatarPicker(data) {
    var root = document.getElementById('avatar_picker');
    if (!root || !data) return;
    var person = editingPerson(data);
    var current = (person && person.avatarUrl) || '';
    loadAvatarCatalog().then(function (list) {
      root.innerHTML = '';
      var initials = document.createElement('button');
      initials.type = 'button';
      initials.className = 'avatar-pick initials' + (!current ? ' selected' : '');
      initials.id = 'avatar_pick_initials';
      initials.setAttribute('data-focusable', 'true');
      initials.setAttribute('data-action', 'pick-avatar');
      initials.setAttribute('data-avatar-url', '');
      initials.style.backgroundColor = personAvatarColor(person && person.id);
      initials.textContent = personInitials(person && person.name);
      root.appendChild(initials);
      (list || []).forEach(function (av, idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'avatar-pick' + (current === av.url ? ' selected' : '');
        btn.id = 'avatar_pick_' + idx;
        btn.setAttribute('data-focusable', 'true');
        btn.setAttribute('data-action', 'pick-avatar');
        btn.setAttribute('data-avatar-url', av.url || '');
        btn.setAttribute('aria-label', av.label || av.id || 'avatar');
        btn.style.backgroundImage = 'url("' + resolveAvatarUrl(av.url).replace(/"/g, '') + '")';
        root.appendChild(btn);
      });
    });
  }

  function pickAvatar(url) {
    var person = editingPerson(householdCache);
    var personId = (person && person.id) || profileEditPersonId || '';
    if (!personId) {
      setStatus('Selecione um perfil antes');
      return;
    }
    rest.put('/api/v1/household/person/' + encodeURIComponent(personId) + '/avatar', {
      avatarUrl: url || ''
    }).then(function (data) {
      profileEditPersonId = personId;
      applyHousehold(data);
      setStatus(url ? 'Avatar atualizado' : 'Usando iniciais');
    }).catch(function (e) {
      setStatus((e.payload && e.payload.message) || e.message || 'Falha no avatar');
    });
  }

  function platformLabel(d) {
    var p = ((d && (d.platform || d.type)) || '').toLowerCase();
    if (p.indexOf('android') >= 0) return 'Android TV';
    if (p.indexOf('tizen') >= 0 || p.indexOf('samsung') >= 0) return 'Tizen';
    if (p === 'steam' || (d && d.id) === 'steam-pc') return 'Steam · PC';
    if ((d && d.role) === 'console' || p === 'ps5' || p === 'switch') return 'Console';
    return p || 'TV';
  }

  function renderProfileDevices(data) {
    var devicesEl = document.getElementById('devices_list');
    if (!devicesEl || !data || !data.devices) return;
    devicesEl.innerHTML = '';
    var person = editingPerson(data);
    if (!person) {
      devicesEl.innerHTML = '<p class="matrix-hint">Selecione um perfil acima.</p>';
      return;
    }
    var allowed = personAllowedIds(person);
    var allIds = data.devices.map(function (d) { return d.id; });
    var effective = allowed.length ? allowed : allIds.slice();
    data.devices.forEach(function (d, idx) {
      var on = effective.some(function (id) { return id.toLowerCase() === d.id.toLowerCase(); });
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'device-row device-toggle' + (on ? ' on' : '') + (d.id === data.activeDeviceId ? ' active' : '');
      btn.id = 'dev_toggle_' + idx;
      btn.setAttribute('data-focusable', 'true');
      btn.setAttribute('data-action', 'toggle-device');
      btn.setAttribute('data-device-id', d.id || '');
      btn.setAttribute('data-person-id', person.id || '');
      var hdmi = d.hdmi ? (' · HDMI ' + d.hdmi) : '';
      var off = d.enabled === false ? ' · off' : '';
      btn.textContent = (on ? '✓ ' : '○ ') + roomLabel(d.roomId) + ' · ' + (d.name || d.id)
          + ' · ' + platformLabel(d) + hdmi + off;
      devicesEl.appendChild(btn);
    });
  }

  var ROOM_CYCLE = ['living', 'bedroom', 'mother', 'micael'];

  function renderHouseDevices(data) {
    var root = document.getElementById('house_devices');
    if (!root || !data || !data.devices) return;
    root.innerHTML = '';
    data.devices.forEach(function (d, idx) {
      if ((d.role || 'tv') !== 'tv' && (d.role || '') !== 'console') return;
      var row = document.createElement('div');
      row.className = 'house-device-row';
      var title = document.createElement('div');
      title.className = 'house-device-title';
      title.textContent = (d.name || d.id) + (d.enabled === false ? ' (desligado)' : '');
      row.appendChild(title);
      if ((d.role || 'tv') === 'tv') {
        var plat = document.createElement('button');
        plat.type = 'button';
        plat.className = 'device-row';
        plat.id = 'house_plat_' + idx;
        plat.setAttribute('data-focusable', 'true');
        plat.setAttribute('data-action', 'cycle-platform');
        plat.setAttribute('data-device-id', d.id || '');
        plat.textContent = 'Tipo: ' + platformLabel(d) + ' (OK troca Tizen ↔ Android TV)';
        row.appendChild(plat);
      }
      var room = document.createElement('button');
      room.type = 'button';
      room.className = 'device-row';
      room.id = 'house_room_' + idx;
      room.setAttribute('data-focusable', 'true');
      room.setAttribute('data-action', 'cycle-room');
      room.setAttribute('data-device-id', d.id || '');
      room.setAttribute('data-room-id', d.roomId || 'living');
      room.textContent = 'Quarto/casa: ' + roomLabel(d.roomId) + ' (OK troca)';
      row.appendChild(room);
      root.appendChild(row);
    });
  }

  function cycleDevicePlatform(deviceId) {
    if (!deviceId || !householdCache) return;
    var d = null;
    (householdCache.devices || []).forEach(function (x) {
      if (x.id === deviceId) d = x;
    });
    if (!d || (d.role || 'tv') !== 'tv') return;
    var cur = ((d.platform || d.type) || '').toLowerCase();
    var next = cur.indexOf('android') >= 0 ? 'samsung_tizen' : 'android_tv';
    rest.put('/api/v1/household/devices/' + encodeURIComponent(deviceId) + '/platform', {
      platform: next
    }).then(function (data) {
      applyHousehold(data);
      setStatus((d.name || deviceId) + ' → ' + platformLabel({ platform: next, role: 'tv' }));
    }).catch(function (e) {
      setStatus((e.payload && e.payload.message) || e.message || 'Falha na plataforma');
    });
  }

  function cycleDeviceRoom(deviceId, currentRoom) {
    if (!deviceId) return;
    var i = ROOM_CYCLE.indexOf((currentRoom || 'living').toLowerCase());
    var next = ROOM_CYCLE[(i + 1) % ROOM_CYCLE.length];
    rest.put('/api/v1/household/devices/' + encodeURIComponent(deviceId) + '/room', {
      roomId: next
    }).then(function (data) {
      applyHousehold(data);
      setStatus('Quarto → ' + roomLabel(next));
    }).catch(function (e) {
      setStatus((e.payload && e.payload.message) || e.message || 'Falha no quarto');
    });
  }

  function gamesPlatLabel(p) {
    if (p === 'ps5') return 'PlayStation 5';
    if (p === 'switch') return 'Nintendo Switch';
    if (p === 'steam') return 'Steam · PC';
    return p || '?';
  }

  function platformMetaList(data) {
    var plats = (data && data.platforms) || [];
    var byId = {};
    plats.forEach(function (pc) {
      if (pc && pc.platform) byId[String(pc.platform).toLowerCase()] = pc;
    });
    return ['ps5', 'switch', 'steam'].map(function (id) {
      return byId[id] || { platform: id, source: 'unknown', calibrated: false, note: '', count: 0 };
    });
  }

  function gamesForPlatform(data, platform) {
    if (!data) return [];
    var key = platform === 'switch' ? 'switch' : platform;
    var list = data[key];
    if (Array.isArray(list)) return list;
    return ((data.gamesAll || data.owned || []).filter(function (g) {
      return String(g.platform || '').toLowerCase() === platform;
    }));
  }

  function renderGamesLibrary(data, preferFocusId) {
    entertainmentCache = data || entertainmentCache;
    var root = document.getElementById('games_lib_platforms');
    var listEl = document.getElementById('games_lib_list');
    var st = document.getElementById('games_lib_status');
    if (!root || !listEl) return;
    var d = entertainmentCache;
    if (!d) {
      if (st) st.textContent = 'Biblioteca indisponível';
      return;
    }
    var calibrated = d.calibratedPlatforms || [];
    if (st) {
      st.textContent = (calibrated.length
          ? ('Calibradas: ' + calibrated.join(', '))
          : 'Nenhuma plataforma calibrada — home sem inventário inventado')
          + (d.steamConfigured ? ' · Steam API ok' : ' · Steam API não configurada');
    }
    root.innerHTML = '';
    platformMetaList(d).forEach(function (pc) {
      var p = String(pc.platform || '').toLowerCase();
      var count = gamesForPlatform(d, p).length;
      var wrap = document.createElement('div');
      wrap.className = 'games-lib-plat' + (p === gamesLibFocusPlat ? ' active' : '');
      var title = document.createElement('div');
      title.className = 'games-lib-plat-title';
      title.textContent = gamesPlatLabel(p);
      var meta = document.createElement('div');
      meta.className = 'games-lib-plat-meta';
      meta.textContent = (pc.calibrated ? 'Calibrada' : 'Não calibrada')
          + ' · ' + (pc.source || 'unknown')
          + ' · ' + count + ' jogos'
          + (pc.note ? (' — ' + pc.note) : '');
      var actions = document.createElement('div');
      actions.className = 'games-lib-actions';

      function mkBtn(id, label, action, extra) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'device-row';
        b.id = id;
        b.setAttribute('data-focusable', 'true');
        b.setAttribute('data-action', action);
        b.setAttribute('data-platform', p);
        if (extra) {
          Object.keys(extra).forEach(function (k) { b.setAttribute(k, extra[k]); });
        }
        b.textContent = label;
        return b;
      }

      actions.appendChild(mkBtn('gl_view_' + p, 'Ver jogos', 'games-view'));
      actions.appendChild(mkBtn('gl_cal_' + p, 'Calibrar', 'games-calibrate'));
      actions.appendChild(mkBtn('gl_clr_' + p, 'Limpar', 'games-clear'));
      if (p === 'steam') {
        actions.appendChild(mkBtn('gl_sync_steam', 'Sync Steam', 'games-steam-sync'));
      }
      wrap.appendChild(title);
      wrap.appendChild(meta);
      wrap.appendChild(actions);
      root.appendChild(wrap);
    });

    listEl.innerHTML = '';
    var games = gamesForPlatform(d, gamesLibFocusPlat).slice(0, 40);
    if (!games.length) {
      var empty = document.createElement('p');
      empty.className = 'matrix-hint';
      empty.textContent = 'Nenhum jogo em ' + gamesPlatLabel(gamesLibFocusPlat)
          + '. Calibre com seed, sync Steam, ou adicione via companion POST /entertainment/games.';
      listEl.appendChild(empty);
    } else {
      var head = document.createElement('p');
      head.className = 'matrix-hint';
      head.textContent = 'Jogos · ' + gamesPlatLabel(gamesLibFocusPlat) + ' (OK remove)';
      listEl.appendChild(head);
      games.forEach(function (g, idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'device-row games-lib-item';
        btn.id = 'gl_game_' + idx;
        btn.setAttribute('data-focusable', 'true');
        btn.setAttribute('data-action', 'games-delete');
        btn.setAttribute('data-game-id', g.id || '');
        btn.textContent = '✕ ' + (g.title || g.id)
            + (g.status ? (' · ' + g.status) : '')
            + (g.source ? (' · ' + g.source) : '');
        listEl.appendChild(btn);
      });
    }
    if (currentScreen === 'profiles' && preferFocusId) {
      focus.setScreen('profiles');
      if (!focus.focus(preferFocusId)) focus.ensureFocus();
    }
  }

  function loadEntertainment(preferFocusId) {
    rest.get('/api/v1/entertainment').then(function (data) {
      renderGamesLibrary(data, preferFocusId);
    }).catch(function (e) {
      var st = document.getElementById('games_lib_status');
      if (st) st.textContent = (e && e.message) || 'Falha ao carregar biblioteca';
    });
  }

  function calibrateGamesPlatform(platform, focusId) {
    if (!platform) return;
    rest.post('/api/v1/entertainment/platforms/' + encodeURIComponent(platform) + '/calibrate', {
      clearSeed: false
    }).then(function (data) {
      setStatus((data && data.message) || ('Calibrado: ' + platform));
      loadEntertainment(focusId || ('gl_cal_' + platform));
    }).catch(function (e) {
      setStatus((e.payload && e.payload.message) || e.message || 'Falha ao calibrar');
    });
  }

  function clearGamesPlatform(platform, focusId) {
    if (!platform) return;
    rest.post('/api/v1/entertainment/platforms/' + encodeURIComponent(platform) + '/clear', {}).then(function (data) {
      setStatus((data && data.message) || ('Limpo: ' + platform));
      loadEntertainment(focusId || ('gl_clr_' + platform));
    }).catch(function (e) {
      setStatus((e.payload && e.payload.message) || e.message || 'Falha ao limpar');
    });
  }

  function syncSteamLibrary(focusId) {
    rest.post('/api/v1/entertainment/steam/sync?limit=120', {}).then(function (data) {
      setStatus((data && data.message) || 'Steam sync ok');
      gamesLibFocusPlat = 'steam';
      loadEntertainment(focusId || 'gl_sync_steam');
    }).catch(function (e) {
      setStatus((e.payload && e.payload.message) || e.message || 'Falha Steam sync');
    });
  }

  function deleteGameEntry(gameId, focusId) {
    if (!gameId) return;
    rest.del('/api/v1/entertainment/games/' + encodeURIComponent(gameId)).then(function (data) {
      setStatus(data && data.ok ? ('Removido: ' + gameId) : 'Não encontrado');
      loadEntertainment(focusId);
    }).catch(function (e) {
      setStatus((e.payload && e.payload.message) || e.message || 'Falha ao remover');
    });
  }

  function toggleProfileDevice(personId, deviceId, focusId) {
    if (!personId || !deviceId || !householdCache) return;
    var person = null;
    (householdCache.people || []).forEach(function (p) {
      if (p.id === personId) person = p;
    });
    if (!person) return;
    var allowed = personAllowedIds(person);
    var allIds = (householdCache.devices || []).map(function (d) { return d.id; });
    var next = (allowed.length ? allowed : allIds.slice()).slice();
    var idx = next.findIndex(function (id) { return id.toLowerCase() === deviceId.toLowerCase(); });
    if (idx >= 0) {
      if (next.length <= 1) {
        setStatus('Deixe ao menos 1 aparelho');
        return;
      }
      next.splice(idx, 1);
    } else {
      next.push(deviceId);
    }
    rest.put('/api/v1/household/person/' + encodeURIComponent(personId) + '/devices', {
      allowedDeviceIds: next
    }).then(function (data) {
      applyHousehold(data);
      setStatus((person.name || personId) + ' · aparelhos atualizados');
      if (focusId) focus.focus(focusId);
    }).catch(function (e) {
      setStatus((e.payload && e.payload.message) || e.message || 'Falha ao salvar aparelhos');
    });
  }

  function buildProfileTile(person, opts) {
    opts = opts || {};
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'profile-tile' + (opts.active ? ' active' : '');
    b.id = opts.idPrefix
        ? (opts.idPrefix + (person.id || 'x'))
        : ('person_' + (person.id || 'x'));
    b.setAttribute('data-focusable', 'true');
    b.setAttribute('data-action', opts.action || 'select-person');
    b.setAttribute('data-person-id', person.id || '');
    if (person.suggestedDeviceId) {
      b.setAttribute('data-device-id', person.suggestedDeviceId);
    }
    b.innerHTML = '<div class="profile-avatar"></div><div class="profile-name"></div>';
    fillProfileAvatar(b.querySelector('.profile-avatar'), person);
    b.querySelector('.profile-name').textContent = person.name || person.id || '?';
    return b;
  }

  function showTvLoginPicker(people) {
    var screen = document.getElementById('screen_tv_login');
    var root = document.getElementById('tv_login_people');
    var hint = document.getElementById('tv_login_hint');
    if (!screen || !root) return Promise.resolve();
    if (hint) hint.textContent = 'Quem assiste nesta TV?';
    root.innerHTML = '';
    var list = people || [];
    var preferId = '';
    try { preferId = localStorage.getItem('aiontv_last_person') || ''; } catch (e) { /* */ }
    var focusId = '';
    return new Promise(function (resolve) {
      tvLoginResolve = resolve;
      list.forEach(function (p, idx) {
        var active = (preferId && p.id === preferId) || (!preferId && idx === 0);
        var tile = buildProfileTile(p, {
          idPrefix: 'tvlogin_',
          action: 'tv-login-person',
          active: active
        });
        if (active) focusId = tile.id;
        root.appendChild(tile);
      });
      if (!focusId && root.firstChild) focusId = root.firstChild.id;
      currentScreen = 'tv_login';
      screen.classList.remove('hidden');
      screen.hidden = false;
      focus.setScreen('tv_login');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (focusId && focus.focus(focusId)) return;
          focus.ensureFocus();
        });
      });
      var st = document.getElementById('tv_login_status');
      if (st) st.textContent = 'Setas · OK para entrar · Gerenciar embaixo';
    });
  }

  var tvLoginResolve = null;

  function finishTvLoginPerson(personId, deviceId) {
    var screen = document.getElementById('screen_tv_login');
    return householdEnter(personId, deviceId || tvSelfDeviceId).then(function (res) {
      tvEntered = true;
      applyHousehold(res);
      if (screen) {
        screen.classList.add('hidden');
        screen.hidden = true;
      }
      showScreen('home');
      if (typeof tvLoginResolve === 'function') {
        var r = tvLoginResolve;
        tvLoginResolve = null;
        r(res);
      }
      return res;
    }).catch(function (e) {
      setStatus((e.payload && e.payload.message) || e.message || 'Falha');
      var st = document.getElementById('tv_login_status');
      if (st) st.textContent = (e.payload && e.payload.message) || e.message || 'Falha ao entrar';
    });
  }

  function setStatus(text) {
    var el = document.getElementById('status_line');
    if (el) el.textContent = text;
    var c = document.getElementById('chat_status');
    if (c && currentScreen === 'chat') c.textContent = text;
    // Companion: header fica limpo — feedback de ação usa showCompanionToast()
  }

  function showCompanionToast(text) {
    var toast = document.getElementById('companion_toast');
    if (!toast || !text) return;
    toast.hidden = false;
    toast.textContent = text;
    toast.classList.add('show');
    if (companionToastTimer) clearTimeout(companionToastTimer);
    companionToastTimer = setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { toast.hidden = true; }, 220);
    }, 3000);
  }

  function updateCompanionHeader(data) {
    var sub = document.getElementById('companion_sub');
    if (!sub || !data) return;
    var person = data.activePersonName || '?';
    var dev = findDevice(data, data.activeDeviceId);
    var tv = (dev && (dev.name || '')) || data.activeDeviceName || '?';
    sub.textContent = person + ' · ' + tv;
  }

  var lastIngestLine = '';

  function formatIngestStatus(s) {
    if (!s) return '';
    var n = s.count != null ? s.count : 0;
    var kids = s.kidsCount != null ? s.kidsCount : 0;
    var cur = s.cursor || {};
    var app = cur.currentApp || cur.app || cur.nextApp || '';
    var page = cur.page != null ? cur.page : cur.nextPage;
    if (!s.ingestEnabled) return 'Biblioteca: ' + n + ' · ingestão off';
    if (!n) return 'Biblioteca vazia · ingestão…' + (app ? (' ' + app) : '');
    var line = 'Biblioteca: ' + n;
    if (kids) line += ' · kids ' + kids;
    if (app) line += ' · ' + app + (page != null ? (' p' + page) : '');
    return line;
  }

  function applyIngestStatus(s) {
    var line = formatIngestStatus(s);
    if (!line) return;
    lastIngestLine = line;
    var az = document.getElementById('az_status');
    if (az && currentScreen === 'az' && (!az.textContent || az.textContent.indexOf('Carreg') === 0
        || az.textContent.indexOf('Biblioteca') === 0)) {
      az.textContent = line;
    }
    if (currentScreen === 'home' || currentScreen === 'search' || currentScreen === 'az'
        || currentScreen === 'categories') {
      setStatus(line);
    }
  }

  function refreshIngestStatus() {
    if (companionMode) return;
    rest.get('/api/v1/catalog/library/status').then(function (s) {
      applyIngestStatus(s);
    }).catch(function () { /* */ });
  }

  function companionLog(role, text) {
    var log = document.getElementById('companion_chat_log');
    if (!log) return;
    var div = document.createElement('div');
    div.className = 'line ' + (role || 'system');
    div.textContent = text == null ? '' : String(text);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  function showAckCard(text, mode) {
    companionPendingMode = mode;
    var card = document.getElementById('companion_ack_card');
    var t = document.getElementById('companion_ack_text');
    if (t) t.textContent = text;
    if (card) {
      card.classList.remove('hidden');
      card.hidden = false;
    }
  }

  function hideAckCard() {
    companionPendingMode = null;
    var card = document.getElementById('companion_ack_card');
    if (card) {
      card.classList.add('hidden');
      card.hidden = true;
    }
  }

  /** Poll do gate de confirmação (perfil / agent / audit) — escopo global do módulo. */
  function pollCompanionPending() {
    if (!companionMode) return;
    rest.get('/api/v1/companion/pending').then(function (p) {
      if (p && p.title && p.title.waiting) {
        showAckCard(
          'Perfil de ' + (p.title.person || '?') + ' em ' + (p.title.appName || '')
            + '. Continuar busca de "' + (p.title.title || '') + '"?',
          'title'
        );
        return;
      }
      if (p && p.agent && p.agent.waiting) {
        showAckCard(
          (p.agent.summary || 'Confirmar ação na TV?')
            + (p.agent.hint ? (' — ' + p.agent.hint) : ''),
          'audit'
        );
        return;
      }
      if (p && p.audit && !p.audit.confirmed) {
        showAckCard(
          'Deu certo? ' + (p.audit.kind || '') + ' · ' + (p.audit.appName || '')
            + (p.audit.title ? (' · ' + p.audit.title) : '')
            + ' — ' + (p.audit.message || ''),
          'audit'
        );
        return;
      }
      hideAckCard();
    }).catch(function () { /* ignore */ });
  }

  function suggestionOrdinalPhrase(index) {
    var words = ['primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'oitavo'];
    if (index >= 0 && index < words.length) return 'abre o ' + words[index];
    return 'abre o ' + (index + 1);
  }

  /** Widget de propostas no chat do Companion (não só texto). */
  function companionAppendSuggestionWidget(action) {
    var log = document.getElementById('companion_chat_log');
    if (!log || !action) return null;
    var items = action.items || [];
    if (!items.length) return null;
    var wrap = document.createElement('div');
    wrap.className = 'line assistant companion-suggest-widget';
    var head = document.createElement('div');
    head.className = 'companion-suggest-head';
    head.textContent = action.title || 'Toque pra abrir na TV';
    wrap.appendChild(head);
    var list = document.createElement('div');
    list.className = 'companion-suggest-list';
    items.forEach(function (item, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'companion-suggest-card companion-touch';
      var ord = document.createElement('span');
      ord.className = 'companion-suggest-ord';
      ord.textContent = (idx + 1) + 'º';
      var body = document.createElement('span');
      body.className = 'companion-suggest-body';
      var title = document.createElement('span');
      title.className = 'companion-suggest-title';
      title.textContent = item.title || ('Opção ' + (idx + 1));
      var app = document.createElement('span');
      app.className = 'companion-suggest-app';
      app.textContent = item.appName || item.appId || 'TV';
      body.appendChild(title);
      body.appendChild(app);
      btn.appendChild(ord);
      btn.appendChild(body);
      btn.addEventListener('click', function () {
        if (wrap.classList.contains('used')) return;
        wrap.classList.add('used');
        list.querySelectorAll('button').forEach(function (b) {
          b.disabled = true;
        });
        btn.classList.add('picked');
        ensureCompanionSession();
        requestAi(suggestionOrdinalPhrase(idx));
      });
      list.appendChild(btn);
    });
    wrap.appendChild(list);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap;
  }

  /** Resposta da IA no chat: texto legível + widget se houver show_suggestions. */
  function companionHandleAiReply(res) {
    var actions = applyAiClientActions(res);
    var sug = null;
    for (var i = 0; i < actions.length; i++) {
      if (actions[i] && actions[i].type === 'show_suggestions' && actions[i].items && actions[i].items.length) {
        sug = actions[i];
        break;
      }
    }
    if (sug) {
      companionLog('assistant', sug.title || 'Sugestões pra você — toque uma opção:');
      companionAppendSuggestionWidget(sug);
    } else {
      companionLog('assistant', (res && res.reply) ? res.reply : '(sem resposta)');
    }
    var addedGame = actions.some(function (a) {
      return a && a.type === 'games_library_updated';
    });
    if (addedGame && res && res.reply) {
      var r = String(res.reply);
      showCompanionToast(r.length > 80 ? r.slice(0, 77) + '…' : r);
    }
    if (res && res.embed) {
      companionLog('system', 'Jogo enviado pra TV (deixe o app aberto lá)');
    }
    pollCompanionPending();
    return actions;
  }

  function pushToTv(action) {
    return rest.post('/api/v1/companion/command', action || {});
  }

  function showCompanionBanner(show) {
    var banner = document.getElementById('companion_banner');
    if (!banner) return;
    if (!show) {
      banner.classList.add('hidden');
      banner.hidden = true;
      return;
    }
    rest.get('/api/v1/companion/link').then(function (data) {
      var urlEl = document.getElementById('companion_url_text');
      var qr = document.getElementById('companion_qr');
      if (urlEl) urlEl.textContent = data.companionUrl || '';
      if (qr && data.qrUrl) qr.src = data.qrUrl;
      banner.classList.remove('hidden');
      banner.hidden = false;
      focus.focus('btn_companion_close');
      setStatus('Companion: aponte a câmera do celular');
    }).catch(function (e) {
      setStatus('Link companion: ' + (e.message || e));
    });
  }

  var householdCache = null;
  var entertainmentCache = null;
  var gamesLibFocusPlat = 'ps5';
  var hhGamesFocusPlat = 'ps5';
  var hhGameSearchTimer = null;
  var hhGameAddPlatform = 'ps5';
  var hhPendingDeleteGameId = '';

  var pendingRateStars = 0;
  var wizardLastHdmi = 1;

  function showScreen(name) {
    currentScreen = name;
    var home = document.getElementById('screen_home');
    var chat = document.getElementById('screen_chat');
    var profiles = document.getElementById('screen_profiles');
    var player = document.getElementById('screen_player');
    var rate = document.getElementById('screen_rate');
    var az = document.getElementById('screen_az');
    var search = document.getElementById('screen_search');
    var categories = document.getElementById('screen_categories');
    var tvLogin = document.getElementById('screen_tv_login');
    var titleRate = document.getElementById('screen_title_rate');
    home.classList.add('hidden'); home.hidden = true;
    chat.classList.add('hidden'); chat.hidden = true;
    if (profiles) { profiles.classList.add('hidden'); profiles.hidden = true; }
    if (rate) { rate.classList.add('hidden'); rate.hidden = true; }
    if (az) { az.classList.add('hidden'); az.hidden = true; }
    if (search) { search.classList.add('hidden'); search.hidden = true; }
    if (categories) { categories.classList.add('hidden'); categories.hidden = true; }
    if (titleRate && name !== 'title_rate') {
      titleRate.classList.add('hidden');
      titleRate.hidden = true;
    }
    if (tvLogin && name !== 'tv_login') {
      tvLogin.classList.add('hidden');
      tvLogin.hidden = true;
    }
    if (player && name !== 'player') {
      player.classList.add('hidden');
      player.hidden = true;
    }

    if (name === 'chat') {
      chat.classList.remove('hidden');
      chat.hidden = false;
      focus.setScreen('chat');
      focus.ensureFocus();
      if (!document.querySelector('#keyboard .focused')) {
        var firstKey = document.querySelector('#keyboard .key');
        if (firstKey) focus.focus(firstKey.id);
        else focus.focus('btn_send');
      }
    } else if (name === 'az') {
      if (az) {
        az.classList.remove('hidden');
        az.hidden = false;
      }
      focus.setScreen('az');
      if (window.AiOnTvCatalogBrowse) {
        window.AiOnTvCatalogBrowse.openAz(focus, 'A');
      }
    } else if (name === 'categories') {
      if (categories) {
        categories.classList.remove('hidden');
        categories.hidden = false;
      }
      focus.setScreen('categories');
      if (window.AiOnTvCatalogBrowse) {
        window.AiOnTvCatalogBrowse.openCategories(focus);
      }
    } else if (name === 'search') {
      if (search) {
        search.classList.remove('hidden');
        search.hidden = false;
      }
      focus.setScreen('search');
      if (!searchKeyboard) {
        searchKeyboard = new window.AiOnTvKeyboard(
            'search_keyboard',
            function (v) {
              if (window.AiOnTvCatalogBrowse) window.AiOnTvCatalogBrowse.runSearch(v, focus);
            },
            function () {
              if (window.AiOnTvCatalogBrowse
                  && window.AiOnTvCatalogBrowse.focusFirstSearchResult(focus)) {
                setStatus('Resultados · OK para assistir');
              } else {
                setStatus('Sem resultados — continue digitando');
              }
            }
        );
        searchKeyboard.mount();
      }
      if (!focus.focus(searchKeyboard.firstKeyId())) {
        focus.focus('btn_search_home');
      }
    } else if (name === 'tv_login') {
      if (tvLogin) {
        tvLogin.classList.remove('hidden');
        tvLogin.hidden = false;
      }
      focus.setScreen('tv_login');
      focus.ensureFocus();
    } else if (name === 'profiles') {
      if (profiles) {
        profiles.classList.remove('hidden');
        profiles.hidden = false;
      }
      focus.setScreen('profiles');
      loadHousehold(true);
      loadEntertainment();
    } else if (name === 'rate') {
      if (rate) {
        rate.classList.remove('hidden');
        rate.hidden = false;
      }
      focus.setScreen('rate');
      refreshRatePanel();
      document.querySelectorAll('#rate_stars .star-pick').forEach(function (btn) {
        btn.setAttribute('tabindex', '0');
        btn.setAttribute('data-focusable', 'true');
      });
      // 2× rAF: Tizen precisa layout antes do getClientRects / foco D-pad
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (!focus.focus('rate_star_3')) {
            var stars = document.querySelectorAll('#rate_stars .star-pick');
            var ok = false;
            for (var si = 0; si < stars.length && !ok; si++) {
              ok = focus.focus(stars[si].id);
            }
            if (!ok) focus.ensureFocus();
          }
          setStatus('Avaliar · setas + OK ou teclas 1–5');
        });
      });
    } else if (name === 'title_rate') {
      if (titleRate) {
        titleRate.classList.remove('hidden');
        titleRate.hidden = false;
      }
      focus.setScreen('title_rate');
      document.querySelectorAll('#title_rate_stars .star-pick').forEach(function (btn) {
        btn.setAttribute('tabindex', '0');
        btn.setAttribute('data-focusable', 'true');
      });
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (!focus.focus('title_rate_star_3')) focus.ensureFocus();
          setStatus('Classificar título · 1–5★');
        });
      });
    } else if (name === 'player') {
      if (player) {
        player.classList.remove('hidden');
        player.hidden = false;
      }
      focus.setScreen('player');
      var pFrame = document.getElementById('player_frame');
      var gameIframe = pFrame && !pFrame.classList.contains('hidden')
          && pFrame.src && pFrame.src.indexOf('about:blank') < 0;
      if (gameIframe) {
        try { pFrame.contentWindow.focus(); } catch (e) { /* */ }
      } else {
        focus.focus('btn_close_player');
      }
    } else {
      home.classList.remove('hidden');
      home.hidden = false;
      focus.setScreen('home');
      focus.ensureFocus();
    }
  }

  var playerFallbackTimer = null;
  var lastPlayerUrl = '';

  function absolutePlayUrl(url) {
    if (!url) return '';
    if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) return url;
    var base = (window.AiOnTvConfig && window.AiOnTvConfig.apiBase) || '';
    if (url.charAt(0) === '/') return base + url;
    return base + '/' + url;
  }

  /** Path no mesmo origin da SPA — não troca de NIC (.8 ↔ .83) no dual-home. */
  function sameOriginPlayUrl(url) {
    if (!url) return '';
    var origin = (typeof location !== 'undefined' && location.origin)
        ? location.origin
        : ((window.AiOnTvConfig && window.AiOnTvConfig.apiBase) || '');
    if (url.indexOf('/') === 0 && url.indexOf('//') !== 0) {
      return origin + url;
    }
    // Absolute antigo com public-host/.83 → reancora no host que a TV já usa
    try {
      if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) {
        var u = new URL(url);
        var h = (u.hostname || '').toLowerCase();
        var ours = h === '192.168.15.8' || h === '192.168.15.83'
            || h === 'ffavell' || h === 'ffavell.local' || h === 'localhost';
        if (ours && origin) {
          return origin + u.pathname + (u.search || '') + (u.hash || '');
        }
      }
    } catch (e) { /* ignore */ }
    return absolutePlayUrl(url);
  }

  function openGamesFullscreen(url) {
    var u = sameOriginPlayUrl(url || '/games/local/snake/index.html');
    if (u.indexOf('/games/local/') !== -1 && !/\.html($|\?)/i.test(u)) {
      u = u.replace(/\/?$/, '/index.html');
    }
    lastPlayerUrl = u;
    setStatus('Abrindo fullscreen: ' + u);
    window.location.href = u;
  }

  /** Externos / hub /games/ quebram em iframe no Tizen 2019 → fullscreen. */
  function prefersGameFullscreen(abs) {
    if (!abs) return true;
    if (abs.indexOf('https://') === 0) return true;
    if (abs.indexOf('/games/local/') !== -1) return false;
    if (abs.indexOf('/roms/') !== -1) return false;
    if (abs.indexOf('/games/') !== -1) return true;
    return true;
  }

  function openInAppPlayer(url, title, kind) {
    var frame = document.getElementById('player_frame');
    var video = document.getElementById('player_video');
    var label = document.getElementById('player_title');
    var urlLine = document.getElementById('player_url_line');
    var abs = sameOriginPlayUrl(url);
    lastPlayerUrl = abs;
    var isVideo = kind === 'video' || (abs && abs.indexOf('/media/') !== -1);
    if (label) label.textContent = title || (isVideo ? 'Filme' : 'Jogando');
    if (urlLine) urlLine.textContent = abs || '(sem URL)';
    if (playerFallbackTimer) {
      clearTimeout(playerFallbackTimer);
      playerFallbackTimer = null;
    }
    if (isVideo) {
      if (frame) {
        frame.classList.add('hidden');
        frame.src = 'about:blank';
      }
      if (video) {
        video.classList.remove('hidden');
        video.src = abs;
        try { video.play(); } catch (e) { /* autoplay pode bloquear */ }
      }
      setStatus('Filme no app · Back volta');
      showScreen('player');
      return;
    }
    if (prefersGameFullscreen(abs)) {
      openGamesFullscreen(abs);
      return;
    }
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.classList.add('hidden');
    }
    if (frame) {
      frame.classList.remove('hidden');
      frame.src = abs;
      frame.onload = function () {
        try { frame.contentWindow.focus(); } catch (e) { /* cross-origin */ }
      };
      playerFallbackTimer = setTimeout(function () {
        setStatus('Tela preta — abrindo fullscreen…');
        openGamesFullscreen(abs);
      }, 4000);
    }
    setStatus('Jogo local · D-pad no jogo · Back fecha');
    showScreen('player');
  }

  function closePlayer() {
    var frame = document.getElementById('player_frame');
    var video = document.getElementById('player_video');
    if (frame) frame.src = 'about:blank';
    if (video) {
      try { video.pause(); } catch (e) { /* ignore */ }
      video.removeAttribute('src');
      video.load();
      video.classList.add('hidden');
    }
    if (frame) frame.classList.remove('hidden');
    showScreen('home');
    setStatus('Catálogo');
  }

  var profileEditPersonId = null;

  function personById(data, id) {
    if (!data || !data.people || !id) return null;
    for (var i = 0; i < data.people.length; i++) {
      if (data.people[i].id === id) return data.people[i];
    }
    return null;
  }

  function editingPerson(data) {
    var id = profileEditPersonId || (data && data.activePersonId);
    return personById(data, id) || personById(data, data && data.activePersonId);
  }

  function matrixForPerson(data, person) {
    if (data && data.activeMatrix && person && person.id === data.activePersonId) {
      return data.activeMatrix;
    }
    var keys = (data && data.appKeys) || [];
    var profiles = (person && person.appProfiles) || {};
    var matrix = {};
    if (keys.length) {
      keys.forEach(function (k) {
        var id = k.id || k;
        var label = k.label || id;
        var idx = typeof profiles[id] === 'number' ? profiles[id] : 0;
        matrix[label] = { appKey: id, index: idx, position: idx + 1 };
      });
    } else {
      Object.keys(profiles).forEach(function (id) {
        matrix[id] = { appKey: id, index: profiles[id], position: profiles[id] + 1 };
      });
    }
    return matrix;
  }

  function paintTopbarProfile(data) {
    var btn = document.getElementById('btn_profiles');
    if (!btn) return;
    var person = personById(data, data && data.activePersonId);
    var name = (data && data.activePersonName) || (person && person.name) || 'Perfil';
    btn.textContent = '';
    btn.classList.add('top-btn-profile');
    var av = document.createElement('span');
    av.className = 'topbar-avatar';
    fillProfileAvatar(av, person || { id: 'x', name: name, avatarUrl: '' });
    var label = document.createElement('span');
    label.className = 'topbar-profile-name';
    label.textContent = name;
    btn.appendChild(av);
    btn.appendChild(label);
  }

  function applyHousehold(data) {
    householdCache = data;
    if (!profileEditPersonId && data && data.activePersonId) {
      profileEditPersonId = data.activePersonId;
    }
    var person = editingPerson(data);
    var name = (person && person.name) || (data && data.activePersonName) || 'Felipe';
    paintTopbarProfile(data);
    var device = document.getElementById('device_line');
    if (device) {
      device.textContent = 'TV ativa: ' + ((data && data.activeDeviceName) || '—')
          + ' · Editando: ' + name;
    }
    renderProfileDevices(data);
    renderHouseDevices(data);
    renderAvatarPicker(data);
    var title = document.getElementById('matrix_title');
    if (title) title.textContent = 'Matriz de ' + name + ' nos apps';
    var table = document.getElementById('matrix_table');
    var matrix = matrixForPerson(data, person);
    if (table && matrix) {
      table.innerHTML = '';
      var personId = (person && person.id) || '';
      Object.keys(matrix).forEach(function (label) {
        var row = matrix[label];
        var idx = typeof row.index === 'number' ? row.index : 0;
        var appKey = row.appKey || label;
        var div = document.createElement('div');
        div.className = 'matrix-row';
        div.innerHTML =
          '<span class="matrix-label"></span>' +
          '<div class="matrix-controls">' +
          '<button type="button" class="matrix-btn" data-focusable="true">−</button>' +
          '<strong></strong>' +
          '<button type="button" class="matrix-btn" data-focusable="true">+</button>' +
          '</div>';
        div.querySelector('.matrix-label').textContent = label;
        div.querySelector('strong').textContent = (idx + 1) + 'º';
        var buttons = div.querySelectorAll('.matrix-btn');
        var minus = buttons[0];
        var plus = buttons[1];
        minus.id = 'mx_' + appKey + '_minus';
        plus.id = 'mx_' + appKey + '_plus';
        minus.setAttribute('data-action', 'matrix-dec');
        plus.setAttribute('data-action', 'matrix-inc');
        minus.setAttribute('data-app-key', appKey);
        plus.setAttribute('data-app-key', appKey);
        minus.setAttribute('data-person-id', personId);
        plus.setAttribute('data-person-id', personId);
        minus.setAttribute('data-index', String(idx));
        plus.setAttribute('data-index', String(idx));
        table.appendChild(div);
      });
    }
    var list = document.getElementById('people_list');
    if (list && data && data.people) {
      list.innerHTML = '';
      var preferFocus = '';
      data.people.forEach(function (p) {
        var active = p.id === (profileEditPersonId || data.activePersonId);
        var tile = buildProfileTile(p, { active: active, action: 'select-person' });
        list.appendChild(tile);
        if (active) preferFocus = tile.id;
      });
      var avIn = document.getElementById('avatar_url_input');
      if (avIn && person) {
        avIn.value = person.avatarUrl || '';
        avIn.setAttribute('data-person-id', person.id || '');
      }
      if (currentScreen === 'profiles') {
        focus.setScreen('profiles');
        if (preferFocus) focus.focus(preferFocus);
        else {
          var first = list.querySelector('[data-focusable]');
          if (first) focus.focus(first.id);
          else focus.focus('btn_back_profiles');
        }
      }
    }
  }

  function loadHousehold(focusList) {
    rest.get('/api/v1/household').then(function (data) {
      applyHousehold(data);
      if (focusList && currentScreen === 'profiles') {
        var active = document.querySelector('#people_list .person-card.active') ||
            document.querySelector('#people_list [data-focusable]');
        if (active) focus.focus(active.id);
      }
    }).catch(function () {
      setStatus('Perfis offline');
    });
  }

  function saveActiveAvatar() {
    var avIn = document.getElementById('avatar_url_input');
    var personId = (avIn && avIn.getAttribute('data-person-id'))
        || profileEditPersonId
        || (householdCache && householdCache.activePersonId)
        || '';
    if (!personId || !avIn) {
      setStatus('Selecione um perfil antes');
      return;
    }
    rest.put('/api/v1/household/person/' + encodeURIComponent(personId) + '/avatar', {
      avatarUrl: avIn.value || ''
    }).then(function (data) {
      profileEditPersonId = personId;
      applyHousehold(data);
      setStatus(data.message || 'Foto salva');
    }).catch(function (e) {
      setStatus((e.payload && e.payload.message) || e.message || 'Falha ao salvar foto');
    });
  }

  function selectPerson(personId) {
    // Na tela Gerenciar: só foca edição (pai/mãe) — não chama /enter (lab/allowlist).
    if (currentScreen === 'profiles' && !companionMode) {
      profileEditPersonId = personId;
      if (householdCache) applyHousehold(householdCache);
      var p = personById(householdCache, personId);
      setStatus('Editando ' + ((p && p.name) || personId) + ' · avatar / matriz / aparelhos');
      var ps = document.getElementById('profile_status');
      if (ps) ps.textContent = 'Editando: ' + ((p && p.name) || personId);
      return;
    }
    ensureCompanionSession();
    var person = personById(householdCache, personId);
    var allowed = personAllowedIds(person);
    var suggested = (person && person.suggestedDeviceId) || (allowed[0] || '');
    // Não forçar deviceHint do quarto quando o perfil só tem TV da sala/mãe.
    var hint = companionDeviceHint || tvSelfDeviceId || undefined;
    if (hint && allowed.length) {
      var mayHint = allowed.some(function (id) {
        return String(id).toLowerCase() === String(hint).toLowerCase();
      });
      if (!mayHint) hint = undefined;
    }
    rest.post('/api/v1/household/enter', {
      personId: personId,
      deviceId: suggested || undefined,
      deviceHint: hint,
      sessionId: companionSessionId
    }).then(function (data) {
      if (data && data.sessionId) companionSessionId = data.sessionId;
      profileEditPersonId = data.activePersonId || personId;
      applyHousehold(data);
      setStatus(data.message || ('Perfil: ' + (data.activePersonName || personId)));
      var ps = document.getElementById('profile_status');
      if (ps) {
        ps.textContent = 'Ativo: ' + (data.activePersonName || personId) + ' — apps usam a matriz';
      }
      if (companionMode) refreshCompanionHousehold();
    }).catch(function (e) {
      var p = e.payload || {};
      setStatus(p.message || ('Falha ao trocar perfil: ' + (e.message || e)));
    });
  }

  function adjustMatrix(personId, appKey, nextIndex, focusId) {
    if (!personId || !appKey) return;
    var idx = Math.max(0, Math.min(5, nextIndex));
    rest.put('/api/v1/household/person/' + encodeURIComponent(personId) + '/app/' + encodeURIComponent(appKey), {
      index: idx
    }).then(function (data) {
      applyHousehold(data);
      setStatus((data.activePersonName || personId) + ' · ' + appKey + ' = ' + (idx + 1) + 'º');
      if (focusId) focus.focus(focusId);
    }).catch(function (e) {
      setStatus('Falha ao salvar matriz: ' + (e.message || e));
    });
  }

  function updatePreview(v) {
    var el = document.getElementById('prompt_preview');
    if (el) el.textContent = v || 'Digite com o teclado ↓';
  }

  function isEmbeddableGame(payload) {
    if (!payload || !payload.url) return false;
    var u = payload.url;
    var mt = payload.mediaType || '';
    if (mt === 'game' || mt === 'emu') return true;
    return u.indexOf('/games/') !== -1 || u.indexOf('/roms/') !== -1;
  }

  function isLocalVideo(payload) {
    if (!payload) return false;
    if (payload.mediaType === 'video') return true;
    var u = payload.url || '';
    return u.indexOf('/media/') !== -1;
  }

  function playPayload(payload) {
    if (!payload || busy) return;

    // Celular: manda pra TV (jogos/filmes via fila companion; streaming via Remote API)
    if (companionMode) {
      busy = true;
      setStatus('Enviando pra TV: ' + (payload.title || payload.appName || '…'));
      if (isEmbeddableGame(payload) || isLocalVideo(payload)) {
        var kind = isLocalVideo(payload) ? 'video' : 'game';
        rest.post('/api/v1/catalog/play', {
          appId: payload.appId || (kind === 'video' ? 'local-media' : 'org.tizen.browser'),
          appName: payload.appName || (kind === 'video' ? 'Filmes locais' : 'Internet'),
          title: payload.title || '',
          posterUrl: payload.posterUrl || '',
          url: payload.url,
          source: kind === 'video' ? 'video' : 'embed'
        }).then(function () {
          return pushToTv({
            type: 'open_embed',
            playUrl: payload.url,
            title: payload.title || (kind === 'video' ? 'Filme' : 'Jogando'),
            mediaKind: kind
          });
        }).then(function () {
          busy = false;
          setStatus('Na TV: ' + (payload.title || kind) + ' (app da TV precisa estar aberto)');
          companionLog('system', '→ TV: ' + (payload.title || kind));
        }).catch(function (e) {
          busy = false;
          setStatus('Falha: ' + (e.message || e));
        });
        return;
      }
      var source = 'catalog';
      if (payload.mediaType === 'console' || (payload.appId && payload.appId.indexOf('hdmi:') === 0)) {
        source = 'console';
      }
      rest.post('/api/v1/catalog/play', {
        appId: payload.appId || '',
        appName: payload.appName || '',
        title: payload.title || '',
        posterUrl: payload.posterUrl || '',
        url: payload.url || '',
        source: source
      }).then(function (res) {
        busy = false;
        setStatus(res && res.ok ? (res.message || 'OK na TV') : ((res && res.message) || 'Falhou'));
        companionLog('system', '→ ' + (res && res.message ? res.message : 'TV'));
        if (res && res.embed && res.playUrl) {
          pushToTv({ type: 'open_embed', playUrl: res.playUrl, title: payload.title || 'Jogando' });
        }
      }).catch(function (e) {
        busy = false;
        setStatus('Erro: ' + (e.message || e));
      });
      return;
    }

    // Filmes locais / jogos na TV: player no thin client
    if (isLocalVideo(payload) || isEmbeddableGame(payload)) {
      busy = true;
      var kind2 = isLocalVideo(payload) ? 'video' : 'game';
      openInAppPlayer(payload.url, payload.title, kind2);
      rest.post('/api/v1/catalog/play', {
        appId: payload.appId || (kind2 === 'video' ? 'local-media' : 'org.tizen.browser'),
        appName: payload.appName || (kind2 === 'video' ? 'Filmes locais' : 'Internet'),
        title: payload.title || '',
        posterUrl: payload.posterUrl || '',
        url: payload.url,
        source: kind2 === 'video' ? 'video' : 'embed'
      }).then(function () {
        busy = false;
        loadCatalogQuiet();
      }).catch(function () { busy = false; });
      return;
    }

    busy = true;
    setStatus('Abrindo ' + (payload.title || payload.appName || 'app') + '…');
    var source2 = 'catalog';
    if (payload.mediaType === 'console' || (payload.appId && payload.appId.indexOf('hdmi:') === 0)) {
      source2 = 'console';
    }
    var body = {
      appId: payload.appId || '',
      appName: payload.appName || '',
      title: payload.title || '',
      posterUrl: payload.posterUrl || '',
      url: payload.url || '',
      source: source2
    };
    rest.post('/api/v1/catalog/play', body).then(function (res) {
      busy = false;
      if (res && res.embed && res.playUrl) {
        openInAppPlayer(res.playUrl, payload.title, res.mediaKind || 'game');
        return;
      }
      setStatus(res && res.ok ? (res.message || 'OK') : ((res && res.message) || 'Falhou'));
      loadCatalogQuiet();
    }).catch(function (e) {
      busy = false;
      setStatus('Erro ao abrir: ' + (e.message || e));
    });
  }

  function requestAi(text) {
    if (!text || !text.trim()) {
      setStatus('Digite algo ou use um atalho');
      return;
    }
    text = text.trim();

    if (companionMode) {
      ensureCompanionSession();
      companionLog('user', text);
      setStatus('Pensando…');
      var payload = { text: text, client: 'companion', relayToTv: 'true' };
      payload.sessionId = companionSessionId;
      rest.post('/api/v1/ai/chat', payload).then(function (res) {
        if (res && res.sessionId) companionSessionId = res.sessionId;
        if (res && res.code === 'PIN_REQUIRED') {
          showCompanionPin(res.deviceId, res.message || res.reply);
          companionLog('system', res.message || 'PIN necessário');
          setStatus('PIN necessário');
          return;
        }
        companionHandleAiReply(res);
        setStatus('Pronto · comando na TV');
      }).catch(function (e) {
        var p = e.payload || {};
        if (p.sessionId) companionSessionId = p.sessionId;
        if (p.code === 'PIN_REQUIRED' || p.code === 'PIN_LOCKED') {
          showCompanionPin(p.deviceId || pendingPinDeviceId, p.message || e.message);
          companionLog('system', p.message || e.message);
          setStatus('PIN necessário');
          return;
        }
        companionLog('system', 'Erro: ' + (e.message || e));
        setStatus('Falha na IA');
      });
      return;
    }

    showScreen('chat');
    window.AiOnTvChatUi.appendLine('user', text);
    setStatus('Pensando…');
    document.getElementById('chat_status').textContent = 'Pensando…';

    var streamId = 'rest_' + Date.now();
    window.AiOnTvChatUi.beginStream(streamId);
    rest.post('/api/v1/ai/chat', { text: text }).then(function (res) {
      var reply = (res && res.reply) ? res.reply : '(sem resposta)';
      window.AiOnTvChatUi.appendChunk(streamId, reply);
      window.AiOnTvChatUi.endStream(streamId);
      document.getElementById('chat_status').textContent = 'Pronto';
      setStatus('IA respondeu');
      var actions = (res && res.clientActions) || [];
      if ((!actions || !actions.length) && res && res.clientAction) actions = [res.clientAction];
      var openedEmbed = false;
      for (var ai = 0; ai < actions.length; ai++) {
        if (actions[ai] && actions[ai].type === 'open_embed') openedEmbed = true;
        applyClientAction(actions[ai]);
      }
      if (!openedEmbed && res && res.embed && res.playUrl) {
        openInAppPlayer(res.playUrl, res.title || 'Jogando', res.mediaKind || 'game');
      }
    }).catch(function (e) {
      window.AiOnTvChatUi.endStream(streamId);
      window.AiOnTvChatUi.appendLine('system', 'Erro: ' + (e.message || e));
      document.getElementById('chat_status').textContent = 'Erro';
      setStatus('Falha na IA');
    });
  }

  function reportNativeResult(kind, result, request) {
    var r = result || { ok: false, code: 'unknown', message: 'sem resultado' };
    var line = (r.ok ? 'Nativo OK' : 'Nativo falhou') + ' · ' + kind
        + (r.message ? (' · ' + r.message) : '');
    setStatus(line);
    if (ws && typeof ws.send === 'function') {
      ws.send('system.native_result', {
        kind: kind,
        ok: !!r.ok,
        code: r.code || '',
        message: r.message || '',
        request: request || null,
        detail: r.detail || null
      });
    }
    // Log REST opcional (auditoria leve) — ignora se endpoint não existir
    try {
      rest.post('/api/v1/tv/native-result', {
        kind: kind,
        ok: !!r.ok,
        code: r.code || '',
        message: r.message || '',
        request: request || null
      }).catch(function () { /* endpoint opcional */ });
    } catch (e) { /* ignore */ }
  }

  function runNativeHdmi(port, request) {
    var hw = window.AiOnTvHardware;
    if (!hw || !hw.hdmi || typeof hw.hdmi.switchToHdmi !== 'function') {
      reportNativeResult('native_hdmi', {
        ok: false,
        code: 'no_hw_module',
        message: 'HAL HDMI não carregado (scripts hw/ no index.html?)'
      }, request || { port: port });
      return;
    }
    hw.hdmi.switchToHdmi(port, function (res) {
      reportNativeResult('native_hdmi', res, request || { port: port });
    });
  }

  function runNativeLaunch(appId, metaTag, request) {
    var hw = window.AiOnTvHardware;
    if (!hw || !hw.launcher || typeof hw.launcher.launchDeepLink !== 'function') {
      reportNativeResult('native_launch', {
        ok: false,
        code: 'no_hw_module',
        message: 'HAL launcher não carregado (scripts hw/ no index.html?)'
      }, request || { appId: appId, metaTag: metaTag });
      return;
    }
    hw.launcher.launchDeepLink(appId, metaTag, function (res) {
      reportNativeResult('native_launch', res, request || { appId: appId, metaTag: metaTag });
    });
  }

  function applyClientAction(cmd) {
    if (!cmd || !cmd.type) return;
    if (cmd.type === 'native_hdmi') {
      runNativeHdmi(cmd.port != null ? cmd.port : cmd.hdmi, cmd);
      return;
    }
    if (cmd.type === 'native_launch') {
      runNativeLaunch(cmd.appId || cmd.app_id, cmd.metaTag || cmd.meta_tag || cmd.payload, cmd);
      return;
    }
    if (cmd.type === 'open_embed' && cmd.playUrl) {
      openInAppPlayer(cmd.playUrl, cmd.title || 'Jogando', cmd.mediaKind || 'game');
      setStatus('→ ' + (cmd.title || 'mídia'));
      return;
    }
    if (cmd.type === 'status' && cmd.message) {
      setStatus(String(cmd.message));
      return;
    }
    if (cmd.type === 'reload_catalog') {
      loadCatalogQuiet();
      return;
    }
    if (cmd.type === 'show_suggestions') {
      // Companion: widget no chat (companionHandleAiReply). TV: carrossel.
      if (!companionMode) showSuggestionCarousel(cmd);
      return;
    }
    if (cmd.type === 'navigate_screen' && cmd.screen) {
      showScreen(String(cmd.screen));
      return;
    }
    if (cmd.type === 'highlight_tile') {
      var tid = cmd.tileId || ('tile_' + (cmd.row || 0) + '_' + (cmd.index || 0));
      showScreen('home');
      requestAnimationFrame(function () {
        if (!focus.focus(tid)) focus.ensureFocus();
      });
      setStatus('Foco: ' + tid);
      return;
    }
    if (cmd.type === 'await_confirm') {
      setStatus('Aguardando confirm no celular… ' + (cmd.summary || ''));
      return;
    }
    if (cmd.type === 'games_library_updated') {
      if (companionMode) {
        if (cmd.platform) hhGamesFocusPlat = String(cmd.platform);
        showCompanionToast(cmd.title
            ? ('Biblioteca: ' + cmd.title)
            : 'Biblioteca de jogos atualizada');
        refreshHhGamesLibrary();
      } else {
        loadEntertainment();
      }
    }
  }

  function applyAiClientActions(res) {
    var actions = (res && res.clientActions) || [];
    if ((!actions || !actions.length) && res && res.clientAction) actions = [res.clientAction];
    for (var i = 0; i < actions.length; i++) applyClientAction(actions[i]);
    return actions;
  }

  function applyCompanionCommand(cmd) {
    applyClientAction(cmd);
  }

  function showSuggestionCarousel(action) {
    var items = (action && action.items) || [];
    if (!items.length || !window.AiOnTvCatalogView || !window.AiOnTvCatalogView.prependSuggestions) return;
    showScreen('home');
    window.AiOnTvCatalogView.prependSuggestions(action.title || 'Sugestões JarvisTV', items, focus);
    setStatus((action.title || 'Sugestões') + ' · ' + items.length + ' títulos');
  }

  function pollCompanionCommands() {
    if (companionMode) return;
    rest.get('/api/v1/companion/poll?since=' + companionCursor).then(function (res) {
      if (!res || !res.commands) return;
      if (typeof res.cursor === 'number') companionCursor = res.cursor;
      for (var i = 0; i < res.commands.length; i++) {
        applyCompanionCommand(res.commands[i]);
      }
    }).catch(function () { /* offline ok */ });
  }

  function sendTvKey(key) {
    if (!key) return;
    setStatus('TV ← ' + key);
    rest.post('/api/v1/tv/key', { key: key }).then(function (res) {
      setStatus(res && res.ok ? ('TV ← ' + key) : ((res && res.message) || 'Tecla falhou'));
    }).catch(function (e) {
      setStatus('Tecla falhou: ' + (e.message || e));
    });
  }

  function calibPlatformFromDevice(d) {
    var raw = String((d && (d.platform || d.type || d.id)) || '').toLowerCase();
    if (raw.indexOf('switch') >= 0 || raw.indexOf('nintendo') >= 0) return 'switch';
    return 'ps5';
  }

  function populateCalibDevices(data) {
    var sel = document.getElementById('calib_device');
    if (!sel) return;
    var prev = sel.value;
    var consoles = ((data && data.devices) || []).filter(function (d) {
      if (!d) return false;
      if ((d.role || '') === 'console') return true;
      var p = String(d.platform || d.type || d.id || '').toLowerCase();
      return p === 'ps5' || p.indexOf('switch') >= 0 || p.indexOf('playstation') >= 0;
    });
    if (!consoles.length) {
      consoles = [
        { id: 'ps5', name: 'PlayStation 5', platform: 'ps5', hdmi: null },
        { id: 'switch', name: 'Nintendo Switch', platform: 'switch', hdmi: null }
      ];
    }
    sel.innerHTML = '';
    consoles.forEach(function (d) {
      var opt = document.createElement('option');
      var plat = calibPlatformFromDevice(d);
      opt.value = plat;
      opt.textContent = d.name || (plat === 'switch' ? 'Nintendo Switch' : 'PlayStation 5');
      if (d.hdmi != null && d.hdmi !== '') opt.setAttribute('data-hdmi', String(d.hdmi));
      sel.appendChild(opt);
    });
    if (prev) {
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === prev) {
          sel.selectedIndex = i;
          break;
        }
      }
    }
    syncCalibPortFromDevice();
  }

  function syncCalibPortFromDevice() {
    var sel = document.getElementById('calib_device');
    var port = document.getElementById('calib_hdmi_port');
    if (!sel || !port || !sel.options.length) return;
    var opt = sel.options[sel.selectedIndex];
    var hdmi = opt && opt.getAttribute('data-hdmi');
    if (hdmi && port.querySelector('option[value="' + hdmi + '"]')) {
      port.value = hdmi;
    }
  }

  function setCalibStatus(text) {
    var el = document.getElementById('calib_status');
    if (el) el.textContent = text || '';
  }

  function showCalibFeedback(show) {
    var area = document.getElementById('calib_feedback_area');
    if (!area) return;
    area.hidden = !show;
  }

  function refreshCompanionHdmi() {
    populateCalibDevices(householdCache);
    return rest.get('/api/v1/companion/hdmi').then(function (h) {
      var left = document.getElementById('calib_left_reset');
      var off = document.getElementById('calib_base_offset');
      if (left && h.leftReset != null) left.value = String(h.leftReset);
      if (off && h.baseOffset != null) off.value = String(h.baseOffset);
      return h;
    }).catch(function () { /* ignore */ });
  }

  function formatAuditFails(health) {
    var fails = (health && health.audit && health.audit.recentFailures) || [];
    if (!fails.length) return 'Sem falhas recentes na auditoria.';
    return fails.slice(0, 6).map(function (f) {
      return (f.kind || '?') + ' · ' + (f.appName || '') + ' · ' + (f.message || '');
    }).join('\n');
  }

  function refreshRatePanel() {
    rest.get('/api/v1/audit/health').then(function (h) {
      var r = h.ratings || {};
      var a = h.audit || {};
      var el = document.getElementById('rate_summary');
      if (el) {
        el.textContent = 'Média ' + (r.average != null ? r.average : '—') + '★ · '
            + (r.count || 0) + ' avaliações · auditoria '
            + (a.successCount || 0) + ' ok / ' + (a.failureCount || 0) + ' falhas';
      }
      var fails = document.getElementById('rate_fails');
      if (fails) {
        fails.innerHTML = '';
        ((a.recentFailures) || []).slice(0, 5).forEach(function (f) {
          var line = document.createElement('div');
          line.className = 'fail-line';
          line.textContent = (f.kind || '') + ': ' + (f.appName || '') + ' — ' + (f.message || '');
          fails.appendChild(line);
        });
      }
      var st = document.getElementById('rate_status');
      if (st) st.textContent = r.goalMet ? 'Meta 5★ atingida na última!' : 'Avalie a última tentativa';
    }).catch(function (e) {
      var el = document.getElementById('rate_summary');
      if (el) el.textContent = 'Auditoria indisponível: ' + (e.message || e);
    });
  }

  function starsGlyph(n) {
    var s = Math.max(0, Math.min(5, parseInt(n, 10) || 0));
    var out = '';
    for (var i = 1; i <= 5; i++) out += i <= s ? '★' : '☆';
    return out;
  }

  function loadRatingHistory() {
    var list = document.getElementById('feedback_history_list');
    if (!list) return Promise.resolve();
    list.innerHTML = '<li class="history-feed-empty">Carregando histórico…</li>';
    return rest.get('/api/v1/catalog/title-ratings?limit=15').then(function (res) {
      var items = (res && res.items) || [];
      list.innerHTML = '';
      if (!items.length) {
        list.innerHTML = '<li class="history-feed-empty">Ainda sem notas — avalie filmes no Catálogo pra alimentar a IA.</li>';
        return items;
      }
      items.forEach(function (r) {
        if (!r) return;
        rememberCompanionTitleStars(r.title, r.tmdbId, r.stars);
        var li = document.createElement('li');
        li.className = 'history-feed-item';
        var title = document.createElement('p');
        title.className = 'hist-title';
        title.textContent = r.title || 'Sem título';
        var stars = document.createElement('div');
        stars.className = 'hist-stars';
        stars.textContent = starsGlyph(r.stars);
        stars.setAttribute('aria-label', (r.stars || 0) + ' de 5 estrelas');
        li.appendChild(title);
        li.appendChild(stars);
        if (r.comment) {
          var c = document.createElement('p');
          c.className = 'hist-comment';
          c.textContent = r.comment;
          li.appendChild(c);
        }
        list.appendChild(li);
      });
      return items;
    }).catch(function (e) {
      list.innerHTML = '<li class="history-feed-empty">Histórico: ' + (e.message || e) + '</li>';
    });
  }

  function refreshCompanionRate() {
    loadRatingHistory();
    rest.get('/api/v1/audit/health').then(function (h) {
      var r = h.ratings || {};
      var a = h.audit || {};
      var el = document.getElementById('companion_rate_summary');
      if (el) {
        el.textContent = 'Sistema: média ' + (r.average != null ? r.average : '—') + '★ · última '
            + (r.latestStars != null ? r.latestStars + '★' : '—')
            + ' · ok ' + (a.successCount || 0) + ' / falhas ' + (a.failureCount || 0);
      }
      var fails = document.getElementById('companion_audit_fails');
      if (fails) fails.textContent = formatAuditFails(h);
    }).catch(function (e) {
      var el = document.getElementById('companion_rate_summary');
      if (el) el.textContent = 'Erro: ' + (e.message || e);
    });
  }

  var companionTitleStarsCache = Object.create(null);
  var companionTitleStarsWarm = null;

  function titleRatingCacheKey(title, tmdbId) {
    if (tmdbId != null && tmdbId !== '' && !isNaN(Number(tmdbId))) {
      return 'tmdb:' + Number(tmdbId);
    }
    return 't:' + String(title || '').trim().toLowerCase();
  }

  function rememberCompanionTitleStars(title, tmdbId, stars) {
    if (stars == null || stars < 1) return;
    var n = Math.max(1, Math.min(5, parseInt(stars, 10) || 0));
    if (title) companionTitleStarsCache[titleRatingCacheKey(title, null)] = n;
    if (tmdbId != null && tmdbId !== '') {
      companionTitleStarsCache[titleRatingCacheKey(null, tmdbId)] = n;
    }
  }

  function cachedCompanionTitleStars(item) {
    if (!item) return null;
    var byTmdb = companionTitleStarsCache[titleRatingCacheKey(null, item.tmdbId)];
    if (byTmdb != null) return byTmdb;
    return companionTitleStarsCache[titleRatingCacheKey(item.title, null)] || null;
  }

  function warmCompanionTitleRatings() {
    if (companionTitleStarsWarm) return companionTitleStarsWarm;
    companionTitleStarsWarm = rest.get('/api/v1/catalog/title-ratings?limit=40')
        .then(function (res) {
          ((res && res.items) || []).forEach(function (r) {
            if (!r) return;
            rememberCompanionTitleStars(r.title, r.tmdbId, r.stars);
          });
          return companionTitleStarsCache;
        })
        .catch(function () { return companionTitleStarsCache; })
        .then(function (cache) {
          companionTitleStarsWarm = null;
          return cache;
        });
    return companionTitleStarsWarm;
  }

  function paintRatingStars(row, stars) {
    if (!row) return;
    var n = stars == null ? 0 : Math.max(0, Math.min(5, parseInt(stars, 10) || 0));
    row.querySelectorAll('.rating-star').forEach(function (b) {
      var v = parseInt(b.getAttribute('data-stars') || '0', 10);
      var on = v > 0 && v <= n;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      var path = b.querySelector('path');
      if (path) path.setAttribute('fill', on ? 'currentColor' : 'none');
    });
  }

  function submitCompanionItemRating(item, stars, starsRow) {
    if (!item || !item.title || !(stars >= 1 && stars <= 5)) return;
    paintRatingStars(starsRow, stars);
    return rest.post('/api/v1/catalog/title-rating', {
      title: item.title,
      tmdbId: item.tmdbId != null ? item.tmdbId : null,
      mediaType: item.mediaType || null,
      stars: stars,
      appId: item.appId || null,
      appName: item.appName || null,
      posterUrl: item.posterUrl || null,
      comment: ''
    }).then(function (r) {
      if (r && r.ok === false) throw new Error(r.message || 'Falha ao salvar nota');
      rememberCompanionTitleStars(item.title, item.tmdbId, stars);
      if (starsRow) {
        starsRow.classList.remove('saved');
        void starsRow.offsetWidth;
        starsRow.classList.add('saved');
      }
      setStatus(stars + '★ · ' + (item.title || ''));
      return r;
    }).catch(function (e) {
      setStatus('Falha ao salvar nota: ' + (e.message || e));
      paintRatingStars(starsRow, cachedCompanionTitleStars(item));
    });
  }

  function submitRating(stars, comment) {
    return rest.post('/api/v1/audit/ratings', {
      stars: stars,
      comment: comment || '',
      context: { client: companionMode ? 'companion' : 'tv', screen: currentScreen }
    }).then(function (r) {
      setStatus('Avaliação ' + stars + '★ registrada' + (r.goalMet ? ' · meta 5★!' : ''));
      if (!companionMode) {
        var st = document.getElementById('rate_status');
        if (st) st.textContent = 'Obrigado · ' + stars + '★';
        refreshRatePanel();
      }
      return r;
    }).catch(function (e) {
      setStatus('Falha ao avaliar: ' + (e.message || e));
      throw e;
    });
  }

  function renderCompanionMatrix(data) {
    var root = document.getElementById('companion_matrix');
    if (!root || !data) return;
    root.innerHTML = '';
    var personId = companionAdminEditPersonId || data.activePersonId || '';
    var person = personById(data, personId);
    var matrix = {};
    if (person && person.appProfiles) {
      Object.keys(person.appProfiles).forEach(function (k) {
        matrix[k] = { appKey: k, index: person.appProfiles[k], label: k };
      });
    } else if (data.activeMatrix && personId === data.activePersonId) {
      Object.keys(data.activeMatrix).forEach(function (label) {
        var row = data.activeMatrix[label];
        matrix[row.appKey || label] = {
          appKey: row.appKey || label,
          index: typeof row.index === 'number' ? row.index : 0,
          label: label
        };
      });
    }
    var keys = Object.keys(matrix);
    if (!keys.length) {
      root.innerHTML = '<p class="companion-hint">Selecione um perfil na admin pra calibrar.</p>';
      return;
    }
    keys.forEach(function (k) {
      var row = matrix[k];
      var idx = typeof row.index === 'number' ? row.index : 0;
      var appKey = row.appKey || k;
      var label = row.label || appKey;
      var div = document.createElement('div');
      div.className = 'companion-matrix-row';
      div.innerHTML = '<span></span><div class="ops"><button type="button">−</button><strong></strong><button type="button">+</button></div>';
      div.querySelector('span').textContent = label;
      div.querySelector('strong').textContent = (idx + 1) + 'º';
      var buttons = div.querySelectorAll('button');
      buttons[0].addEventListener('click', function () {
        adjustMatrix(personId, appKey, idx - 1, null);
        setTimeout(function () { refreshCompanionHousehold(); }, 200);
      });
      buttons[1].addEventListener('click', function () {
        adjustMatrix(personId, appKey, idx + 1, null);
        setTimeout(function () { refreshCompanionHousehold(); }, 200);
      });
      root.appendChild(div);
    });
  }

  function bindCompanionVoice(opts) {
    opts = opts || {};
    var btn = document.getElementById(opts.buttonId || 'btn_companion_mic');
    var hint = document.getElementById(opts.hintId || 'companion_mic_hint');
    if (!btn) return;
    var iconMode = !!opts.iconMode;
    var idleLabel = opts.idleLabel || 'Toque pra falar';
    var recLabel = opts.recLabel || 'Ouvindo… toque pra enviar';
    var uploadLabel = opts.uploadLabel || 'Enviando…';

    var mediaRecorder = null;
    var chunks = [];
    var stream = null;
    var recording = false;
    var starting = false;
    var stopAfterStart = false;
    var speechRec = null;
    var mode = 'idle'; // idle | rec | upload
    var startedAt = 0;
    var lastToggleAt = 0;

    function idleHint() {
      return opts.idleHint || 'Toque uma vez pra gravar, toque de novo pra enviar.';
    }

    function setMicUi(state, msg) {
      mode = state;
      recording = state === 'rec';
      btn.classList.toggle('recording', recording);
      btn.setAttribute('aria-pressed', recording ? 'true' : 'false');
      if (!iconMode) {
        if (state === 'rec') btn.textContent = recLabel;
        else if (state === 'upload') btn.textContent = uploadLabel;
        else btn.textContent = idleLabel;
      } else {
        btn.setAttribute('aria-label',
            state === 'rec' ? 'Parar e enviar áudio'
              : state === 'upload' ? 'Enviando áudio'
                : 'Falar feedback');
      }
      if (hint && msg) hint.textContent = msg;
      if (msg) setStatus(msg);
    }

    function pickMime() {
      var types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4'
      ];
      if (!window.MediaRecorder) return '';
      for (var i = 0; i < types.length; i++) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(types[i])) {
          return types[i];
        }
      }
      return '';
    }

    function canUseRecorder() {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    }

    function sendBlob(blob, mime) {
      if (!blob || !blob.size) {
        setMicUi('idle', 'Áudio vazio — fale um pouco mais e toque de novo');
        return;
      }
      setMicUi('upload', 'Transcrevendo…');
      companionLog('system', 'Enviando áudio…');
      var fd = new FormData();
      var ext = (mime && mime.indexOf('ogg') >= 0) ? 'ogg'
        : (mime && mime.indexOf('mp4') >= 0) ? 'm4a' : 'webm';
      fd.append('audio', blob, 'voice.' + ext);
      fd.append('client', 'companion');
      fd.append('relayToTv', 'true');
      ensureCompanionSession();
      if (companionSessionId) fd.append('sessionId', companionSessionId);
      rest.postForm('/api/v1/ai/voice', fd).then(function (res) {
        if (res && res.sessionId) companionSessionId = res.sessionId;
        var transcript = (res && res.transcript) ? res.transcript : '';
        if (typeof opts.onTranscript === 'function') {
          opts.onTranscript(transcript, res);
        } else {
          if (transcript) companionLog('user', transcript);
          companionHandleAiReply(res);
          setStatus('Pronto · comando na TV');
        }
        setMicUi('idle', transcript ? ('Ouvi: “' + transcript + '”') : idleHint());
      }).catch(function (e) {
        companionLog('system', 'Voz: ' + (e.message || e));
        setMicUi('idle', 'Falha no áudio — digite o comando');
      });
    }

    function stopTracks() {
      if (stream) {
        stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* */ } });
        stream = null;
      }
    }

    function startSpeechFallback() {
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        setMicUi('idle', 'Mic indisponível neste browser — digite o comando');
        return;
      }
      try {
        if (speechRec) {
          try { speechRec.abort(); } catch (e0) { /* */ }
          speechRec = null;
        }
        var gotText = '';
        speechRec = new SR();
        speechRec.lang = 'pt-BR';
        speechRec.interimResults = true;
        speechRec.continuous = true;
        speechRec.maxAlternatives = 1;
        speechRec.onresult = function (ev) {
          var t = '';
          try {
            for (var i = ev.resultIndex; i < ev.results.length; i++) {
              t += ev.results[i][0].transcript || '';
            }
          } catch (e1) { /* */ }
          if (t.trim()) gotText = t.trim();
          if (hint && gotText) hint.textContent = 'Ouvi: “' + gotText + '” · toque pra enviar';
        };
        function finishSpeechText(text) {
          setMicUi('idle', idleHint());
          if (!text) return;
          if (typeof opts.onTranscript === 'function') {
            opts.onTranscript(text, { transcript: text, reply: '' });
            return;
          }
          requestAi(text);
        }
        speechRec.onerror = function (ev) {
          var code = (ev && ev.error) || '';
          // aborted/no-speech são normais ao parar cedo — não assustar
          if (code === 'aborted' || code === 'no-speech') {
            speechRec = null;
            if (gotText) {
              finishSpeechText(gotText);
            } else if (mode === 'rec') {
              setMicUi('idle', 'Não captou fala — toque, fale e toque de novo');
            }
            return;
          }
          speechRec = null;
          setMicUi('idle', 'Mic/reconhecimento falhou (' + code + ') — digite');
        };
        speechRec.onend = function () {
          speechRec = null;
          if (mode !== 'rec') return;
          if (gotText) {
            finishSpeechText(gotText);
          } else {
            setMicUi('idle', 'Não captou fala — tente de novo');
          }
        };
        startedAt = Date.now();
        setMicUi('rec', 'Ouvindo… toque de novo pra enviar');
        speechRec.start();
      } catch (e) {
        setMicUi('idle', 'Permita o microfone no navegador e tente de novo');
      }
    }

    function startRec() {
      if (mode === 'upload' || starting || busy) return;
      if (mode === 'rec') return;
      starting = true;
      stopAfterStart = false;
      chunks = [];

      if (!canUseRecorder()) {
        starting = false;
        startSpeechFallback();
        return;
      }

      setMicUi('rec', 'Pedindo microfone…');
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
        if (stopAfterStart) {
          s.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* */ } });
          starting = false;
          setMicUi('idle', idleHint());
          return;
        }
        stream = s;
        var mime = pickMime();
        try {
          mediaRecorder = mime
            ? new MediaRecorder(stream, { mimeType: mime })
            : new MediaRecorder(stream);
        } catch (e) {
          mediaRecorder = new MediaRecorder(stream);
        }
        var usedMime = mediaRecorder.mimeType || mime || 'audio/webm';
        mediaRecorder.ondataavailable = function (ev) {
          if (ev.data && ev.data.size) chunks.push(ev.data);
        };
        mediaRecorder.onstop = function () {
          var blob = new Blob(chunks, { type: usedMime });
          chunks = [];
          mediaRecorder = null;
          stopTracks();
          sendBlob(blob, usedMime);
        };
        try {
          mediaRecorder.start(250);
        } catch (e2) {
          mediaRecorder.start();
        }
        starting = false;
        startedAt = Date.now();
        setMicUi('rec', 'Ouvindo… toque de novo pra enviar');
        if (stopAfterStart) stopRec();
      }).catch(function (err) {
        starting = false;
        var name = (err && err.name) || '';
        companionLog('system', 'Mic: ' + (name || String(err)));
        if (!window.isSecureContext || name === 'SecurityError') {
          var httpsUrl = window.AiOnTvCompanion && window.AiOnTvCompanion.httpsCompanionUrl
              ? window.AiOnTvCompanion.httpsCompanionUrl()
              : '';
          setMicUi('idle', 'Android bloqueia mic em HTTP — abra o link HTTPS');
          if (httpsUrl && hint) {
            hint.innerHTML = 'Abra: <a href="' + httpsUrl + '">' + httpsUrl + '</a>';
          }
          return;
        }
        if (name === 'NotAllowedError') {
          setMicUi('idle', 'Toque em Permitir quando o Android pedir o microfone');
          return;
        }
        startSpeechFallback();
      });
    }

    function stopRec() {
      if (starting) {
        stopAfterStart = true;
        return;
      }
      if (Date.now() - startedAt < 450 && mode === 'rec') {
        // toque duplo acidental no mesmo gesto — ignora stop cedo demais
        return;
      }
      if (speechRec) {
        try { speechRec.stop(); } catch (e) { /* */ }
        return;
      }
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
          if (mediaRecorder.state === 'recording' && mediaRecorder.requestData) {
            mediaRecorder.requestData();
          }
        } catch (e1) { /* */ }
        try { mediaRecorder.stop(); } catch (e2) {
          stopTracks();
          setMicUi('idle', idleHint());
        }
        return;
      }
      stopTracks();
      if (mode === 'rec') setMicUi('idle', idleHint());
    }

    function toggleMic(ev) {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      var now = Date.now();
      if (now - lastToggleAt < 350) return; // debounce ghost click / double fire
      lastToggleAt = now;
      if (mode === 'upload') return;
      if (mode === 'rec' || starting) stopRec();
      else startRec();
    }

    // Só click/pointerup único — sem touch+pointer duplicado (bug no celular)
    btn.addEventListener('click', toggleMic);
    btn.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        toggleMic(ev);
      }
    });
    setMicUi('idle', idleHint());
  }

  function bootCompanion() {
    var screen = document.getElementById('screen_companion');
    screen.classList.remove('hidden');
    screen.hidden = false;
    setStatus('Companion · conectado ao PC');

    bindCompanionVoice();
    bindCompanionVoice({
      buttonId: 'btn_feedback_voice',
      hintId: 'feedback_voice_hint',
      iconMode: true,
      idleHint: 'Toque no mic pra ditar o comentário (e enviar comando pra TV).',
      onTranscript: function (transcript, res) {
        var input = document.getElementById('companion_rate_comment');
        if (input && transcript) {
          input.value = transcript;
          try { input.focus(); } catch (e) { /* */ }
        }
        if (transcript) companionLog('user', transcript);
        if (res) companionHandleAiReply(res);
        setStatus(transcript
            ? ('Feedback ditado · escolha as estrelas e envie')
            : 'Pronto');
      }
    });

    document.querySelectorAll('.companion-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.companion-tab').forEach(function (t) { t.classList.remove('active'); });
        document.querySelectorAll('.companion-panel').forEach(function (p) { p.classList.remove('active'); });
        tab.classList.add('active');
        var id = 'companion_panel_' + tab.getAttribute('data-tab');
        var panel = document.getElementById(id);
        if (panel) panel.classList.add('active');
        if (tab.getAttribute('data-tab') === 'hdmi') {
          showCalibFeedback(false);
          setCalibStatus('');
          refreshCompanionHdmi();
        }
        if (tab.getAttribute('data-tab') === 'rate') refreshCompanionRate();
        if (tab.getAttribute('data-tab') === 'catalog') warmCompanionTitleRatings();
      });
    });

    pendingRateStars = 0;
    document.querySelectorAll('#companion_stars .star-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pendingRateStars = parseInt(btn.getAttribute('data-stars') || '0', 10);
        document.querySelectorAll('#companion_stars .star-btn').forEach(function (b) {
          var n = parseInt(b.getAttribute('data-stars') || '0', 10);
          b.classList.toggle('on', n <= pendingRateStars);
        });
      });
    });
    var rateForm = document.getElementById('companion_rate_form');
    if (rateForm) {
      rateForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var comment = (document.getElementById('companion_rate_comment').value || '').trim();
        if (!pendingRateStars) {
          setStatus('Escolha as estrelas antes');
          return;
        }
        submitRating(pendingRateStars, comment).then(function () {
          document.getElementById('companion_rate_comment').value = '';
          pendingRateStars = 0;
          document.querySelectorAll('#companion_stars .star-btn').forEach(function (b) {
            b.classList.remove('on');
          });
          refreshCompanionRate();
        });
      });
    }

    document.getElementById('companion_form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var input = document.getElementById('companion_input');
      var text = (input.value || '').trim();
      if (!text) return;
      input.value = '';
      requestAi(text);
    });

    document.querySelectorAll('[data-prompt]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = btn.getAttribute('data-prompt');
        if (p) requestAi(p);
      });
    });

    document.querySelectorAll('[data-tv-key]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        sendTvKey(btn.getAttribute('data-tv-key'));
      });
    });

    var calibDevice = document.getElementById('calib_device');
    if (calibDevice) {
      calibDevice.addEventListener('change', function () {
        syncCalibPortFromDevice();
        showCalibFeedback(false);
        setCalibStatus('');
      });
    }
    var calibPort = document.getElementById('calib_hdmi_port');
    if (calibPort) {
      calibPort.addEventListener('change', function () {
        showCalibFeedback(false);
        setCalibStatus('');
      });
    }

    function readCalibForm() {
      var deviceEl = document.getElementById('calib_device');
      var portEl = document.getElementById('calib_hdmi_port');
      var offEl = document.getElementById('calib_base_offset');
      var leftEl = document.getElementById('calib_left_reset');
      var platform = (deviceEl && deviceEl.value) || 'ps5';
      if (String(platform).toLowerCase().indexOf('switch') >= 0) platform = 'switch';
      else platform = 'ps5';
      var hdmi = parseInt((portEl && portEl.value) || '1', 10);
      if (!(hdmi >= 1 && hdmi <= 4)) hdmi = 1;
      var baseOffset = parseInt((offEl && offEl.value) || '0', 10);
      var leftReset = parseInt((leftEl && leftEl.value) || '8', 10);
      if (isNaN(baseOffset)) baseOffset = 0;
      if (isNaN(leftReset)) leftReset = 8;
      return { platform: platform, hdmi: hdmi, baseOffset: baseOffset, leftReset: leftReset };
    }

    function setCalibTestBusy(busy) {
      var btn = document.getElementById('btn_calib_test');
      if (!btn) return;
      btn.disabled = !!busy;
      btn.textContent = busy ? 'Testando…' : 'Testar na TV';
    }

    var btnCalibTest = document.getElementById('btn_calib_test');
    if (btnCalibTest) {
      btnCalibTest.addEventListener('click', function () {
        var form = readCalibForm();
        wizardLastHdmi = form.hdmi;
        showCalibFeedback(false);
        setCalibTestBusy(true);
        setCalibStatus('Aplicando ajuste e trocando para HDMI ' + form.hdmi + '… olhe a TV.');
        setStatus('Calibrando HDMI ' + form.hdmi + '…');
        rest.put('/api/v1/companion/hdmi', {
          leftReset: form.leftReset,
          baseOffset: form.baseOffset
        }).then(function () {
          return rest.post('/api/v1/companion/hdmi/wizard/test', { hdmi: form.hdmi });
        }).then(function (r) {
          setCalibStatus((r && r.message) || ('Testei HDMI ' + form.hdmi + '. Confira a TV.'));
          setStatus((r && r.message) || ('HDMI ' + form.hdmi));
          companionLog('system', (r && r.message) || ('HDMI ' + form.hdmi));
          showCalibFeedback(true);
          pollCompanionPending();
        }).catch(function (e) {
          setCalibStatus(e.message || String(e));
          setStatus(e.message || e);
          showCalibFeedback(false);
        }).then(function () {
          setCalibTestBusy(false);
        });
      });
    }

    var btnCalibSave = document.getElementById('btn_calib_save');
    if (btnCalibSave) {
      btnCalibSave.addEventListener('click', function () {
        var form = readCalibForm();
        var hdmi = wizardLastHdmi || form.hdmi;
        setCalibStatus('Salvando…');
        rest.post('/api/v1/companion/hdmi/wizard/assign', {
          hdmi: hdmi,
          platform: form.platform
        }).then(function (r) {
          var msg = (r && r.message) || (form.platform + ' → HDMI ' + hdmi);
          setCalibStatus(msg);
          setStatus(msg);
          companionLog('system', msg);
          showCalibFeedback(false);
          refreshCompanionHousehold().then(function () {
            refreshCompanionHdmi();
          });
          pollCompanionPending();
        }).catch(function (e) {
          setCalibStatus(e.message || String(e));
        });
      });
    }

    var btnCalibAdjust = document.getElementById('btn_calib_adjust');
    if (btnCalibAdjust) {
      btnCalibAdjust.addEventListener('click', function () {
        showCalibFeedback(false);
        var adv = document.querySelector('#companion_panel_hdmi .calib-advanced');
        if (adv) adv.open = true;
        var offEl = document.getElementById('calib_base_offset');
        var cur = parseInt((offEl && offEl.value) || '0', 10);
        if (isNaN(cur)) cur = 0;
        var next = cur - 1;
        if (offEl) offEl.value = String(next);
        setCalibStatus('Offset sugerido: ' + next + '. Ajuste se precisar e toque em Testar na TV de novo.');
        setStatus('Ajuste o offset e teste novamente');
      });
    }

    var btnCalibOpen = document.getElementById('btn_calib_open_saved');
    if (btnCalibOpen) {
      btnCalibOpen.addEventListener('click', function () {
        var form = readCalibForm();
        var label = form.platform === 'switch' ? 'Switch' : 'PS5';
        setCalibStatus('Abrindo ' + label + ' (porta salva)…');
        setStatus('Abrindo ' + label + '…');
        rest.post('/api/v1/companion/hdmi/test', { platform: form.platform }).then(function (r) {
          setCalibStatus(r.message || label);
          setStatus(r.message || label);
          companionLog('system', r.message || label);
          pollCompanionPending();
        }).catch(function (e) {
          setCalibStatus(e.message || String(e));
          setStatus(e.message || e);
        });
      });
    }

    refreshCompanionHdmi();

    var btnYes = document.getElementById('btn_ack_yes');
    var btnNo = document.getElementById('btn_ack_no');
    if (btnYes) {
      btnYes.addEventListener('click', function () {
        if (companionPendingMode === 'title') {
          rest.post('/api/v1/companion/title/ack', { continue: true }).then(function (r) {
            companionLog('system', r.message || 'Continuar título');
            hideAckCard();
            setTimeout(pollCompanionPending, 2000);
          });
        } else {
          rest.post('/api/v1/companion/confirm', { ok: true, note: 'companion-yes' }).then(function () {
            companionLog('system', 'Confirmado: deu certo');
            hideAckCard();
          });
        }
      });
    }
    if (btnNo) {
      btnNo.addEventListener('click', function () {
        if (companionPendingMode === 'title') {
          rest.post('/api/v1/companion/title/ack', { continue: false }).then(function (r) {
            companionLog('system', r.message || 'Pular título');
            hideAckCard();
            setTimeout(pollCompanionPending, 1500);
          });
        } else {
          rest.post('/api/v1/companion/confirm', { ok: false, note: 'companion-no' }).then(function (r) {
            companionLog('system', (r && r.message) || 'Confirmado: falhou');
            if (r && r.hdmiNudge) {
              setStatus(r.message || ('Offset=' + r.hdmiNudge.baseOffset));
              refreshCompanionHdmi();
            }
            hideAckCard();
          });
        }
      });
    }
    setInterval(pollCompanionPending, 4000);
    pollCompanionPending();

    startCompanionLogin();

    var switchLogin = document.getElementById('btn_companion_switch');
    if (switchLogin) {
      switchLogin.addEventListener('click', function () {
        companionEntered = false;
        try { localStorage.removeItem('aiontv_session'); } catch (e) { /* */ }
        companionSessionId = '';
        companionAdminUnlocked = false;
        try { sessionStorage.removeItem('aiontv_admin_ok'); } catch (e2) { /* */ }
        startCompanionLogin();
      });
    }

    var pinForm = document.getElementById('companion_pin_form');
    if (pinForm) {
      pinForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var pin = (document.getElementById('companion_pin_input').value || '').trim();
        if (!pin || !pendingPinDeviceId) return;
        if (!companionSessionId) companionSessionId = 'sess_companion_' + Date.now().toString(36);
        rest.post('/api/v1/household/devices/' + encodeURIComponent(pendingPinDeviceId) + '/unlock', {
          pin: pin, sessionId: companionSessionId
        }).then(function () {
          var card = document.getElementById('companion_pin_card');
          if (card) { card.classList.add('hidden'); card.hidden = true; }
          return rest.post('/api/v1/household/device/active', {
            deviceId: pendingPinDeviceId, sessionId: companionSessionId
          });
        }).then(function () {
          showCompanionToast('TV desbloqueada');
          refreshCompanionHousehold();
        }).catch(function (e) {
          showCompanionToast((e.payload && e.payload.message) || e.message || 'PIN incorreto');
        });
      });
    }
    var pinCancel = document.getElementById('btn_companion_pin_cancel');
    if (pinCancel) {
      pinCancel.addEventListener('click', function () {
        var card = document.getElementById('companion_pin_card');
        if (card) { card.classList.add('hidden'); card.hidden = true; }
      });
    }

    var adminUnlock = document.getElementById('hh_admin_unlock_form');
    if (adminUnlock) {
      adminUnlock.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var pin = (document.getElementById('hh_admin_unlock_pin').value || '').trim();
        rest.post('/api/v1/household/master-pin/verify', { pin: pin }).then(function (r) {
          if (!r || !r.unlocked) throw new Error((r && r.message) || 'PIN incorreto');
          companionAdminUnlocked = true;
          try { sessionStorage.setItem('aiontv_admin_ok', '1'); } catch (e) { /* */ }
          showCompanionToast('Admin desbloqueado');
          syncHhAdminUi(householdCache || { hasMasterPin: true });
        }).catch(function (e) {
          showCompanionToast((e.payload && e.payload.message) || e.message || 'PIN incorreto');
        });
      });
    }

    var masterForm = document.getElementById('companion_master_form');
    if (masterForm) {
      masterForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var pin = (document.getElementById('companion_master_pin').value || '').trim();
        rest.post('/api/v1/household/master-pin', { pin: pin }).then(function () {
          showCompanionToast('PIN mestre salvo');
          refreshCompanionHousehold();
        }).catch(function (e) { showCompanionToast(e.message || 'Falha ao salvar PIN'); });
      });
    }

    var deviceEditForm = document.getElementById('hh_device_edit_form');
    if (deviceEditForm) {
      deviceEditForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var id = (document.getElementById('hh_edit_device_id').value || '').trim();
        if (!id) return;
        var name = (document.getElementById('hh_edit_name').value || '').trim();
        var host = (document.getElementById('hh_edit_host').value || '').trim();
        var roomId = normalizeHhRoomId(document.getElementById('hh_edit_room').value || 'living');
        var devicePin = (document.getElementById('hh_edit_device_pin').value || '').trim();
        var master = (document.getElementById('companion_master_pin').value
            || document.getElementById('hh_admin_unlock_pin').value || '').trim();
        // Um único PUT — nunca /token (quebra em PS5/Switch)
        rest.put('/api/v1/household/devices/' + encodeURIComponent(id), {
          name: name, host: host, roomId: roomId
        }).then(function () {
          if (!devicePin) return null;
          return rest.post('/api/v1/household/devices/' + encodeURIComponent(id) + '/pin', {
            pin: devicePin, masterPin: master
          });
        }).then(function () {
          showCompanionToast('Dispositivo atualizado');
          refreshCompanionHousehold();
        }).catch(function (e) {
          showCompanionToast((e.payload && e.payload.message) || e.message || 'Falha ao salvar');
        });
      });
    }
    var closeEditor = document.getElementById('hh_btn_close_editor');
    if (closeEditor) {
      closeEditor.addEventListener('click', function () {
        var box = document.getElementById('hh_device_editor');
        if (box) box.hidden = true;
      });
    }
    var pairBtn = document.getElementById('hh_btn_pair_device');
    if (pairBtn) {
      pairBtn.addEventListener('click', function () {
        var id = (document.getElementById('hh_edit_device_id').value || '').trim();
        var host = (document.getElementById('hh_edit_host').value || '').trim();
        var master = (document.getElementById('companion_master_pin').value
            || document.getElementById('hh_admin_unlock_pin').value || '').trim();
        if (!id) return;
        showCompanionToast('Pareando… olhe a TV');
        rest.post('/api/v1/household/devices/' + encodeURIComponent(id) + '/pair', {
          host: host, masterPin: master
        }).then(function (r) {
          showCompanionToast(r.message || 'Pareamento enviado');
          refreshCompanionHousehold();
        }).catch(function (e) {
          showCompanionToast((e.payload && e.payload.message) || e.message || 'Falha no pareamento');
        });
      });
    }

    setInterval(pollCompanionInbox, 2000);
    pollCompanionInbox();

    rest.get('/api/v1/catalog/home').then(function (home) {
      companionCatalogHome = home;
      renderCompanionCatalog(home);
    }).catch(function () { /* silencioso — sem spam no header */ });

    var catalogSearch = document.getElementById('companion_catalog_search');
    if (catalogSearch) {
      catalogSearch.addEventListener('input', function () {
        runCompanionCatalogSearch(catalogSearch.value || '');
      });
      catalogSearch.addEventListener('search', function () {
        runCompanionCatalogSearch(catalogSearch.value || '');
      });
    }

    var gameModalClose = document.getElementById('btn_game_modal_close');
    if (gameModalClose) {
      gameModalClose.addEventListener('click', closeHhGameModal);
    }
    var gameSearchInput = document.getElementById('game_search_input');
    if (gameSearchInput) {
      gameSearchInput.addEventListener('input', function () {
        if (hhGameSearchTimer) clearTimeout(hhGameSearchTimer);
        hhGameSearchTimer = setTimeout(function () {
          runHhGameSearch(gameSearchInput.value || '');
        }, 300);
      });
    }

    refreshCompanionHdmi();
    companionLog('system', 'Companion pronto.');
  }

  function showCompanionPin(deviceId, message) {
    pendingPinDeviceId = deviceId || pendingPinDeviceId || 'bedroom-tv';
    var card = document.getElementById('companion_pin_card');
    var text = document.getElementById('companion_pin_text');
    if (text) text.textContent = message || ('TV protegida — digite o PIN');
    if (card) {
      card.classList.remove('hidden');
      card.hidden = false;
    }
    var input = document.getElementById('companion_pin_input');
    if (input) {
      input.value = '';
      try { input.focus(); } catch (e) { /* */ }
    }
    document.querySelectorAll('.companion-tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === 'profiles');
    });
    document.querySelectorAll('.companion-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'companion_panel_profiles');
    });
  }

  function roomLabel(roomId) {
    var r = normalizeHhRoomId(roomId);
    if (r === 'bedroom') return 'Quarto';
    if (r === 'mother') return 'Quarto da Mãe';
    if (r === 'micael') return 'Micael';
    return 'Sala';
  }

  /** Chaves internas do backend (nunca enviar rótulo PT no PUT). */
  function normalizeHhRoomId(roomId) {
    var r = (roomId || 'living').toString().trim().toLowerCase();
    if (r === 'sala' || r === 'living_room' || r === 'living-room') return 'living';
    if (r === 'quarto' || r === 'suite' || r === 'suíte' || r === 'bedroom') return 'bedroom';
    if (r === 'mãe' || r === 'mae' || r === 'mother' || r.indexOf('mãe') >= 0 || r.indexOf('mae') >= 0) {
      return 'mother';
    }
    if (r === 'micael' || r.indexOf('micael') >= 0) return 'micael';
    if (r === 'living' || r === 'bedroom' || r === 'mother' || r === 'micael') return r;
    return 'living';
  }

  function personAllowedIds(person) {
    if (!person) return [];
    var list = person.allowedDeviceIds;
    if (!list || !list.length) return [];
    return list.slice();
  }

  /** Ex.: "Quarto da Mãe" ou "Sala · Quarto" */
  function personRoomsShort(person, devices) {
    var ids = personAllowedIds(person);
    var rooms = [];
    var seen = {};
    (devices || []).forEach(function (d) {
      if (ids.length && !ids.some(function (id) { return id.toLowerCase() === d.id.toLowerCase(); })) return;
      if (!ids.length) return; // "todos" — sem chip de cômodo curto
      var label = roomLabel(d.roomId);
      if (!seen[label]) {
        seen[label] = true;
        rooms.push(label);
      }
    });
    if (!ids.length) return 'todos';
    return rooms.length ? rooms.join(' · ') : 'sem aparelho';
  }

  function personAccessDetail(person, devices) {
    var ids = personAllowedIds(person);
    if (!ids.length) return 'acessa todos os aparelhos';
    var parts = [];
    (devices || []).forEach(function (d) {
      if (!ids.some(function (id) { return id.toLowerCase() === d.id.toLowerCase(); })) return;
      parts.push(roomLabel(d.roomId) + ' · ' + (d.name || d.id));
    });
    return parts.length ? ('acessa: ' + parts.join('; ')) : 'sem aparelho liberado';
  }

  function findDevice(data, deviceId) {
    var found = null;
    (data.devices || []).forEach(function (d) {
      if (d.id === deviceId) found = d;
    });
    return found;
  }

  function bootCompanionAllowDevices(data) {
    var root = document.getElementById('companion_allow_devices');
    if (!root || !data || !data.devices) return;
    root.innerHTML = '';
    var personId = companionAdminEditPersonId || data.activePersonId;
    var person = personById(data, personId);
    if (!person) {
      root.innerHTML = '<p class="companion-hint">Selecione um perfil acima.</p>';
      return;
    }
    var allowed = personAllowedIds(person);
    var allIds = data.devices.map(function (d) { return d.id; });
    var effective = allowed.length ? allowed.slice() : allIds.slice();
    data.devices.forEach(function (d) {
      var on = effective.some(function (id) { return id.toLowerCase() === d.id.toLowerCase(); });
      var row = document.createElement('div');
      row.className = 'hh-toggle-row';
      var text = document.createElement('div');
      text.innerHTML = '<div class="hh-toggle-label"></div><div class="hh-toggle-sub"></div>';
      text.querySelector('.hh-toggle-label').textContent = d.name || d.id;
      text.querySelector('.hh-toggle-sub').textContent = roomLabel(d.roomId)
          + (d.hasPin || d.restricted ? ' · com PIN' : '');
      var tog = document.createElement('button');
      tog.type = 'button';
      tog.className = 'hh-toggle' + (on ? ' on' : '');
      tog.setAttribute('aria-pressed', on ? 'true' : 'false');
      tog.setAttribute('aria-label', (on ? 'Revogar ' : 'Liberar ') + (d.name || d.id));
      tog.addEventListener('click', function () {
        var next = effective.slice();
        var idx = next.findIndex(function (id) { return id.toLowerCase() === d.id.toLowerCase(); });
        if (idx >= 0) {
          if (next.length <= 1) {
            showCompanionToast('Deixe ao menos 1 aparelho');
            return;
          }
          next.splice(idx, 1);
        } else {
          next.push(d.id);
        }
        rest.put('/api/v1/household/person/' + encodeURIComponent(person.id) + '/devices', {
          allowedDeviceIds: next
        }).then(function () {
          showCompanionToast('Permissões atualizadas');
          refreshCompanionHousehold();
        }).catch(function (e) {
          showCompanionToast(e.message || 'Falha ao salvar');
        });
      });
      row.appendChild(text);
      row.appendChild(tog);
      root.appendChild(row);
    });
  }

  function bootCompanionDevices(data) {
    var root = document.getElementById('companion_devices');
    if (!root || !data || !data.devices) return;
    root.innerHTML = '';
    var person = personById(data, data.activePersonId);
    var allowed = personAllowedIds(person);
    var shown = 0;
    data.devices.forEach(function (d) {
      var permitted = !allowed.length || allowed.some(function (id) {
        return id.toLowerCase() === d.id.toLowerCase();
      });
      if (!permitted) return;
      shown += 1;
      var showLock = !!(d.hasPin || d.restricted);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hh-device-card' + (d.id === data.activeDeviceId ? ' active' : '');
      b.innerHTML = '<div><div class="hh-card-title"></div><div class="hh-card-meta"></div></div>'
          + (showLock ? '<span class="hh-lock" aria-hidden="true">🔒</span>' : '');
      b.querySelector('.hh-card-title').textContent = d.name || d.id;
      b.querySelector('.hh-card-meta').textContent = roomLabel(d.roomId)
          + (d.id === data.activeDeviceId ? ' · ativo' : '');
      b.addEventListener('click', function () {
        var body = { deviceId: d.id };
        if (companionSessionId) body.sessionId = companionSessionId;
        rest.post('/api/v1/household/device/active', body).then(function (res) {
          if (res && res.code === 'PIN_REQUIRED') {
            showCompanionPin(d.id, res.message || ('PIN para ' + (d.name || d.id)));
            return;
          }
          showCompanionToast('Controlando ' + (d.name || d.id));
          applyHousehold(res);
          updateCompanionHeader(res);
          refreshCompanionHousehold();
        }).catch(function (e) {
          var p = e.payload || {};
          if (p.code === 'PIN_REQUIRED') showCompanionPin(d.id, p.message);
          else showCompanionToast(p.message || e.message || 'Falha');
        });
      });
      root.appendChild(b);
    });
    if (!shown) {
      root.innerHTML = '<p class="companion-hint">Nenhum aparelho liberado pra este perfil.</p>';
    }
    var line = document.getElementById('companion_profile_line');
    if (line) {
      line.textContent = (data.activePersonName || 'Perfil') + ' · toque um aparelho pra controlar';
    }
  }

  function bootCompanionAdminDevices(data) {
    var root = document.getElementById('hh_admin_devices');
    if (!root || !data || !data.devices) return;
    root.innerHTML = '';
    data.devices.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hh-admin-device';
      b.innerHTML = '<div class="hh-card-title"></div><div class="hh-card-meta"></div>';
      b.querySelector('.hh-card-title').textContent = d.name || d.id;
      b.querySelector('.hh-card-meta').textContent = roomLabel(d.roomId)
          + (d.host ? (' · ' + d.host) : '')
          + (d.hasPin || d.restricted ? ' · PIN' : '');
      b.addEventListener('click', function () { openHhDeviceEditor(d); });
      root.appendChild(b);
    });
  }

  function openHhDeviceEditor(d) {
    var box = document.getElementById('hh_device_editor');
    if (!box || !d) return;
    box.hidden = false;
    var title = document.getElementById('hh_device_editor_title');
    if (title) title.textContent = 'Editar · ' + (d.name || d.id);
    var idEl = document.getElementById('hh_edit_device_id');
    var nameEl = document.getElementById('hh_edit_name');
    var hostEl = document.getElementById('hh_edit_host');
    var roomEl = document.getElementById('hh_edit_room');
    var pinEl = document.getElementById('hh_edit_device_pin');
    if (idEl) idEl.value = d.id || '';
    if (nameEl) nameEl.value = d.name || '';
    if (hostEl) hostEl.value = d.host || '';
    if (roomEl) roomEl.value = normalizeHhRoomId(d.roomId || 'living');
    if (pinEl) pinEl.value = '';
    var pairBtn = document.getElementById('hh_btn_pair_device');
    if (pairBtn) {
      var isConsole = (d.role || '').toLowerCase() === 'console'
          || /ps5|switch|steam/i.test(d.id || '')
          || /ps5|switch|steam/i.test(d.platform || '');
      pairBtn.hidden = !!isConsole;
    }
  }

  function refreshCompanionHousehold() {
    var q = companionSessionId ? ('?sessionId=' + encodeURIComponent(companionSessionId)) : '';
    return rest.get('/api/v1/household' + q).then(function (d) {
      householdCache = d;
      if (!companionAdminEditPersonId) companionAdminEditPersonId = d.activePersonId || '';
      updateCompanionHeader(d);
      bootCompanionPeople(d);
      bootCompanionAllowDevices(d);
      bootCompanionDevices(d);
      bootCompanionAdminDevices(d);
      renderCompanionMatrix(d);
      populateCalibDevices(d);
      syncHhAdminUi(d);
      refreshHhGamesLibrary();
      return d;
    });
  }

  function refreshHhGamesLibrary() {
    return rest.get('/api/v1/entertainment').then(function (data) {
      entertainmentCache = data || entertainmentCache;
      bootHhGamesLibrary(entertainmentCache);
      return data;
    }).catch(function () {
      var st = document.getElementById('hh_games_status');
      if (st) {
        st.hidden = false;
        st.textContent = 'Biblioteca de jogos offline';
      }
    });
  }

  function bootHhGamesLibrary(data) {
    var root = document.getElementById('hh_games_platforms');
    var listEl = document.getElementById('hh_games_list');
    var st = document.getElementById('hh_games_status');
    if (!root || !listEl) return;
    var d = data || entertainmentCache;
    if (!d) return;
    if (st) {
      var bits = [];
      if (!d.rawgConfigured) bits.push('Configure RAWG_API_KEY pra buscar jogos');
      if (!d.steamConfigured) bits.push('Steam API não configurada');
      if (bits.length) {
        st.hidden = false;
        st.textContent = bits.join(' · ');
      } else {
        st.hidden = true;
        st.textContent = '';
      }
    }
    root.innerHTML = '';
    ['ps5', 'switch', 'steam'].forEach(function (p) {
      var count = gamesForPlatform(d, p).length;
      var wrap = document.createElement('div');
      wrap.className = 'hh-games-plat' + (p === hhGamesFocusPlat ? ' active' : '');
      var head = document.createElement('button');
      head.type = 'button';
      head.className = 'hh-games-plat-head';
      head.innerHTML = '<div><div class="hh-games-plat-title"></div><div class="hh-games-plat-meta"></div></div>';
      head.querySelector('.hh-games-plat-title').textContent = gamesPlatLabel(p);
      head.querySelector('.hh-games-plat-meta').textContent = count + (count === 1 ? ' jogo' : ' jogos');
      head.addEventListener('click', function () {
        hhGamesFocusPlat = p;
        bootHhGamesLibrary(d);
      });
      var actions = document.createElement('div');
      actions.className = 'hh-games-plat-actions';
      if (p === 'steam') {
        var sync = document.createElement('button');
        sync.type = 'button';
        sync.className = 'companion-btn';
        sync.textContent = 'Sincronizar Steam (API)';
        sync.disabled = !d.steamConfigured;
        sync.addEventListener('click', function () {
          showCompanionToast('Sincronizando Steam…');
          rest.post('/api/v1/entertainment/steam/sync?limit=120', {}).then(function (r) {
            showCompanionToast((r && r.message) || 'Steam sincronizada');
            refreshHhGamesLibrary();
          }).catch(function (e) {
            showCompanionToast((e.payload && e.payload.message) || e.message || 'Falha Steam');
          });
        });
        actions.appendChild(sync);
      } else {
        var add = document.createElement('button');
        add.type = 'button';
        add.className = 'companion-btn';
        add.textContent = '+ Adicionar Jogo Manual';
        add.addEventListener('click', function () {
          openHhGameModal(p);
        });
        actions.appendChild(add);
      }
      wrap.appendChild(head);
      wrap.appendChild(actions);
      root.appendChild(wrap);
    });

    listEl.innerHTML = '';
    var games = gamesForPlatform(d, hhGamesFocusPlat);
    if (!games.length) {
      listEl.innerHTML = '<p class="companion-hint">Nenhum jogo em ' + gamesPlatLabel(hhGamesFocusPlat)
          + '. Toque em “+ Adicionar” ou sincronize a Steam.</p>';
      return;
    }
    var title = document.createElement('p');
    title.className = 'companion-hint';
    title.textContent = 'Jogos · ' + gamesPlatLabel(hhGamesFocusPlat);
    listEl.appendChild(title);
    games.forEach(function (g) {
      var row = document.createElement('div');
      row.className = 'hh-game-row';
      var img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.src = g.posterUrl || ('/api/v1/catalog/art?title=' + encodeURIComponent(g.title || '') + '&hue=' + (g.hue || 0));
      var name = document.createElement('div');
      name.className = 'hh-game-title';
      name.textContent = g.title || g.id;
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'hh-game-del';
      del.setAttribute('aria-label', 'Remover ' + (g.title || ''));
      del.textContent = hhPendingDeleteGameId === g.id ? 'OK' : '🗑️';
      del.addEventListener('click', function () {
        if (hhPendingDeleteGameId !== g.id) {
          hhPendingDeleteGameId = g.id;
          bootHhGamesLibrary(d);
          showCompanionToast('Toque de novo pra confirmar remoção');
          return;
        }
        hhPendingDeleteGameId = '';
        rest.del('/api/v1/entertainment/games/' + encodeURIComponent(g.id)).then(function () {
          showCompanionToast('Jogo removido');
          refreshHhGamesLibrary();
        }).catch(function (e) {
          showCompanionToast(e.message || 'Falha ao remover');
        });
      });
      row.appendChild(img);
      row.appendChild(name);
      row.appendChild(del);
      listEl.appendChild(row);
    });
  }

  function openHhGameModal(platform) {
    hhGameAddPlatform = platform || 'ps5';
    var modal = document.getElementById('modal_add_game');
    var title = document.getElementById('game_search_title');
    var input = document.getElementById('game_search_input');
    var results = document.getElementById('game_search_results');
    var hint = document.getElementById('game_search_hint');
    if (title) title.textContent = 'Adicionar · ' + gamesPlatLabel(hhGameAddPlatform);
    if (results) results.innerHTML = '';
    if (hint) hint.textContent = entertainmentCache && entertainmentCache.rawgConfigured
        ? 'Digite pra buscar na RAWG'
        : 'Configure RAWG_API_KEY no .env do PC';
    if (input) input.value = '';
    if (modal) modal.hidden = false;
    if (input) {
      try { input.focus(); } catch (e) { /* */ }
    }
  }

  function closeHhGameModal() {
    var modal = document.getElementById('modal_add_game');
    if (modal) modal.hidden = true;
  }

  function runHhGameSearch(q) {
    var results = document.getElementById('game_search_results');
    var hint = document.getElementById('game_search_hint');
    var term = (q || '').trim();
    if (!results) return;
    if (term.length < 2) {
      results.innerHTML = '';
      if (hint) hint.textContent = 'Digite ao menos 2 letras';
      return;
    }
    if (hint) hint.textContent = 'Buscando…';
    rest.get('/api/v1/entertainment/search?q=' + encodeURIComponent(term)
        + '&platform=' + encodeURIComponent(hhGameAddPlatform) + '&limit=12')
        .then(function (res) {
          var items = (res && res.items) || [];
          results.innerHTML = '';
          if (!items.length) {
            if (hint) hint.textContent = 'Nenhum resultado';
            return;
          }
          if (hint) hint.textContent = items.length + ' resultados · toque pra adicionar';
          items.forEach(function (it) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'hh-game-result';
            b.innerHTML = '<img alt=""/><div class="hh-game-result-title"></div>';
            var img = b.querySelector('img');
            img.src = it.posterUrl || ('/api/v1/catalog/art?title=' + encodeURIComponent(it.title || '') + '&hue=200');
            img.loading = 'lazy';
            b.querySelector('.hh-game-result-title').textContent = it.title || '';
            b.addEventListener('click', function () {
              rest.post('/api/v1/entertainment/games', {
                title: it.title,
                platform: hhGameAddPlatform,
                posterUrl: it.posterUrl || null,
                rawgId: it.rawgId
              }).then(function () {
                closeHhGameModal();
                showCompanionToast('Jogo adicionado com sucesso');
                refreshHhGamesLibrary();
              }).catch(function (e) {
                showCompanionToast((e.payload && e.payload.message) || e.message || 'Falha ao adicionar');
              });
            });
            results.appendChild(b);
          });
        })
        .catch(function (e) {
          if (hint) hint.textContent = (e.payload && e.payload.message) || e.message || 'Falha na busca';
          results.innerHTML = '';
        });
  }

  function syncHhAdminUi(data) {
    var gate = document.getElementById('hh_admin_gate');
    var body = document.getElementById('hh_admin_body');
    if (!gate || !body) return;
    try {
      if (sessionStorage.getItem('aiontv_admin_ok') === '1') companionAdminUnlocked = true;
    } catch (e) { /* */ }
    var needsPin = !!(data && data.hasMasterPin);
    if (!needsPin) companionAdminUnlocked = true;
    gate.hidden = companionAdminUnlocked;
    body.hidden = !companionAdminUnlocked;
  }

  function pollCompanionInbox() {
    if (!companionMode) return;
    rest.get('/api/v1/companion/inbox?since=' + companionInboxCursor).then(function (res) {
      if (!res || !res.events) return;
      if (typeof res.cursor === 'number') companionInboxCursor = res.cursor;
      for (var i = 0; i < res.events.length; i++) {
        var ev = res.events[i];
        if (ev && (ev.type === 'PIN_REQUIRED' || ev.code === 'PIN_REQUIRED')) {
          showCompanionPin(ev.deviceId, ev.message);
          companionLog('system', ev.message || 'PIN necessário');
        }
      }
    }).catch(function () { /* ignore */ });
  }

  function bootCompanionPeople(data) {
    var people = document.getElementById('companion_people');
    if (!people || !data || !data.people) return;
    people.innerHTML = '';
    if (!companionAdminEditPersonId) companionAdminEditPersonId = data.activePersonId || '';
    data.people.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hh-people-chip' + (p.id === companionAdminEditPersonId ? ' active' : '');
      b.textContent = p.name + (p.isDefault ? ' · padrão' : '');
      b.title = personAccessDetail(p, data.devices);
      b.addEventListener('click', function () {
        companionAdminEditPersonId = p.id;
        bootCompanionPeople(data);
        bootCompanionAllowDevices(data);
        renderCompanionMatrix(data);
      });
      people.appendChild(b);
    });
  }

  function companionAccessBadge(item) {
    var a = item && item.access;
    if (a === 'library') return { cls: 'badge-library', text: 'Na sua lib' };
    if (a === 'owned') return { cls: 'badge-owned', text: 'Na assinatura' };
    if (a === 'subscribe') return { cls: 'badge-subscribe', text: 'Assinar' };
    if (a === 'rent') return { cls: 'badge-rent', text: 'Alugar' };
    if (a === 'buy') return { cls: 'badge-buy', text: 'Comprar' };
    if (a === 'none') return { cls: 'badge-none', text: 'Indisponível' };
    return null;
  }

  function setCompanionCatalogStatus(text) {
    var el = document.getElementById('companion_catalog_status');
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  function buildRatingStarsRow(item) {
    var row = document.createElement('div');
    row.className = 'rating-stars';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Nota de ' + (item.title || 'título'));
    for (var s = 1; s <= 5; s++) {
      (function (stars) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'rating-star';
        b.setAttribute('data-stars', String(stars));
        b.setAttribute('aria-label', stars + (stars === 1 ? ' estrela' : ' estrelas'));
        b.setAttribute('aria-pressed', 'false');
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'
            + '<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" '
            + 'd="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.6 9.7l5.8-.8z"/>'
            + '</svg>';
        b.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          submitCompanionItemRating(item, stars, row);
        });
        row.appendChild(b);
      })(s);
    }
    var known = cachedCompanionTitleStars(item);
    if (known != null) {
      paintRatingStars(row, known);
    } else if (item && item.title) {
      rest.get('/api/v1/catalog/title-rating?title=' + encodeURIComponent(item.title))
          .then(function (r) {
            if (!r || r.stars == null) return;
            rememberCompanionTitleStars(item.title, item.tmdbId, r.stars);
            paintRatingStars(row, r.stars);
          })
          .catch(function () { /* ignore */ });
    }
    return row;
  }

  function appendCompanionCatalogItem(root, item, subtitleFallback) {
    var card = document.createElement('div');
    card.className = 'companion-item';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'companion-item-main';
    var img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    var poster = item.posterUrl || '';
    img.src = window.AiOnTvCatalogView && window.AiOnTvCatalogView.absUrl
        ? window.AiOnTvCatalogView.absUrl(poster)
        : poster;
    img.onerror = function () {
      img.onerror = null;
      img.removeAttribute('src');
      img.style.background =
          'linear-gradient(145deg,#1e293b,#0f172a)';
    };
    var meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = '<div class="t-row"><div class="t"></div></div><div class="s"></div>';
    meta.querySelector('.t').textContent = item.title || '';
    var badge = companionAccessBadge(item);
    if (badge) {
      var tag = document.createElement('span');
      tag.className = 'badge-access ' + badge.cls;
      tag.textContent = badge.text;
      meta.querySelector('.t-row').appendChild(tag);
    }
    var sub = item.subtitle || item.appName || subtitleFallback || '';
    meta.querySelector('.s').textContent = sub
        ? (sub + (badge ? '' : ' · toque abre na TV'))
        : 'Toque abre na TV';
    btn.appendChild(img);
    btn.appendChild(meta);
    btn.addEventListener('click', function () {
      var payload = window.AiOnTvCatalogView && window.AiOnTvCatalogView.resolvePlayPayload
          ? window.AiOnTvCatalogView.resolvePlayPayload(item)
          : {
            appId: item.appId || '',
            appName: item.appName || '',
            title: item.title || '',
            posterUrl: item.posterUrl || '',
            url: item.url || '',
            mediaType: item.mediaType || ''
          };
      playPayload(payload);
    });
    card.appendChild(btn);
    if (item && item.title && item.mediaType !== 'console'
        && !(item.appId && String(item.appId).indexOf('hdmi:') === 0)) {
      card.appendChild(buildRatingStarsRow(item));
    }
    root.appendChild(card);
  }

  function renderCompanionCatalog(home) {
    var root = document.getElementById('companion_catalog');
    if (!root || !home) return;
    companionCatalogHome = home;
    var seq = ++companionCatalogRenderSeq;
    root.innerHTML = '';
    setCompanionCatalogStatus('');
    warmCompanionTitleRatings().then(function () {
      if (seq !== companionCatalogRenderSeq) return;
      root.innerHTML = '';
      var rows = home.rows || [];
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        if (!row) continue;
        // Companion: evita inundar com apps/jogos densos
        if (row.id === 'row-apps' || row.id === 'row-jogos' || row.id === 'row-emu') continue;
        var items = row.items || [];
        var heading = document.createElement('div');
        heading.className = 'companion-catalog-row-title';
        heading.textContent = row.title || '';
        if (heading.textContent) root.appendChild(heading);
        for (var i = 0; i < Math.min(items.length, 10); i++) {
          appendCompanionCatalogItem(root, items[i], row.title || '');
        }
      }
    });
  }

  function renderCompanionCatalogSearchResults(res, q) {
    var root = document.getElementById('companion_catalog');
    if (!root) return;
    var seq = ++companionCatalogRenderSeq;
    root.innerHTML = '';
    var items = (res && res.items) || [];
    if (!items.length) {
      setCompanionCatalogStatus('Sem resultados para "' + q + '"');
      return;
    }
    var bits = items.length + ' resultado' + (items.length === 1 ? '' : 's');
    if (res.inLibrary != null) bits += ' · ' + res.inLibrary + ' na sua lib';
    if (res.elsewhere) bits += ' · ' + res.elsewhere + ' em outros lugares';
    setCompanionCatalogStatus(bits);
    warmCompanionTitleRatings().then(function () {
      if (seq !== companionCatalogRenderSeq) return;
      root.innerHTML = '';
      var heading = document.createElement('div');
      heading.className = 'companion-catalog-row-title';
      heading.textContent = 'Resultados';
      root.appendChild(heading);
      for (var i = 0; i < items.length; i++) {
        appendCompanionCatalogItem(root, items[i], '');
      }
    });
  }

  function runCompanionCatalogSearch(raw) {
    var q = (raw || '').trim();
    if (companionCatalogSearchTimer) {
      clearTimeout(companionCatalogSearchTimer);
      companionCatalogSearchTimer = null;
    }
    if (!q) {
      companionCatalogSearchSeq += 1;
      if (companionCatalogHome) renderCompanionCatalog(companionCatalogHome);
      else setCompanionCatalogStatus('');
      return;
    }
    var seq = ++companionCatalogSearchSeq;
    setCompanionCatalogStatus('Buscando…');
    companionCatalogSearchTimer = setTimeout(function () {
      companionCatalogSearchTimer = null;
      rest.get('/api/v1/catalog/library/search?q=' + encodeURIComponent(q) + '&limit=36')
          .then(function (res) {
            if (seq !== companionCatalogSearchSeq) return;
            renderCompanionCatalogSearchResults(res, q);
          })
          .catch(function (e) {
            if (seq !== companionCatalogSearchSeq) return;
            setCompanionCatalogStatus('Busca: ' + (e.message || e));
          });
    }, 300);
  }

  function activateFocused() {
    var el = document.getElementById(focus.focusId);
    if (!el) return;
    var action = el.getAttribute('data-action');

    if (action === 'chat') {
      showScreen('chat');
      return;
    }
    if (action === 'open-az') {
      showScreen('az');
      return;
    }
    if (action === 'open-categories') {
      showScreen('categories');
      return;
    }
    if (action === 'cat-tab') {
      var cat = el.getAttribute('data-category') || 'movie';
      if (window.AiOnTvCatalogBrowse) window.AiOnTvCatalogBrowse.setCategory(cat, focus);
      return;
    }
    if (action === 'cat-more') {
      if (window.AiOnTvCatalogBrowse) window.AiOnTvCatalogBrowse.loadMoreCategory(focus);
      return;
    }
    if (action === 'search-catalog') {
      showScreen('search');
      return;
    }
    if (action === 'az-letter') {
      var letter = el.getAttribute('data-letter') || 'A';
      if (window.AiOnTvCatalogBrowse) window.AiOnTvCatalogBrowse.setLetter(letter, focus);
      return;
    }
    if (action === 'az-more') {
      if (window.AiOnTvCatalogBrowse) window.AiOnTvCatalogBrowse.loadMore(focus);
      return;
    }
    if (action === 'search-clear') {
      if (searchKeyboard) searchKeyboard.clear();
      if (window.AiOnTvCatalogBrowse) window.AiOnTvCatalogBrowse.runSearch('', focus);
      return;
    }
    if (action === 'profiles') {
      showScreen('profiles');
      return;
    }
    if (action === 'rate') {
      showScreen('rate');
      return;
    }
    if (action === 'mark-watched') {
      markSelectedWatched();
      return;
    }
    if (action === 'rate-title') {
      openTitleRate();
      return;
    }
    if (action === 'title-rate-star') {
      var tStars = parseInt(el.getAttribute('data-stars') || '0', 10);
      submitSelectedTitleRating(tStars);
      return;
    }
    if (action === 'title-rate-back') {
      showScreen('home');
      return;
    }
    if (action === 'rate-star') {
      var stars = parseInt(el.getAttribute('data-stars') || '0', 10);
      submitRating(stars, '');
      return;
    }
    if (action === 'select-person') {
      selectPerson(el.getAttribute('data-person-id') || '');
      return;
    }
    if (action === 'pick-avatar') {
      pickAvatar(el.getAttribute('data-avatar-url') || '');
      return;
    }
    if (action === 'toggle-device') {
      toggleProfileDevice(
          el.getAttribute('data-person-id') || '',
          el.getAttribute('data-device-id') || '',
          el.id
      );
      return;
    }
    if (action === 'cycle-platform') {
      cycleDevicePlatform(el.getAttribute('data-device-id') || '');
      return;
    }
    if (action === 'cycle-room') {
      cycleDeviceRoom(
          el.getAttribute('data-device-id') || '',
          el.getAttribute('data-room-id') || 'living'
      );
      return;
    }
    if (action === 'games-view') {
      gamesLibFocusPlat = el.getAttribute('data-platform') || 'ps5';
      renderGamesLibrary(entertainmentCache, el.id);
      return;
    }
    if (action === 'games-calibrate') {
      calibrateGamesPlatform(el.getAttribute('data-platform') || '', el.id);
      return;
    }
    if (action === 'games-clear') {
      clearGamesPlatform(el.getAttribute('data-platform') || '', el.id);
      return;
    }
    if (action === 'games-steam-sync') {
      syncSteamLibrary(el.id);
      return;
    }
    if (action === 'games-delete') {
      deleteGameEntry(el.getAttribute('data-game-id') || '', 'gl_view_' + gamesLibFocusPlat);
      return;
    }
    if (action === 'tv-login-person') {
      finishTvLoginPerson(
          el.getAttribute('data-person-id') || '',
          el.getAttribute('data-device-id') || tvSelfDeviceId
      );
      return;
    }
    if (action === 'manage-profiles') {
      showScreen('profiles');
      return;
    }
    if (action === 'save-avatar') {
      saveActiveAvatar();
      return;
    }
    if (action === 'matrix-dec' || action === 'matrix-inc') {
      var cur = parseInt(el.getAttribute('data-index') || '0', 10);
      var delta = action === 'matrix-inc' ? 1 : -1;
      adjustMatrix(
        el.getAttribute('data-person-id') || '',
        el.getAttribute('data-app-key') || '',
        cur + delta,
        el.id
      );
      return;
    }
    if (action === 'home') {
      showScreen('home');
      return;
    }
    if (action === 'close-player') {
      closePlayer();
      return;
    }
    if (action === 'player-fullscreen') {
      openGamesFullscreen(lastPlayerUrl || '/games/');
      return;
    }
    if (action === 'companion-info') {
      showCompanionBanner(true);
      return;
    }
    if (action === 'companion-close') {
      showCompanionBanner(false);
      return;
    }
    if (action === 'play-hero') {
      playPayload(window.AiOnTvCatalogView.currentPlayPayload());
      return;
    }
    if (action === 'ask-hero') {
      var p = window.AiOnTvCatalogView.currentPlayPayload();
      if (p && p.title) {
        // Pergunta (não "Abra…") — evita carrossel sticky / tool play
        requestAi('Me conta sobre ' + p.title
            + (p.appName ? ' (está em ' + p.appName + ')' : '')
            + '. Vale a pena?');
      }
      return;
    }
    if (action === 'play-title') {
      var item = el._catalogItem || {};
      var payload = window.AiOnTvCatalogView.resolvePlayPayload
          ? window.AiOnTvCatalogView.resolvePlayPayload(item)
          : {
            appId: el.getAttribute('data-app-id') || '',
            appName: el.getAttribute('data-app-name') || '',
            title: el.getAttribute('data-title') || '',
            posterUrl: item.posterUrl || '',
            url: item.url || el.getAttribute('data-url') || '',
            mediaType: item.mediaType || ''
          };
      if (payload && payload.appName) {
        setStatus((payload.title || '') + ' · ' + payload.appName + (payload.providers && payload.providers.length > 1
            ? ' (OK de novo troca o app)' : ''));
      }
      playPayload(payload);
      return;
    }
    if (action === 'key') {
      var k = el.getAttribute('data-key');
      if (currentScreen === 'search' && searchKeyboard) {
        searchKeyboard.press(k);
        return;
      }
      var result = keyboard.press(k);
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
    if (action === 'chip') {
      requestAi(el.getAttribute('data-prompt') || '');
      return;
    }
  }

  function handleServerMessage(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'session.ready') {
      setStatus('Conectado · catálogo pronto');
      return;
    }
    // Comandos nativos no envelope (backend → TV)
    if (msg.type === 'native_hdmi') {
      var p = msg.payload || msg;
      runNativeHdmi(p.port != null ? p.port : p.hdmi, p);
      return;
    }
    if (msg.type === 'native_launch') {
      var lp = msg.payload || msg;
      runNativeLaunch(lp.appId || lp.app_id, lp.metaTag || lp.meta_tag || lp.payload, lp);
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
    if (msg.type === 'client_action' && msg.payload && msg.payload.action) {
      applyClientAction(msg.payload.action);
      return;
    }
    if (msg.type === 'ai_response_done' && msg.payload) {
      window.AiOnTvChatUi.endStream(msg.payload.correlationId);
      document.getElementById('chat_status').textContent = 'Pronto';
      var cas = msg.payload.clientActions || [];
      for (var ci = 0; ci < cas.length; ci++) applyClientAction(cas[ci]);
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

    // typing from PC keyboard while on chat / search
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
    if (currentScreen === 'search' && searchKeyboard && key.length === 1
        && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      searchKeyboard.press(key.toLowerCase());
      return;
    }
    if (currentScreen === 'search' && searchKeyboard && key === 'Backspace') {
      event.preventDefault();
      searchKeyboard.press('BKSP');
      return;
    }

    // Em player de jogo: não roubar D-pad do iframe (causa “jogo morto”)
    if (currentScreen === 'player') {
      var pFrame = document.getElementById('player_frame');
      var gamePlaying = pFrame && !pFrame.classList.contains('hidden') && pFrame.src
          && pFrame.src.indexOf('about:blank') < 0;
      if (gamePlaying && (key === 'ArrowLeft' || key === 'ArrowRight'
          || key === 'ArrowUp' || key === 'ArrowDown' || key === 'Enter')) {
        try { pFrame.contentWindow.focus(); } catch (e) { /* */ }
        return;
      }
    }

    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
      event.preventDefault();
      var beforeId = focus.focusId;
      focus.move(key);
      // No fim do grid A-Z / Categorias: direita/baixo levam ao tile "Mais"
      if ((key === 'ArrowRight' || key === 'ArrowDown') && beforeId === focus.focusId) {
        var moreId = currentScreen === 'az' ? 'az_tile_more'
            : (currentScreen === 'categories' ? 'cat_tile_more' : null);
        if (moreId && document.getElementById(moreId)) {
          var lastPrefix = currentScreen === 'az' ? 'az_tile_' : 'cat_tile_';
          if (beforeId && beforeId.indexOf(lastPrefix) === 0 && beforeId.indexOf('_more') < 0) {
            focus.focus(moreId);
          }
        }
      }
      var focused = document.getElementById(focus.focusId);
      if (focused && focused.classList.contains('tile-more') && focused.scrollIntoView) {
        focused.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } else if (focused && focused.classList.contains('tile')) {
        if (window.AiOnTvCatalogView && window.AiOnTvCatalogView.onTileFocus) {
          window.AiOnTvCatalogView.onTileFocus(focused);
        }
        if ((currentScreen === 'az' || currentScreen === 'categories') && focused.scrollIntoView) {
          focused.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }
      if (currentScreen === 'profiles' && focused && focused.scrollIntoView) {
        focused.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
      return;
    }

    if (key === 'Enter') {
      event.preventDefault();
      activateFocused();
      return;
    }

    // Atalho 1–5 na tela de avaliar (controle numérico / teclado)
    if (currentScreen === 'rate' || currentScreen === 'title_rate') {
      var nRate = -1;
      if (key.indexOf('Digit') === 0) nRate = parseInt(key.replace('Digit', ''), 10);
      else if (key.length === 1 && key >= '1' && key <= '5') nRate = parseInt(key, 10);
      if (nRate >= 1 && nRate <= 5) {
        event.preventDefault();
        if (currentScreen === 'title_rate') {
          focus.focus('title_rate_star_' + nRate);
          submitSelectedTitleRating(nRate);
        } else {
          focus.focus('rate_star_' + nRate);
          submitRating(nRate, '');
        }
        return;
      }
    }

    // Teclas coloridas no catálogo: vermelho = já vi · amarelo = classificar
    if (currentScreen === 'home' || currentScreen === 'az'
        || currentScreen === 'search' || currentScreen === 'categories') {
      if (key === 'ColorRed' || key === 'ColorF0Red' || key === 'F1') {
        event.preventDefault();
        markSelectedWatched();
        return;
      }
      if (key === 'ColorYellow' || key === 'ColorF2Yellow' || key === 'F3') {
        event.preventDefault();
        openTitleRate();
        return;
      }
    }

    if (key === 'Back') {
      event.preventDefault();
      if (currentScreen === 'player') closePlayer();
      else if (currentScreen === 'title_rate') showScreen('home');
      else if (currentScreen === 'home'
          && window.AiOnTvCatalogView
          && window.AiOnTvCatalogView.hasAiSuggestions
          && window.AiOnTvCatalogView.hasAiSuggestions()) {
        window.AiOnTvCatalogView.clearSuggestions(focus);
        setStatus('Catálogo restaurado');
        loadCatalogQuiet();
      } else if (currentScreen === 'chat' || currentScreen === 'profiles'
          || currentScreen === 'rate' || currentScreen === 'search'
          || currentScreen === 'az' || currentScreen === 'categories') {
        showScreen('home');
      } else if (currentScreen === 'tv_login') {
        /* fica no login */
      }
      return;
    }
  }

  function selectedCatalogItem() {
    if (window.AiOnTvCatalogView && window.AiOnTvCatalogView.selectedItem) {
      return window.AiOnTvCatalogView.selectedItem();
    }
    var focused = document.querySelector('.tile.focused');
    return focused && focused._catalogItem ? focused._catalogItem : null;
  }

  function markSelectedWatched() {
    var item = selectedCatalogItem();
    if (!item || !item.title) {
      setStatus('Foque um título no catálogo');
      return;
    }
    rest.post('/api/v1/catalog/watched', {
      title: item.title,
      appId: item.appId || '',
      appName: item.appName || '',
      posterUrl: item.posterUrl || ''
    }).then(function (res) {
      if (window.AiOnTvCatalogView && window.AiOnTvCatalogView.markLocalWatched) {
        window.AiOnTvCatalogView.markLocalWatched(item.title, res && res.stars);
      }
      setStatus(res.message || ('Já visto: ' + item.title));
    }).catch(function (e) {
      setStatus((e.payload && e.payload.message) || e.message || 'Falha ao marcar');
    });
  }

  function openTitleRate() {
    var item = selectedCatalogItem();
    if (!item || !item.title) {
      setStatus('Foque um título no catálogo');
      return;
    }
    pendingTitleRateItem = item;
    var name = document.getElementById('title_rate_name');
    var meta = document.getElementById('title_rate_meta');
    if (name) name.textContent = item.title;
    if (meta) {
      meta.textContent = (item.appName || item.subtitle || '')
          + (item.year ? (' · ' + item.year) : '');
    }
    showScreen('title_rate');
  }

  var pendingTitleRateItem = null;

  function submitSelectedTitleRating(stars) {
    var item = pendingTitleRateItem || selectedCatalogItem();
    if (!item || !item.title) {
      setStatus('Nenhum título');
      return;
    }
    rest.post('/api/v1/catalog/title-rating', {
      title: item.title,
      tmdbId: item.tmdbId || null,
      mediaType: item.mediaType || '',
      stars: stars,
      appId: item.appId || '',
      appName: item.appName || '',
      posterUrl: item.posterUrl || '',
      comment: 'tv-catalog'
    }).then(function (res) {
      if (window.AiOnTvCatalogView && window.AiOnTvCatalogView.markLocalWatched) {
        window.AiOnTvCatalogView.markLocalWatched(item.title, stars);
      }
      setStatus((res.title || item.title) + ' · ' + stars + '★ (já visto)');
      showScreen('home');
    }).catch(function (e) {
      setStatus((e.payload && e.payload.message) || e.message || 'Falha na nota');
    });
  }

  function loadCatalogWatchMeta() {
    return Promise.all([
      rest.get('/api/v1/catalog/history?limit=40').catch(function () { return []; }),
      rest.get('/api/v1/catalog/title-ratings?limit=40').catch(function () { return { items: [] }; })
    ]).then(function (pair) {
      var hist = pair[0] || [];
      var ratings = (pair[1] && pair[1].items) || [];
      var titles = [];
      for (var i = 0; i < hist.length; i++) {
        if (hist[i] && hist[i].title) titles.push(hist[i].title);
      }
      if (window.AiOnTvCatalogView && window.AiOnTvCatalogView.setWatchMeta) {
        window.AiOnTvCatalogView.setWatchMeta(titles, ratings);
      }
    });
  }

  function loadCatalog() {
    setStatus('Carregando catálogo…');
    // Home em paralelo com meta (não serializar); timeout evita "carregando pra sempre".
    var homeP = rest.get('/api/v1/catalog/home', 25000);
    var metaP = loadCatalogWatchMeta();
    return Promise.all([homeP, metaP]).then(function (pair) {
      var home = pair[0];
      window.AiOnTvCatalogView.render(home, focus);
      setStatus((home.source || 'catálogo') + ' · ' + ((home.rows && home.rows.length) || 0) + ' fileiras');
      showScreen('home');
      kickLibraryIngest();
    }).catch(function (e) {
      setStatus('Falha no catálogo: ' + (e.message || e));
      document.getElementById('hero_title').textContent = 'Catálogo indisponível';
      document.getElementById('hero_overview').textContent = 'Backend offline ou ainda iniciando. Tente de novo.';
    });
  }

  var libraryIngestKicked = false;
  function kickLibraryIngest() {
    if (libraryIngestKicked) return;
    libraryIngestKicked = true;
    rest.post('/api/v1/catalog/library/ingest?pages=8', {}).then(function (s) {
      applyIngestStatus(s);
    }).catch(function () { /* */ });
    refreshIngestStatus();
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
    if (companionMode) {
      bootCompanion();
      return;
    }

    window.AiOnTvKeyMap.registerMediaKeys();

    keyboard = new window.AiOnTvKeyboard('keyboard', updatePreview);
    keyboard.mount();

    document.getElementById('btn_open_chat').addEventListener('click', function () { showScreen('chat'); });
    document.getElementById('btn_profiles').addEventListener('click', function () { showScreen('profiles'); });
    var btnAz = document.getElementById('btn_open_az');
    if (btnAz) btnAz.addEventListener('click', function () { showScreen('az'); });
    var btnCats = document.getElementById('btn_open_categories');
    if (btnCats) btnCats.addEventListener('click', function () { showScreen('categories'); });
    var btnCatHome = document.getElementById('btn_cat_home');
    if (btnCatHome) btnCatHome.addEventListener('click', function () { showScreen('home'); });
    var btnCatAz = document.getElementById('btn_cat_az');
    if (btnCatAz) btnCatAz.addEventListener('click', function () { showScreen('az'); });
    var btnSearchCat = document.getElementById('btn_search_catalog');
    if (btnSearchCat) btnSearchCat.addEventListener('click', function () { showScreen('search'); });
    var btnAzHome = document.getElementById('btn_az_home');
    if (btnAzHome) btnAzHome.addEventListener('click', function () { showScreen('home'); });
    var btnAzSearch = document.getElementById('btn_az_search');
    if (btnAzSearch) btnAzSearch.addEventListener('click', function () { showScreen('search'); });
    var btnSearchHome = document.getElementById('btn_search_home');
    if (btnSearchHome) btnSearchHome.addEventListener('click', function () { showScreen('home'); });
    var btnSearchAz = document.getElementById('btn_search_az');
    if (btnSearchAz) btnSearchAz.addEventListener('click', function () { showScreen('az'); });
    var btnSearchAi = document.getElementById('btn_search_ai');
    if (btnSearchAi) btnSearchAi.addEventListener('click', function () { showScreen('chat'); });
    var btnSearchClear = document.getElementById('btn_search_clear');
    if (btnSearchClear) btnSearchClear.addEventListener('click', function () {
      if (searchKeyboard) searchKeyboard.clear();
      if (window.AiOnTvCatalogBrowse) window.AiOnTvCatalogBrowse.runSearch('', focus);
    });
    var btnRate = document.getElementById('btn_rate');
    if (btnRate) btnRate.addEventListener('click', function () { showScreen('rate'); });
    document.getElementById('btn_back_catalog').addEventListener('click', function () { showScreen('home'); });
    document.getElementById('btn_back_profiles').addEventListener('click', function () {
      if (!tvEntered) showScreen('tv_login');
      else showScreen('home');
    });
    var btnManage = document.getElementById('btn_tv_manage_profiles');
    if (btnManage) {
      btnManage.addEventListener('click', function () { showScreen('profiles'); });
    }
    var btnSaveAv = document.getElementById('btn_save_avatar');
    if (btnSaveAv) {
      btnSaveAv.addEventListener('click', function () { saveActiveAvatar(); });
    }
    var btnBackRate = document.getElementById('btn_back_rate');
    if (btnBackRate) btnBackRate.addEventListener('click', function () { showScreen('home'); });
    document.querySelectorAll('#rate_stars .star-pick').forEach(function (btn) {
      btn.addEventListener('click', function () {
        submitRating(parseInt(btn.getAttribute('data-stars') || '0', 10), '');
      });
    });
    document.getElementById('btn_close_player').addEventListener('click', closePlayer);
    var btnFs = document.getElementById('btn_player_fullscreen');
    if (btnFs) {
      btnFs.addEventListener('click', function () {
        openGamesFullscreen(lastPlayerUrl || '/games/local/snake/');
      });
    }
    document.getElementById('btn_companion_info').addEventListener('click', function () { showCompanionBanner(true); });
    document.getElementById('btn_companion_close').addEventListener('click', function () { showCompanionBanner(false); });

    function onCatalogTileClick(ev) {
      var t = ev.target;
      while (t && t !== document.body) {
        if (t.getAttribute && t.getAttribute('data-action') === 'play-title') {
          focus.focus(t.id);
          var item = t._catalogItem || {};
          var payload = window.AiOnTvCatalogView.resolvePlayPayload
              ? window.AiOnTvCatalogView.resolvePlayPayload(item)
              : {
                appId: t.getAttribute('data-app-id') || '',
                appName: t.getAttribute('data-app-name') || '',
                title: t.getAttribute('data-title') || '',
                posterUrl: item.posterUrl || '',
                url: item.url || t.getAttribute('data-url') || '',
                mediaType: item.mediaType || ''
              };
          if (payload && payload.appName) {
            setStatus((payload.title || '') + ' · ' + payload.appName + (payload.providers && payload.providers.length > 1
                ? ' (OK de novo troca o app)' : ''));
          }
          playPayload(payload);
          return;
        }
        if (t.getAttribute && t.getAttribute('data-action') === 'az-letter') {
          focus.focus(t.id);
          if (window.AiOnTvCatalogBrowse) {
            window.AiOnTvCatalogBrowse.setLetter(t.getAttribute('data-letter') || 'A', focus);
          }
          return;
        }
        if (t.getAttribute && t.getAttribute('data-action') === 'cat-tab') {
          focus.focus(t.id);
          if (window.AiOnTvCatalogBrowse) {
            window.AiOnTvCatalogBrowse.setCategory(t.getAttribute('data-category') || 'movie', focus);
          }
          return;
        }
        t = t.parentElement;
      }
    }
    document.getElementById('rows').addEventListener('click', onCatalogTileClick);
    var azGrid = document.getElementById('az_grid');
    if (azGrid) azGrid.addEventListener('click', onCatalogTileClick);
    var azLetters = document.getElementById('az_letters');
    if (azLetters) azLetters.addEventListener('click', onCatalogTileClick);
    var catGrid = document.getElementById('cat_grid');
    if (catGrid) catGrid.addEventListener('click', onCatalogTileClick);
    var catTabs = document.getElementById('cat_tabs');
    if (catTabs) catTabs.addEventListener('click', onCatalogTileClick);
    var searchGrid = document.getElementById('search_grid');
    if (searchGrid) searchGrid.addEventListener('click', onCatalogTileClick);

    // Ingest só depois da 1ª home (senão compete com TMDB no boot da TV).
    setInterval(refreshIngestStatus, 20000);

    document.getElementById('btn_play_hero').addEventListener('click', function () {
      playPayload(window.AiOnTvCatalogView.currentPlayPayload());
    });
    var btnWatched = document.getElementById('btn_mark_watched');
    if (btnWatched) btnWatched.addEventListener('click', function () { markSelectedWatched(); });
    var btnRateTitle = document.getElementById('btn_rate_title');
    if (btnRateTitle) btnRateTitle.addEventListener('click', function () { openTitleRate(); });
    var btnTitleRateBack = document.getElementById('btn_title_rate_back');
    if (btnTitleRateBack) btnTitleRateBack.addEventListener('click', function () { showScreen('home'); });
    document.getElementById('btn_ask_hero').addEventListener('click', activateFocused);
    document.getElementById('btn_send').addEventListener('click', function () {
      requestAi(keyboard.value);
      keyboard.clear();
    });
    document.getElementById('btn_clear').addEventListener('click', function () { keyboard.clear(); });

    setStatus('Conectando…');
    loadHousehold(false);

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

    document.addEventListener('keydown', onKeyDown, true);

    // Login gate: Quem assiste? (auto Mae na mother-tv)
    var homeEl = document.getElementById('screen_home');
    if (homeEl) { homeEl.classList.add('hidden'); homeEl.hidden = true; }
    startTvLogin().then(function () {
      var login = document.getElementById('screen_tv_login');
      if (login) { login.classList.add('hidden'); login.hidden = true; }
      showScreen('home');
      loadCatalog();
    }).catch(function () {
      showScreen('home');
      loadCatalog();
    });

    var obs = new MutationObserver(function () {
      var el = document.querySelector('.tile.focused');
      if (el) window.AiOnTvCatalogView.onTileFocus(el);
    });
    obs.observe(document.getElementById('rows'), { attributes: true, subtree: true, attributeFilter: ['class'] });

    // Companion (celular) → TV: poll da fila
    companionPollTimer = setInterval(pollCompanionCommands, 1500);
    pollCompanionCommands();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
