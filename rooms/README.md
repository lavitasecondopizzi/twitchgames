# Room backend

`api.php` gestisce le stanze di Tortello Games.

## Endpoint

- `POST ?action=create` — crea una stanza
- `POST ?action=join` — aggiunge l'ospite
- `GET ?action=state&room=XXXXXX` — legge lo stato pubblico
- `POST ?action=start` — l'host avvia la partita
- `POST ?action=leave` — host o ospite abbandona

Il backend deve essere eseguito su un server PHP reale. GitHub Pages non esegue PHP.

La lobby può essere configurata con `window.TORTELLO_ROOM_API` per indicare l'URL pubblico dell'API.
