(function initTortelloProtocol(global) {
  const VERSION = 1;
  const TYPES = Object.freeze({
    HELLO: 'hello', PEER_READY: 'peer_ready', OFFER: 'offer', ANSWER: 'answer',
    ICE: 'ice', PING: 'ping', PONG: 'pong', GAME_START: 'game_start',
    GAME_STATE: 'game_state', GAME_EVENT: 'game_event', ERROR: 'error'
  });

  function create(type, payload = {}) {
    if (!Object.values(TYPES).includes(type)) throw new Error('Tipo messaggio non supportato: ' + type);
    return { v: VERSION, type, payload, timestamp: Date.now() };
  }

  function encode(message) { return JSON.stringify(message); }

  function decode(raw) {
    const message = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!message || message.v !== VERSION || typeof message.type !== 'string') {
      throw new Error('Messaggio Tortello non valido');
    }
    return message;
  }

  global.TortelloProtocol = Object.freeze({ VERSION, TYPES, create, encode, decode });
})(window);
