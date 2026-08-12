(function (global) {
  'use strict';

  var az = {
    letter: 'A',
    offset: 0,
    limit: 60,
    items: [],
    librarySize: 0,
    loading: false,
    hasMore: false
  };

  var search = {
    q: '',
    items: [],
    timer: null,
    librarySize: 0,
    inLibrary: 0,
    elsewhere: 0
  };

  function absUrl(path) {
    return global.AiOnTvCatalogView && global.AiOnTvCatalogView.absUrl
        ? global.AiOnTvCatalogView.absUrl(path)
        : (path || '');
  }

  function rest() {
    return global.__aionRest;
  }

  function setAzStatus(text) {
    var el = document.getElementById('az_status');
    if (el) el.textContent = text || '';
  }

  function setSearchStatus(text) {
    var el = document.getElementById('search_status');
    if (el) el.textContent = text || '';
  }

  function renderLetterBar(focus) {
    var bar = document.getElementById('az_letters');
    if (!bar) return;
    bar.innerHTML = '';
    var letters = ['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
      'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '*'];
    for (var i = 0; i < letters.length; i++) {
      var L = letters[i];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'az-letter' + (L === az.letter ? ' active' : '');
      b.id = 'az_letter_' + (L === '*' ? 'all' : (L === '#' ? 'num' : L));
      b.setAttribute('data-focusable', 'true');
      b.setAttribute('data-action', 'az-letter');
      b.setAttribute('data-letter', L);
      // "#" sozinho parece lixo/número cortado no Tizen; "Tudo" precisa largura extra
      if (L === '*') {
        b.textContent = 'Tudo';
        b.classList.add('wide');
      } else if (L === '#') {
        b.textContent = '0–9';
        b.classList.add('wide');
      } else {
        b.textContent = L;
      }
      bar.appendChild(b);
    }
  }

  function appendMoreTile(grid, id, action) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tile az-tile tile-more';
    btn.id = id;
    btn.setAttribute('data-focusable', 'true');
    btn.setAttribute('data-action', action);
    btn.setAttribute('aria-label', 'Carregar mais títulos');
    btn.innerHTML = '<div class="tile-more-inner">'
        + '<span class="tile-more-plus">+</span>'
        + '<span class="tile-more-label">Mais</span>'
        + '</div>';
    grid.appendChild(btn);
    return btn;
  }

  function renderAzGrid(focus) {
    var grid = document.getElementById('az_grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (var i = 0; i < az.items.length; i++) {
      (function (item, idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tile az-tile';
        btn.id = 'az_tile_' + idx;
        btn.setAttribute('data-focusable', 'true');
        btn.setAttribute('data-action', 'play-title');
        btn._catalogItem = item;
        var img = document.createElement('img');
        img.className = 'tile-poster';
        img.alt = item.title || '';
        img.loading = 'lazy';
        img.src = absUrl(item.posterUrl);
        var meta = document.createElement('div');
        meta.className = 'tile-meta';
        meta.innerHTML = '<div class="tile-title"></div><div class="tile-sub"></div>';
        meta.querySelector('.tile-title').textContent = item.title || '';
        meta.querySelector('.tile-sub').textContent = item.subtitle || item.appName || '';
        btn.appendChild(img);
        btn.appendChild(meta);
        grid.appendChild(btn);
      })(az.items[i], i);
    }
    if (az.hasMore && az.items.length) {
      appendMoreTile(grid, 'az_tile_more', 'az-more');
    }
    if (!az.items.length) {
      if (!az.librarySize) {
        setAzStatus('Biblioteca vazia — ingestão TMDB ainda rodando (aguarde)');
      } else {
        setAzStatus('Nenhum título em "' + (az.letter || '*') + '" · biblioteca ' + az.librarySize);
      }
      return;
    }
    setAzStatus((az.letter || '*') + ' · ' + az.items.length + ' títulos'
        + (az.librarySize ? (' · biblioteca ' + az.librarySize) : '')
        + (az.hasMore ? ' · fim da lista = Mais' : ''));
  }

  function loadAz(letter, reset, focus) {
    if (az.loading) return Promise.resolve();
    if (letter) az.letter = letter;
    if (reset) az.offset = 0;
    az.loading = true;
    setAzStatus('Carregando…');
    var path = '/api/v1/catalog/az?limit=' + az.limit
        + '&offset=' + az.offset
        + '&letter=' + encodeURIComponent(az.letter === '*' ? '' : az.letter);
    return rest().get(path).then(function (res) {
      az.loading = false;
      az.items = (res && res.items) || [];
      az.librarySize = (res && res.librarySize) || 0;
      az.hasMore = az.items.length >= az.limit;
      az.offset = az.items.length;
      renderLetterBar(focus);
      renderAzGrid(focus);
      if (focus && az.items.length) focus.focus('az_tile_0');
      else if (focus) focus.focus('az_letter_' + (az.letter === '*' ? 'all' : (az.letter === '#' ? 'num' : az.letter)));
    }).catch(function (e) {
      az.loading = false;
      setAzStatus('Falha A-Z: ' + (e.message || e));
    });
  }

  function loadMoreAz(focus) {
    if (az.loading || !az.hasMore) return;
    az.loading = true;
    setAzStatus('Mais títulos…');
    var nextOffset = az.items.length;
    var path = '/api/v1/catalog/az?limit=' + az.limit
        + '&offset=' + nextOffset
        + '&letter=' + encodeURIComponent(az.letter === '*' ? '' : az.letter);
    rest().get(path).then(function (res) {
      az.loading = false;
      var more = (res && res.items) || [];
      az.librarySize = (res && res.librarySize) || az.librarySize;
      if (!more.length) {
        az.hasMore = false;
        renderAzGrid(focus);
        setAzStatus('Fim da lista · biblioteca ' + az.librarySize);
        if (focus && az.items.length) focus.focus('az_tile_' + (az.items.length - 1));
        return;
      }
      var start = az.items.length;
      az.items = az.items.concat(more);
      az.hasMore = more.length >= az.limit;
      az.offset = az.items.length;
      renderAzGrid(focus);
      if (focus) {
        focus.focus('az_tile_' + start);
        var el = document.getElementById('az_tile_' + start);
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }).catch(function () {
      az.loading = false;
    });
  }

  function accessBadge(item) {
    var a = item && item.access;
    if (a === 'library') return { cls: 'access-library', text: 'Na sua lib' };
    if (a === 'owned') return { cls: 'access-owned', text: 'Na assinatura' };
    if (a === 'subscribe') return { cls: 'access-subscribe', text: 'Assinar' };
    if (a === 'rent') return { cls: 'access-rent', text: 'Alugar' };
    if (a === 'buy') return { cls: 'access-buy', text: 'Comprar' };
    if (a === 'none') return { cls: 'access-none', text: 'Sem oferta' };
    return null;
  }

  function renderSearchResults(focus) {
    var grid = document.getElementById('search_grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (var i = 0; i < search.items.length; i++) {
      (function (item, idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tile az-tile';
        btn.id = 'search_tile_' + idx;
        btn.setAttribute('data-focusable', 'true');
        btn.setAttribute('data-action', 'play-title');
        btn._catalogItem = item;
        var img = document.createElement('img');
        img.className = 'tile-poster';
        img.alt = item.title || '';
        img.loading = 'lazy';
        img.src = absUrl(item.posterUrl);
        btn.appendChild(img);
        var badge = accessBadge(item);
        if (badge) {
          var tag = document.createElement('span');
          tag.className = 'tile-access ' + badge.cls;
          tag.textContent = badge.text;
          btn.appendChild(tag);
        }
        var meta = document.createElement('div');
        meta.className = 'tile-meta';
        meta.innerHTML = '<div class="tile-title"></div><div class="tile-sub"></div>';
        meta.querySelector('.tile-title').textContent = item.title || '';
        meta.querySelector('.tile-sub').textContent = item.subtitle || item.appName || '';
        btn.appendChild(meta);
        grid.appendChild(btn);
      })(search.items[i], i);
    }
    if (!search.q) {
      setSearchStatus('Digite p/ buscar · sua lib + onde assinar/alugar/comprar');
      return;
    }
    if (!search.items.length) {
      if (!search.librarySize) {
        setSearchStatus('Biblioteca vazia — aguardando ingestão TMDB');
      } else {
        setSearchStatus('Sem resultados para "' + search.q + '" · lib ' + search.librarySize
            + ' · tente outro termo');
      }
      return;
    }
    var bits = '"' + search.q + '" · ' + search.items.length + ' títulos';
    if (search.inLibrary != null) bits += ' · ' + search.inLibrary + ' na sua lib';
    if (search.elsewhere) bits += ' · ' + search.elsewhere + ' em outros lugares';
    setSearchStatus(bits + ' · OK no teclado foca o 1º');
  }

  function runSearch(q, focus, opts) {
    opts = opts || {};
    search.q = q || '';
    var preview = document.getElementById('search_preview');
    if (preview) preview.textContent = search.q || 'Digite ↓';
    if (search.timer) clearTimeout(search.timer);
    if (!search.q || search.q.length < 1) {
      search.items = [];
      renderSearchResults(focus);
      return;
    }
    search.timer = setTimeout(function () {
      rest().get('/api/v1/catalog/library/search?q=' + encodeURIComponent(search.q) + '&limit=48')
          .then(function (res) {
            search.items = (res && res.items) || [];
            search.librarySize = (res && res.librarySize) || 0;
            search.inLibrary = (res && res.inLibrary) || 0;
            search.elsewhere = (res && res.elsewhere) || 0;
            renderSearchResults(focus);
            if (opts.focusFirst && focus && search.items.length) {
              focus.focus('search_tile_0');
            }
          })
          .catch(function (e) {
            setSearchStatus('Busca: ' + (e.message || e));
          });
    }, opts.immediate ? 0 : 220);
  }

  function focusFirstSearchResult(focus) {
    if (!focus || !search.items.length) return false;
    return focus.focus('search_tile_0');
  }

  var cats = {
    id: 'movie',
    offset: 0,
    limit: 48,
    items: [],
    list: [],
    kidsOnly: false,
    loading: false,
    total: 0,
    hasMore: false
  };

  function setCatStatus(text) {
    var el = document.getElementById('cat_status');
    if (el) el.textContent = text || '';
  }

  function catTotalFor(id) {
    for (var i = 0; i < cats.list.length; i++) {
      if (cats.list[i].id === id) return cats.list[i].count || 0;
    }
    return cats.total || 0;
  }

  function renderCatTabs(focus) {
    var bar = document.getElementById('cat_tabs');
    if (!bar) return;
    bar.innerHTML = '';
    for (var i = 0; i < cats.list.length; i++) {
      var c = cats.list[i];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'az-letter cat-tab' + (c.id === cats.id ? ' active' : '');
      b.id = 'cat_tab_' + c.id;
      b.setAttribute('data-focusable', 'true');
      b.setAttribute('data-action', 'cat-tab');
      b.setAttribute('data-category', c.id);
      var label = document.createElement('span');
      label.className = 'cat-tab-label';
      label.textContent = c.title || c.id;
      b.appendChild(label);
      if (c.count != null) {
        var badge = document.createElement('span');
        badge.className = 'cat-tab-count';
        badge.textContent = String(c.count);
        b.appendChild(badge);
      }
      bar.appendChild(b);
    }
  }

  function renderCatGrid(focus) {
    var grid = document.getElementById('cat_grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (var i = 0; i < cats.items.length; i++) {
      (function (item, idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tile az-tile';
        btn.id = 'cat_tile_' + idx;
        btn.setAttribute('data-focusable', 'true');
        btn.setAttribute('data-action', 'play-title');
        btn._catalogItem = item;
        var img = document.createElement('img');
        img.className = 'tile-poster';
        img.alt = item.title || '';
        img.loading = 'lazy';
        img.src = absUrl(item.posterUrl);
        var meta = document.createElement('div');
        meta.className = 'tile-meta';
        meta.innerHTML = '<div class="tile-title"></div><div class="tile-sub"></div>';
        meta.querySelector('.tile-title').textContent = item.title || '';
        meta.querySelector('.tile-sub').textContent = item.subtitle || item.appName || '';
        btn.appendChild(img);
        btn.appendChild(meta);
        grid.appendChild(btn);
      })(cats.items[i], i);
    }
    if (cats.hasMore && cats.items.length) {
      appendMoreTile(grid, 'cat_tile_more', 'cat-more');
    }
    var label = cats.id;
    for (var j = 0; j < cats.list.length; j++) {
      if (cats.list[j].id === cats.id) { label = cats.list[j].title; break; }
    }
    var total = cats.total || catTotalFor(cats.id);
    var shown = cats.items.length;
    var more = cats.hasMore ? ' · fim da lista = Mais' : '';
    setCatStatus((cats.kidsOnly ? 'Infantil · ' : '') + label
        + ' · mostrando ' + shown + ' de ' + total + more);
  }

  function loadCategory(id, reset, focus) {
    if (cats.loading) return Promise.resolve();
    if (id) cats.id = id;
    if (reset) cats.offset = 0;
    cats.loading = true;
    setCatStatus('Carregando…');
    var path = '/api/v1/catalog/category/' + encodeURIComponent(cats.id)
        + '?limit=' + cats.limit + '&offset=' + cats.offset;
    return rest().get(path).then(function (res) {
      cats.loading = false;
      cats.items = (res && res.items) || [];
      cats.kidsOnly = !!(res && res.kidsOnly);
      cats.total = (res && res.total != null) ? res.total : catTotalFor(cats.id);
      cats.hasMore = !!(res && res.hasMore);
      cats.offset = cats.items.length;
      renderCatTabs(focus);
      renderCatGrid(focus);
      if (focus && cats.items.length) {
        focus.focus('cat_tile_0');
        var el = document.getElementById('cat_tile_0');
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } else if (focus) focus.focus('cat_tab_' + cats.id);
    }).catch(function (e) {
      cats.loading = false;
      setCatStatus('Falha: ' + (e.message || e));
    });
  }

  function loadMoreCategory(focus) {
    if (cats.loading || !cats.hasMore) return;
    cats.loading = true;
    var nextOffset = cats.items.length;
    rest().get('/api/v1/catalog/category/' + encodeURIComponent(cats.id)
        + '?limit=' + cats.limit + '&offset=' + nextOffset)
        .then(function (res) {
          cats.loading = false;
          var more = (res && res.items) || [];
          if (!more.length) {
            cats.hasMore = false;
            cats.offset = cats.items.length;
            renderCatGrid(focus);
            setCatStatus('Fim da lista · ' + cats.items.length + ' de ' + (cats.total || cats.items.length));
            if (focus && cats.items.length) focus.focus('cat_tile_' + (cats.items.length - 1));
            return;
          }
          var start = cats.items.length;
          cats.items = cats.items.concat(more);
          cats.total = (res && res.total != null) ? res.total : cats.total;
          cats.hasMore = !!(res && res.hasMore);
          cats.offset = cats.items.length;
          renderCatGrid(focus);
          if (focus) {
            focus.focus('cat_tile_' + start);
            var el = document.getElementById('cat_tile_' + start);
            if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }
        }).catch(function () {
          cats.loading = false;
        });
  }

  function openCategories(focus) {
    return rest().get('/api/v1/catalog/categories').then(function (res) {
      cats.list = (res && res.categories) || [];
      cats.kidsOnly = !!(res && res.kidsOnly);
      if (!cats.list.length) {
        setCatStatus('Nenhuma categoria ainda — aguarde a ingestão');
        return;
      }
      var prefer = cats.kidsOnly ? 'kids' : 'movie';
      var has = cats.list.some(function (c) { return c.id === prefer; });
      cats.id = has ? prefer : cats.list[0].id;
      renderCatTabs(focus);
      return loadCategory(cats.id, true, focus);
    }).catch(function (e) {
      setCatStatus('Categorias: ' + (e.message || e));
    });
  }

  global.AiOnTvCatalogBrowse = {
    openAz: function (focus, letter) {
      renderLetterBar(focus);
      return loadAz(letter || 'A', true, focus);
    },
    setLetter: function (letter, focus) {
      return loadAz(letter, true, focus);
    },
    loadMore: function (focus) { loadMoreAz(focus); },
    openCategories: openCategories,
    setCategory: function (id, focus) { return loadCategory(id, true, focus); },
    loadMoreCategory: loadMoreCategory,
    runSearch: runSearch,
    focusFirstSearchResult: focusFirstSearchResult,
    renderSearchResults: renderSearchResults,
    getAz: function () { return az; },
    getSearch: function () { return search; },
    getCats: function () { return cats; }
  };
})(window);
