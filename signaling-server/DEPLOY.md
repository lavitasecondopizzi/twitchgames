# Deploy su Raspberry Pi / Podman

Il signaling server deve essere raggiungibile pubblicamente tramite **WSS**. Il browser ospitato da GitHub Pages non può collegarsi a un WebSocket non sicuro quando la pagina è HTTPS.

## 1. Preparazione

Sul Raspberry Pi:

```bash
git clone https://github.com/lavitasecondopizzi/twitchgames.git
cd twitchgames/signaling-server
```

Se il repository è privato, usa il metodo GitHub già configurato sul Raspberry Pi per l'accesso al repository.

## 2. Avvio con Podman

```bash
podman compose -f podman-compose.yml up -d --build
```

Verifica:

```bash
podman ps
curl http://127.0.0.1:8787/health
```

La risposta attesa è un JSON con `ok: true`.

## 3. Caddy

Il servizio Node ascolta solo internamente sulla porta 8787. Caddy deve pubblicare un hostname dedicato, per esempio:

```
signal.example.it {
    reverse_proxy 127.0.0.1:8787
}
```

Caddy gestirà HTTPS e il passaggio WebSocket. Il frontend dovrà quindi usare:

```
wss://signal.example.it
```

## 4. Verifica esterna

Prima di modificare la lobby, aprire da due PC/reti diverse:

```
https://<github-pages>/webrtc-test.html
```

Su PC 1:
- room: lo stesso codice di test;
- role: Host;
- signaling: `wss://signal.example.it`.

Su PC 2:
- stesso room;
- role: Guest;
- stesso signaling URL.

Entrambi devono mostrare **WebRTC P2P connesso**.

Dopo la connessione, premendo "Invia messaggio P2P" il messaggio deve comparire sull'altro browser.

## Nota

Il signaling server non è il backend della partita: inoltra soltanto i messaggi necessari a instaurare WebRTC. Lo stato e gli eventi di gioco saranno trasferiti successivamente tramite DataChannel.

Non inserire token Twitch, client secret o altre credenziali nel repository GitHub Pages.
