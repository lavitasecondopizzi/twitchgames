(function initGameApis(global){
  const API_MAP = {
    impiccato: {
      hangman: 'api.php',
      sync: 'sync.php'
    },
    'indovina-chi': {
      sync: 'sync.php',
      listImages: 'list_images.php',
      vote: 'vote.php'
    },
    'paper-please': {
      sync: 'sync.php'
    }
  };

  function currentGame(){
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  function endpoint(game, key){
    const gameMap = API_MAP[game] || {};
    return gameMap[key] || null;
  }

  function mustEndpoint(game, key){
    const value = endpoint(game, key);
    if (!value) {
      throw new Error(`Endpoint non configurato: game="${game}", key="${key}"`);
    }
    return value;
  }

  global.GameAPIs = {
    map: API_MAP,
    currentGame,
    endpoint,
    mustEndpoint,
    current(key){
      return mustEndpoint(currentGame(), key);
    }
  };
})(window);
