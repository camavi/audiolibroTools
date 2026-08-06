# Editor Blocchi, Versioni e Salvataggio

## Obiettivo

Costruire un editor moderno dove ogni paragrafo/blocco del libro ha identita' stabile, cronologia completa e collegamenti tracciabili verso AI, traduzioni e audio.

Il contenuto non deve dipendere da `md5(text)` come chiave primaria del blocco. Il testo puo' cambiare; l'identita' del blocco deve restare stabile.

## Principi

- Ogni blocco ha un ID stabile generato una sola volta.
- Ogni modifica crea una nuova versione append-only.
- Il blocco corrente punta all'ultima versione attiva.
- Audio, traduzioni e correzioni AI puntano sempre a una versione specifica del blocco.
- Quando il testo cambia, gli output derivati dalla versione precedente diventano `stale`.
- Il database e' la fonte primaria. File JSON e snapshot sono cache/export/debug, non source of truth.
- Il frontend salva solo i blocchi modificati, non tutto il libro a ogni update.

## Modello Dati Target

### `book_blocks`

Rappresenta l'identita' stabile del blocco.

Campi principali:

- `id`
- `book_id`
- `block_uuid`
- `type`: `paragraph`, `heading`, `quote`, `scene_break`, `list_item`
- `sort_order`
- `parent_block_id` opzionale
- `content_json`
- `text_plain`
- `content_hash`
- `current_version_id`
- `status`: `clean`, `dirty`, `deleted`
- `created_at`
- `updated_at`

Note:

- `block_uuid` e' il valore usato anche nel documento TipTap.
- `content_hash` serve a capire se il blocco e' cambiato.
- `sort_order` gestisce riordino e inserimenti.

### `book_block_versions`

Rappresenta la cronologia immutabile del blocco.

Campi principali:

- `id`
- `book_block_id`
- `version_number`
- `source`: `manual`, `import`, `ai`, `translation`, `restore`
- `content_json`
- `text_plain`
- `content_hash`
- `diff_json` opzionale
- `created_by`
- `created_at`

Regola:

- Non si aggiorna mai una versione esistente.
- Ogni salvataggio che cambia hash crea una nuova riga.

### Tabelle Derivate

Le tabelle di AI, traduzioni e audio devono puntare a `book_block_versions`.

Esempi:

- `book_ai_jobs.source_block_id`
- `book_ai_jobs.source_version_id`
- `book_translations.source_block_id`
- `book_translations.source_version_id`
- `book_audio_segments.book_block_id`
- `book_audio_segments.block_version_id`

## Formato Documento TipTap

Ogni nodo salvabile deve avere `blockId`.

Esempio:

```json
{
  "type": "paragraph",
  "attrs": {
    "blockId": "01JABCDE..."
  },
  "content": [
    { "type": "text", "text": "Testo del paragrafo." }
  ]
}
```

Regole:

- Se un blocco nuovo nasce nel frontend, riceve un UUID temporaneo o definitivo.
- Il backend puo' confermare o sostituire l'ID in risposta.
- Split di un paragrafo: il blocco originale mantiene il proprio `blockId`, il nuovo blocco riceve un nuovo `blockId`.
- Merge di due paragrafi: il blocco principale mantiene il proprio `blockId`; il blocco assorbito viene marcato `deleted`.
- Scene break e heading sono blocchi tracciabili come i paragrafi.

## API Target

### Caricamento editor

`GET /dashboard/api/books/{book:key_book}/editor`

Risposta:

```json
{
  "data": {
    "book": {},
    "document": {},
    "blocks": [
      {
        "block_uuid": "01J...",
        "type": "paragraph",
        "sort_order": 1000,
        "current_version_id": 12,
        "content_hash": "sha256..."
      }
    ]
  }
}
```

### Salvataggio blocchi modificati

`PATCH /dashboard/api/books/{book:key_book}/blocks`

Payload:

```json
{
  "blocks": [
    {
      "block_uuid": "01J...",
      "base_version_id": 12,
      "type": "paragraph",
      "sort_order": 1000,
      "content_json": {},
      "text_plain": "Testo modificato",
      "content_hash": "sha256..."
    }
  ],
  "deleted_block_uuids": [],
  "source": "manual"
}
```

Risposte:

- `200`: salvataggio riuscito.
- `409`: conflitto di versione.
- `422`: blocco non valido.

### Snapshot documento

`POST /dashboard/api/books/{book:key_book}/editor-snapshot`

Uso:

- export JSON completo;
- backup;
- debug;
- ricostruzione veloce editor.

Non sostituisce `book_blocks` e `book_block_versions`.

## Strategia Autosave

### Frontend

1. Carica documento e mappa `block_uuid -> content_hash/current_version_id`.
2. A ogni `onUpdate` TipTap, debounce 800-1500 ms.
3. Estrae solo i blocchi del documento.
4. Normalizza testo e JSON.
5. Calcola hash.
6. Invia solo blocchi nuovi/modificati/deleted.
7. Aggiorna la mappa locale con `current_version_id` e `content_hash` ricevuti.

### Backend

Per ogni blocco ricevuto:

1. Trova blocco per `book_id + block_uuid`.
2. Se non esiste, crea `book_blocks`.
3. Se esiste, verifica `base_version_id`.
4. Se hash uguale, non crea versione.
5. Se hash diverso:
   - crea `book_block_versions`;
   - aggiorna `book_blocks.current_version_id`;
   - aggiorna `book_blocks.content_json/text_plain/content_hash`;
   - marca output derivati come `stale`.

## Gestione Conflitti

Il frontend manda sempre `base_version_id`.

Se il backend vede che il blocco ha una versione corrente diversa:

- ritorna `409 Conflict`;
- include blocco corrente del server;
- il frontend mostra stato `Conflict` e impedisce sovrascrittura silenziosa.

Prima implementazione:

- mostra alert;
- blocca autosave per quel blocco;
- lascia refresh manuale.

Implementazione successiva:

- merge assistito o diff visuale.

## Stato Output Derivati

Quando un blocco cambia:

- audio generato su vecchia versione diventa `stale`;
- traduzione generata su vecchia versione diventa `stale`;
- correzione AI su vecchia versione resta storica ma non corrente;
- job in coda sulla vecchia versione puo' essere cancellato o completato come obsoleto.

Stati consigliati:

- `missing`
- `queued`
- `processing`
- `ready`
- `stale`
- `failed`

## Timeline Implementazione

### Step 1 - Schema Base Blocchi

Output:

- migrazione `book_blocks`;
- migrazione `book_block_versions`;
- modelli Laravel;
- relazioni `Book -> blocks`, `BookBlock -> versions`.

Criteri di completamento:

- test migrazioni;
- creazione blocco e versione in test.

### Step 2 - Servizio Dominio

Output:

- servizio `BookBlockService`;
- normalizzazione testo;
- calcolo hash;
- creazione versione;
- rilevamento no-op se hash uguale.

Criteri di completamento:

- test: nuovo blocco;
- test: modifica blocco crea versione;
- test: hash uguale non crea versione.

### Step 3 - API Editor

Output:

- endpoint load editor;
- endpoint patch blocchi;
- validazione payload;
- gestione conflitto `base_version_id`.

Criteri di completamento:

- test feature `GET editor`;
- test feature `PATCH blocks`;
- test feature `409 conflict`.

### Step 4 - TipTap Block IDs

Output:

- estensione TipTap per `blockId`;
- assegnazione ID ai blocchi nuovi;
- estrazione blocchi dal documento;
- mappa locale `block_uuid -> hash/version`.

Criteri di completamento:

- ogni paragrafo ha `blockId`;
- split crea nuovo blocco;
- reload mantiene ID.

### Step 5 - Autosave Blocchi Modificati

Output:

- debounce autosave;
- stato salvataggio UI;
- invio solo blocchi dirty;
- aggiornamento versioni locali dalla risposta.

Criteri di completamento:

- modifica un solo paragrafo salva un solo blocco;
- nessuna versione nuova se contenuto invariato;
- errore backend visibile nella UI.

### Step 6 - Delete, Insert, Reorder

Output:

- gestione blocchi cancellati;
- gestione nuovi blocchi;
- gestione `sort_order`;
- snapshot ordine documento.

Criteri di completamento:

- cancellazione marca blocco `deleted`;
- inserimento crea blocco;
- ordine stabile dopo reload.

### Step 7 - Stale per Audio e Traduzioni

Output:

- tabelle o campi status derivati;
- marking `stale` quando cambia `current_version_id`;
- query "solo mancanti/modificati".

Criteri di completamento:

- audio vecchio resta storico;
- audio corrente risulta stale dopo modifica testo;
- traduzione vecchia risulta stale dopo modifica testo.

### Step 8 - Snapshot JSON

Output:

- generazione snapshot JSON completo;
- salvataggio su storage;
- comando o job di rebuild snapshot.

Criteri di completamento:

- snapshot rigenerabile dal database;
- editor caricabile dal database anche senza snapshot.

## Prima Implementazione Consigliata

Iniziare da Step 1 e Step 2.

Non collegare subito autosave a TipTap finche' il backend non ha:

- schema stabile;
- servizio testato;
- API con conflitti.

Questo evita di creare logica frontend sopra un modello dati ancora fragile.
