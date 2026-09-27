(function initTortelloRoom(global) {
  class RoomClient extends EventTarget {
    constructor(options = {}) {
      super();
      this.room = String(options.room || '').trim().toUpperCase();
      this.role = options.role || 'guest';
      this.nickname = String(options.nickname || '').trim();
      this.signalingUrl = options.signalingUrl || global.TORTELLO_SIGNALING_URL || '';
      this.rtc = null;
    }

    async connect() {
      if (!/^[A-Z0-9]{6}$/.test(this.room)) throw new Error('Codice stanza non valido');
      if (!['host', 'guest'].includes(this.role)) throw new Error('Ruolo stanza non valido');
      if (!this.signalingUrl) throw new Error('Signaling URL non configurato. Imposta window.TORTELLO_SIGNALING_URL.');

      this.rtc = new global.TortelloWebRTC({
        room: this.room, role: this.role, signalingUrl: this.signalingUrl
      });

      ['signaling-open', 'signaling-close', 'connected', 'channel-open',
       'channel-close', 'connection-state', 'error'].forEach((name) => {
        this.rtc.addEventListener(name, (event) => {
          this.dispatchEvent(new CustomEvent(name, { detail: event.detail }));
        });
      });

      this.rtc.addEventListener('message', (event) => {
        this.dispatchEvent(new CustomEvent('message', { detail: event.detail }));
      });

      await this.rtc.connect();

      this.rtc.addEventListener('channel-open', () => {
        this.send('peer_ready', { nickname: this.nickname, role: this.role });
      }, { once: true });

      return this;
    }

    send(type, payload = {}) {
      if (!this.rtc) throw new Error('Room non connessa');
      this.rtc.send(type, payload);
    }

    on(type, callback) {
      const handler = (event) => callback(event.detail, event);
      this.addEventListener(type, handler);
      return () => this.removeEventListener(type, handler);
    }

    close() {
      if (this.rtc) this.rtc.close();
      this.rtc = null;
    }
  }

  global.TortelloRoom = RoomClient;
})(window);
