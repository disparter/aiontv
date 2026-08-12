(function (global) {
  'use strict';

  var state = {
    home: null,
    hero: null,
    selected: null,
    rowOffsets: {},
    providerCycle: {},
    watchedKeys: {},
    ratingStars: {}
  };

  function normalizeTitleKey(title) {
    return String(title || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
  }

  function setWatchMeta(watchedTitles, ratings) {
    state.watchedKeys = {};
    state.ratingStars = {};
    (watchedTitles || []).forEach(function (t) {
      var k = normalizeTitleKey(t);
      if (k) state.watchedKeys[k] = true;
    });
    (ratings || []).forEach(function (r) {
      if (!r || !r.title) return;
      var k = normalizeTitleKey(r.title);
      if (!k) return;
      state.watchedKeys[k] = true;
      if (r.stars != null) state.ratingStars[k] = r.stars;
    });
  }

  function markLocalWatched(title, stars) {
    var k = normalizeTitleKey(title);
    if (!k) return;
    state.watchedKeys[k] = true;
    if (stars != null) state.ratingStars[k] = stars;
    document.querySelectorAll('.tile').forEach(function (btn) {
      var item = btn._catalogItem;
      if (!item || normalizeTitleKey(item.title) !== k) return;
      decorateTile(btn, item);
    });
    if (state.selected && normalizeTitleKey(state.selected.title) === k) {
      setHero(state.selected);
    }
  }

  function decorateTile(btn, item) {
    if (!btn || !item) return;
    btn.querySelectorAll('.tile-badge').forEach(function (b) { b.remove(); });
    var k = normalizeTitleKey(item.title);
    var stars = state.ratingStars[k];
    var watched = !!state.watchedKeys[k] || !!item.watched;
    if (watched) {
      var w = document.createElement('div');
      w.className = 'tile-badge watched';
      w.textContent = 'Já vi';
      btn.appendChild(w);
    }
    if (stars) {
      var s = document.createElement('div');
      s.className = 'tile-badge stars';
      s.textContent = '★'.repeat(Math.max(1, Math.min(5, stars)));
      btn.appendChild(s);
    }
  }

  function absUrl(path) {
    if (!path) return '';
    if (path.indexOf('http') === 0) return path;
    var base = (global.AiOnTvConfig && global.AiOnTvConfig.apiBase) || '';
    return base.replace(/\/$/, '') + path;
  }

  function providerSubtitle(item) {
    if (!item) return '';
    if (item.subtitle) return item.subtitle;
    if (item.appName) return item.appName;
    return '';
  }

  function installedProviders(item) {
    var list = (item && item.providers) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p && p.installed && p.appId) out.push(p);
    }
    return out;
  }

  /** 1º OK = flatrate preferido; 2º OK no mesmo título cicla provider. */
  function resolvePlayPayload(item) {
    if (!item) return null;
    var key = item.id || item.title || '';
    var opts = installedProviders(item);
    var appId = item.appId || '';
    var appName = item.appName || '';
    if (opts.length > 1) {
      var idx = state.providerCycle[key] || 0;
      if (state._lastPlayKey === key) {
        idx = (idx + 1) % opts.length;
      } else {
        idx = 0;
      }
      state.providerCycle[key] = idx;
      state._lastPlayKey = key;
      appId = opts[idx].appId || appId;
      appName = opts[idx].appName || appName;
    } else {
      state._lastPlayKey = key;
    }
    return {
      appId: appId,
      appName: appName,
      title: item.title || '',
      posterUrl: item.posterUrl || '',
      url: item.url || '',
      mediaType: item.mediaType || '',
      providers: item.providers || [],
      originalTitle: item.originalTitle || ''
    };
  }

  function setHero(item) {
    state.hero = item;
    state.selected = item;
    var heroEl = document.getElementById('hero');
    var title = document.getElementById('hero_title');
    var overview = document.getElementById('hero_overview');
    var eyebrow = document.getElementById('hero_eyebrow');
    if (!item) return;
    title.textContent = item.title || '';
    overview.textContent = item.overview || providerSubtitle(item) || '';
    var where = providerSubtitle(item);
    var k = normalizeTitleKey(item.title);
    var stars = state.ratingStars[k];
    var watched = !!state.watchedKeys[k] || !!item.watched;
    var flags = '';
    if (watched) flags += ' · Já vi';
    if (stars) flags += ' · ' + ('★'.repeat(stars));
    eyebrow.textContent = (where ? where + ' · ' : '') + (item.year || 'Catálogo') + flags;
    var bg = absUrl(item.backdropUrl || item.posterUrl);
    if (bg) {
      heroEl.style.backgroundImage = 'linear-gradient(90deg, rgba(7,11,20,.92), rgba(7,11,20,.2)), url("' + bg + '")';
    }
    var btnW = document.getElementById('btn_mark_watched');
    if (btnW) btnW.textContent = watched ? '✓ Já vi' : 'Já vi';
  }

  function scrollTileIntoRow(tile) {
    if (!tile) return;
    var track = tile.parentElement;
    if (!track || !track.classList.contains('row-track')) return;
    var left = tile.offsetLeft - 64;
    track.scrollLeft = Math.max(0, left - 40);
    var rows = document.getElementById('rows');
    var row = track.parentElement;
    if (rows && row) {
      // só scroll interno — nunca cobre o hero
      var target = Math.max(0, row.offsetTop - 8);
      rows.scrollTop = target;
    }
  }

  function render(home, focus) {
    state.home = home;
    var rowsEl = document.getElementById('rows');
    rowsEl.innerHTML = '';
    rowsEl.style.transform = '';

    if (home.hero) setHero(home.hero);
    else if (home.rows && home.rows[0] && home.rows[0].items[0]) setHero(home.rows[0].items[0]);

    var rows = home.rows || [];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var section = document.createElement('div');
      section.className = 'row';
      section.id = row.id || ('row_' + r);

      var h = document.createElement('h2');
      h.className = 'row-title';
      h.textContent = row.title || '';
      section.appendChild(h);

      var track = document.createElement('div');
      track.className = 'row-track';
      track.id = (row.id || ('row_' + r)) + '_track';

      var items = row.items || [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tile';
        btn.id = 'tile_' + r + '_' + i;
        btn.setAttribute('data-focusable', 'true');
        btn.setAttribute('data-action', 'play-title');
        btn.setAttribute('data-app-id', item.appId || '');
        btn.setAttribute('data-app-name', item.appName || '');
        btn.setAttribute('data-title', item.title || '');
        btn.setAttribute('data-url', item.url || '');
        btn.setAttribute('data-item-id', item.id || '');
        btn._catalogItem = item;

        var img = document.createElement('img');
        img.className = 'tile-poster';
        img.alt = item.title || '';
        img.src = absUrl(item.posterUrl);
        img.loading = 'lazy';
        btn.appendChild(img);
        decorateTile(btn, item);

        var meta = document.createElement('div');
        meta.className = 'tile-meta';
        meta.innerHTML = '<div class="tile-title"></div><div class="tile-sub"></div>';
        meta.querySelector('.tile-title').textContent = item.title || '';
        meta.querySelector('.tile-sub').textContent = providerSubtitle(item);
        btn.appendChild(meta);

        track.appendChild(btn);
      }
      section.appendChild(track);
      rowsEl.appendChild(section);
    }

    if (focus) {
      focus.setScreen('home');
      var firstTile = document.querySelector('#rows .tile');
      if (firstTile) focus.focus(firstTile.id);
      else focus.focus('btn_play_hero');
    }
  }

  function onTileFocus(el) {
    if (!el || !el._catalogItem) return;
    setHero(el._catalogItem);
    scrollTileIntoRow(el);
  }

  function currentPlayPayload() {
    return resolvePlayPayload(state.selected || state.hero);
  }

  var baseHomeBeforeSuggest = null;

  function prependSuggestions(title, items, focus) {
    if (!state.home) state.home = { hero: null, rows: [], source: 'suggest', apps: [] };
    if (!baseHomeBeforeSuggest) {
      baseHomeBeforeSuggest = {
        hero: state.home.hero,
        rows: (state.home.rows || []).slice(),
        source: state.home.source,
        apps: state.home.apps
      };
    }
    var rows = (state.home.rows || []).slice();
    rows = rows.filter(function (r) { return r && r.id !== 'row-ai-suggest'; });
    rows.unshift({
      id: 'row-ai-suggest',
      title: title || 'Sugestões JarvisTV · Voltar limpa',
      items: items || []
    });
    state.home = {
      hero: state.home.hero || (items && items[0]) || null,
      rows: rows,
      source: (state.home.source || 'home') + '+suggest',
      apps: state.home.apps || []
    };
    render(state.home, focus);
    if (focus) focus.focus('tile_0_0');
  }

  function hasAiSuggestions() {
    var rows = (state.home && state.home.rows) || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].id === 'row-ai-suggest') return true;
    }
    return false;
  }

  function clearSuggestions(focus) {
    if (!hasAiSuggestions() && !baseHomeBeforeSuggest) return false;
    if (baseHomeBeforeSuggest) {
      state.home = {
        hero: baseHomeBeforeSuggest.hero,
        rows: (baseHomeBeforeSuggest.rows || []).filter(function (r) {
          return !r || r.id !== 'row-ai-suggest';
        }),
        source: baseHomeBeforeSuggest.source || 'home',
        apps: baseHomeBeforeSuggest.apps || []
      };
      baseHomeBeforeSuggest = null;
      render(state.home, focus);
      return true;
    }
    var rows = ((state.home && state.home.rows) || []).filter(function (r) {
      return !r || r.id !== 'row-ai-suggest';
    });
    state.home = {
      hero: state.home && state.home.hero,
      rows: rows,
      source: (state.home && state.home.source) || 'home',
      apps: (state.home && state.home.apps) || []
    };
    render(state.home, focus);
    return true;
  }

  global.AiOnTvCatalogView = {
    render: render,
    setHero: setHero,
    onTileFocus: onTileFocus,
    currentPlayPayload: currentPlayPayload,
    resolvePlayPayload: resolvePlayPayload,
    absUrl: absUrl,
    prependSuggestions: prependSuggestions,
    clearSuggestions: clearSuggestions,
    hasAiSuggestions: hasAiSuggestions,
    setWatchMeta: setWatchMeta,
    markLocalWatched: markLocalWatched,
    selectedItem: function () { return state.selected || state.hero; },
    getState: function () { return state; }
  };
})(window);
