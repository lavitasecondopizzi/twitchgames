# Tortello Games · Signaling Server

Servizio minimale per instaurare connessioni WebRTC tra due browser.

## Funzione

Gestisce esclusivamente il signaling:
- inoltra offer/answer WebRTC;
- inoltra gli ICE candidate;
- permette al massimo un host e un guest per codice;
- non salva lo stato della partita;
- non contiene credenziali Twitch.

Dopo l'apertura del DataChannel, i dati della partita passano direttamente tra i due browser.

## Requisiti

- Node.js 20+
- npm

## Avvio locale

```bash
npm install
npm start
```

Porta predefinita: 8787.

Health check: GET /health

## Produzione

Il servizio deve essere esposto tramite HTTPS/WSS pubblico, per esempio:

```
wss://signal.example.com
```

Nel frontend:

```html
<script>
  window.TORTELLO_SIGNALING_URL = 'wss://signal.example.com';
</script>
<script src="./shared/protocol.js"></script>
<script src="./shared/webrtc-client.js"></script>
<script src="./shared/room-client.js"></script>
```

Non inserire nel frontend token o secret Twitch.

## Limite attuale

Il signaling non verifica ancora l'esistenza della stanza nella lobby. L'integrazione con la lobby verrà fatta nel passaggio successivo.
