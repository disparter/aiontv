(function (global) {
  'use strict';

  var state = {
    home: null,
    hero: null,
    selected: null,
    rowOffsets: {}
  };

  function absUrl(path) {
    if (!path) return '';
    if (path.indexOf('http') === 0) return path;
    var base = (global.AiOnTvConfig && global.AiOnTvConfig.apiBase) || '';
    return base.replace(/\/$/, '') + path;
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
    overview.textContent = item.overview || item.subtitle || '';
    eyebrow.textContent = (item.appName ? item.appName + ' · ' : '') + (item.year || 'Em alta');
    var bg = absUrl(item.backdropUrl || item.posterUrl);
    if (bg) {
      heroEl.style.backgroundImage = 'linear-gradient(90deg, rgba(7,11,20,.92), rgba(7,11,20,.2)), url("' + bg + '")';
    }
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
        btn.setAttribute('data-item-id', item.id || '');
        btn._catalogItem = item;

        var img = document.createElement('img');
        img.className = 'tile-poster';
        img.alt = item.title || '';
        img.src = absUrl(item.posterUrl);
        img.loading = 'lazy';
        btn.appendChild(img);

        var meta = document.createElement('div');
        meta.className = 'tile-meta';
        meta.innerHTML = '<div class="tile-title"></div><div class="tile-sub"></div>';
        meta.querySelector('.tile-title').textContent = item.title || '';
        meta.querySelector('.tile-sub').textContent = item.appName || item.subtitle || '';
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
    var item = state.selected || state.hero;
    if (!item) return null;
    return {
      appId: item.appId || '',
      appName: item.appName || '',
      title: item.title || ''
    };
  }

  global.AiOnTvCatalogView = {
    render: render,
    setHero: setHero,
    onTileFocus: onTileFocus,
    currentPlayPayload: currentPlayPayload,
    absUrl: absUrl,
    getState: function () { return state; }
  };
})(window);
