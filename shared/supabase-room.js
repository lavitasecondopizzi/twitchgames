(function initTortelloSupabaseRoom(global) {
  const config = global.TORTELLO_SUPABASE;
  if (!config?.url || !config?.publishableKey) {
    throw new Error('Configurazione Supabase mancante.');
  }

  const { createClient } = global.supabase;
  const supabase = createClient(config.url, config.publishableKey);

  class SupabaseRoom extends EventTarget {
    constructor(options = {}) {
      super();
      this.room = String(options.room || '').trim().toUpperCase();
      this.role = options.role || 'guest';
      this.nickname = String(options.nickname || '').trim();
      this.game = options.game || null;
      this.config = options.gameConfig || {};
      this.channel = null;
      this.connected = false;
    }

    async connect() {
      if (!/^[A-Z0-9]{6}$/.test(this.room)) {
        throw new Error('Codice stanza non valido.');
      }
      if (!['host', 'guest', 'master'].includes(this.role)) {
        throw new Error('Ruolo stanza non valido.');
      }

      this.channel = supabase.channel('tortello-room:' + this.room, {
        config: {
          broadcast: { self: false },
          presence: { key: this.role + ':' + crypto.randomUUID() }
        }
      });

      this.channel
        .on('broadcast', { event: 'room_info' }, ({ payload }) => {
          this.dispatchEvent(new CustomEvent('room-info', { detail: payload }));
        })
        .on('broadcast', { event: 'game_start' }, ({ payload }) => {
          this.dispatchEvent(new CustomEvent('game-start', { detail: payload }));
        })
        .on('broadcast', { event: 'game_event' }, ({ payload }) => {
          this.dispatchEvent(new CustomEvent('game-event', { detail: payload }));
        })
        .on('broadcast', { event: 'game_state' }, ({ payload }) => {
          this.dispatchEvent(new CustomEvent('game-state', { detail: payload }));
        })
        .on('broadcast', { event: 'state_request' }, ({ payload }) => {
          this.dispatchEvent(new CustomEvent('state-request', { detail: payload }));
        })
        .on('broadcast', { event: 'guest_identity_request' }, ({ payload }) => {
          this.dispatchEvent(new CustomEvent('guest_identity_request', { detail: payload }));
        })
        .on('broadcast', { event: 'guest_identity' }, ({ payload }) => {
          this.dispatchEvent(new CustomEvent('guest_identity', { detail: payload }));
        })
        .on('presence', { event: 'sync' }, () => {
          this.dispatchEvent(new CustomEvent('presence', {
            detail: this.channel.presenceState()
          }));
        })
        .on('presence', { event: 'join' }, () => {
          this.dispatchEvent(new CustomEvent('presence', {
            detail: this.channel.presenceState()
          }));
        })
        .on('presence', { event: 'leave' }, () => {
          this.dispatchEvent(new CustomEvent('presence', {
            detail: this.channel.presenceState()
          }));
        });

      await new Promise((resolve, reject) => {
        this.channel.subscribe(async (status, error) => {
          if (status === 'SUBSCRIBED') {
            try {
              await this.channel.track({
                role: this.role,
                nickname: this.nickname,
                game: this.game,
                joinedAt: Date.now()
              });
              this.connected = true;
              this.dispatchEvent(new Event('connected'));
              resolve();
            } catch (trackError) {
              reject(trackError);
            }
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(error || new Error('Connessione realtime Supabase fallita.'));
          }
        });
      });

      return this;
    }

    presenceState() {
      return this.channel?.presenceState() || {};
    }

    hasGuest() {
      return Object.values(this.presenceState())
        .flat()
        .some((entry) => entry.role === 'guest');
    }

    getGuest() {
      return Object.values(this.presenceState())
        .flat()
        .find((entry) => entry.role === 'guest') || null;
    }

    async sendRoomInfo() {
      return this.broadcast('room_info', {
        game: this.game,
        gameConfig: this.config,
        hostNickname: this.nickname
      });
    }

    async startGame() {
      return this.broadcast('game_start', {
        game: this.game,
        gameConfig: this.config,
        startedAt: Date.now()
      });
    }

    async broadcast(event, payload = {}) {
      if (!this.channel || !this.connected) {
        throw new Error('Stanza Supabase non connessa.');
      }
      return this.channel.send({
        type: 'broadcast',
        event,
        payload
      });
    }

    on(type, callback) {
      const handler = (event) => callback(event.detail, event);
      this.addEventListener(type, handler);
      return () => this.removeEventListener(type, handler);
    }

    async close() {
      if (!this.channel) return;
      try { await this.channel.untrack(); } catch (_) {}
      await supabase.removeChannel(this.channel);
      this.channel = null;
      this.connected = false;
    }
  }

  global.TortelloSupabaseRoom = SupabaseRoom;
  global.TortelloSupabase = supabase;
})(window);
