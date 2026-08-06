# Timeline Sviluppo

## Fase 0 - Analisi e Impostazione

Stato: completata.

Obiettivi:

- leggere vecchio `info.md`;
- creare cartella `ai`;
- creare indice documentazione;
- importare palette globale;
- definire architettura iniziale;
- preparare piano moduli.

Output:

- `ai/ai.md`;
- `public/assets/css/palette.css`.

## Fase 1 - Scaffold Tecnico

Stato: in corso.

Obiettivi:

- creare progetto Laravel nella cartella nuova;
- configurare struttura frontend nativa;
- configurare routing base;
- configurare multilingua;
- creare layout pubblico iniziale;
- preparare integrazione dashboard CMSwift.

## Fase 2 - Database e Dominio

Stato: in corso.

Obiettivi:

- disegnare schema database;
- creare migrazioni base;
- creare modelli Laravel;
- definire policy e relazioni;
- preparare seed lingue/categorie/prompt base.

## Fase 3 - Dashboard e Libri

Stato: in corso.

Obiettivi:

- dashboard utente CMSwift;
- lista libri;
- creazione libro: primo flusso `New book` / `Write book` avviato;
- upload libro;
- pannello libro;
- metadati e copertina.

## Fase 4 - Editor e Versioni

Stato: in corso.

Obiettivi:

- editor TipTap con blocchi identificabili;
- salvataggio a blocchi modificati;
- indice laterale dei blocchi/capitoli;
- cronologia append-only per blocco;
- diff e conflitti;
- stati revisione;
- tracciamento versioni per AI, traduzione e audio.

Documento operativo:

- [Editor blocchi, versioni e salvataggio](editor-block-save-plan.md)

Timeline operativa:

1. Schema base: `book_blocks`, `book_block_versions`, modelli e relazioni.
2. Servizio dominio: normalizzazione testo, hash, creazione versioni, no-op se hash uguale.
3. API editor: caricamento documento, patch blocchi, gestione conflitti `409`.
4. TipTap block IDs: attributo `blockId`, estrazione blocchi, mappa locale hash/versione.
5. Autosave: debounce, dirty blocks, aggiornamento versioni locali.
6. Operazioni struttura: insert, delete, reorder e snapshot ordine.
7. Stale derivati: audio/traduzioni/AI legati a `source_version_id`.
8. Snapshot JSON: cache/export ricostruibile dal database.

## Fase 5 - AI e Traduzione

Stato: da fare.

Obiettivi:

- prompt;
- provider AI;
- job queue;
- correzione;
- traduzione;
- costi.

## Fase 6 - Audio e Timeline

Stato: da fare.

Obiettivi:

- voci;
- toni;
- personaggi;
- TTS;
- mappa testo/audio;
- timeline;
- player.

## Fase 7 - Pubblicazione

Stato: da fare.

Obiettivi:

- impostazioni pubbliche;
- preview;
- export;
- pubblicazione.

## Fase 8 - Hardening

Stato: da fare.

Obiettivi:

- sicurezza;
- test;
- performance;
- documentazione deploy;
- QA UI responsive;
- controllo accessibilita';
- cleanup tecnico.
