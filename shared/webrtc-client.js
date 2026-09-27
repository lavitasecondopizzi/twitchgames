(function initTortelloWebRTC(global) {
  const Protocol = global.TortelloProtocol;

  class WebRTCClient extends EventTarget {
    constructor(options = {}) {
      super();
      this.role = options.role || 'guest';
      this.room = options.room || '';
      this.signalingUrl = options.signalingUrl || '';
      this.iceServers = options.iceServers || [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ];
      this.socket = null;
      this.peer = null;
      this.channel = null;
      this.connected = false;
      this.closed = false;
    }

    async connect() {
      if (!this.room) throw new Error('Room code mancante');
      if (!this.signalingUrl) throw new Error('Signaling URL mancante');
      this.closed = false;
      await this.connectSignaling();
      this.peer = this.createPeer();
      this.sendSignal('hello', { room: this.room, role: this.role });
      if (this.role === 'host') await this.createOffer();
      return this;
    }

    connectSignaling() {
      return new Promise((resolve, reject) => {
        const url = new URL(this.signalingUrl);
        url.searchParams.set('room', this.room);
        url.searchParams.set('role', this.role);
        const socket = new WebSocket(url);
        let settled = false;

        const fail = (error) => {
          if (!settled) { settled = true; reject(error); }
          this.dispatchEvent(new CustomEvent('error', { detail: error }));
        };

        socket.addEventListener('open', () => {
          this.socket = socket;
          if (!settled) { settled = true; resolve(); }
          this.dispatchEvent(new Event('signaling-open'));
        });
        socket.addEventListener('message', (event) => {
          this.handleSignal(event.data).catch(fail);
        });
        socket.addEventListener('close', () => {
          this.socket = null;
          if (!this.closed) this.dispatchEvent(new Event('signaling-close'));
        });
        socket.addEventListener('error', () => fail(new Error('Connessione al signaling server fallita')));
      });
    }

    createPeer() {
      const peer = new RTCPeerConnection({ iceServers: this.iceServers });
      peer.addEventListener('icecandidate', (event) => {
        if (event.candidate) this.sendSignal('ice', { candidate: event.candidate });
      });
      peer.addEventListener('connectionstatechange', () => {
        const state = peer.connectionState;
        if (state === 'connected') {
          this.connected = true;
          this.dispatchEvent(new Event('connected'));
        }
        if (['failed', 'disconnected', 'closed'].includes(state)) {
          this.connected = false;
          this.dispatchEvent(new CustomEvent('connection-state', { detail: state }));
        }
      });
      peer.addEventListener('datachannel', (event) => this.attachChannel(event.channel));
      return peer;
    }

    attachChannel(channel) {
      this.channel = channel;
      channel.addEventListener('open', () => {
        this.connected = true;
        this.dispatchEvent(new Event('channel-open'));
      });
      channel.addEventListener('close', () => {
        this.connected = false;
        this.dispatchEvent(new Event('channel-close'));
      });
      channel.addEventListener('message', (event) => {
        try {
          this.dispatchEvent(new CustomEvent('message', {
            detail: Protocol.decode(event.data)
          }));
        } catch (error) {
          this.dispatchEvent(new CustomEvent('error', { detail: error }));
        }
      });
    }

    async createOffer() {
      const channel = this.peer.createDataChannel('tortello');
      this.attachChannel(channel);
      const offer = await this.peer.createOffer();
      await this.peer.setLocalDescription(offer);
      this.sendSignal('offer', { description: this.peer.localDescription });
    }

    async handleSignal(raw) {
      const message = Protocol.decode(raw);
      switch (message.type) {
        case Protocol.TYPES.OFFER:
          await this.handleOffer(message.payload.description);
          break;
        case Protocol.TYPES.ANSWER:
          await this.handleAnswer(message.payload.description);
          break;
        case Protocol.TYPES.ICE:
          if (message.payload.candidate && this.peer) {
            try { await this.peer.addIceCandidate(message.payload.candidate); }
            catch (error) { this.dispatchEvent(new CustomEvent('error', { detail: error })); }
          }
          break;
        case Protocol.TYPES.PING:
          this.sendSignal('pong');
          break;
      }
    }

    async handleOffer(description) {
      if (!this.peer) this.peer = this.createPeer();
      await this.peer.setRemoteDescription(description);
      const answer = await this.peer.createAnswer();
      await this.peer.setLocalDescription(answer);
      this.sendSignal('answer', { description: this.peer.localDescription });
    }

    async handleAnswer(description) {
      if (!this.peer) throw new Error('PeerConnection non inizializzato');
      await this.peer.setRemoteDescription(description);
    }

    sendSignal(type, payload = {}) {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        throw new Error('Signaling non connesso');
      }
      this.socket.send(Protocol.encode(Protocol.create(type, payload)));
    }

    send(type, payload = {}) {
      if (!this.channel || this.channel.readyState !== 'open') {
        throw new Error('Canale WebRTC non connesso');
      }
      this.channel.send(Protocol.encode(Protocol.create(type, payload)));
    }

    close() {
      this.closed = true;
      this.connected = false;
      if (this.channel) this.channel.close();
      if (this.peer) this.peer.close();
      if (this.socket) this.socket.close();
      this.channel = null;
      this.peer = null;
      this.socket = null;
    }
  }

  global.TortelloWebRTC = WebRTCClient;
})(window);
