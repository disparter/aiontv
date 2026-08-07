(function (global) {
  'use strict';

  function showHome(focusManager) {
    var home = document.getElementById('screen_home');
    var chat = document.getElementById('screen_chat');
    home.hidden = false;
    home.classList.remove('hidden');
    chat.hidden = true;
    chat.classList.add('hidden');
    focusManager.setScreen('home');
    focusManager.focus('tile_chat');
  }

  global.AiOnTvHomeScreen = { show: showHome };
})(window);
