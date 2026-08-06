# Registro Avanzamento

## 2026-07-27

- Creata struttura iniziale `ai/`.
- Creato `ai/ai.md`.
- Definita architettura: Laravel backend, Node/CSS/JS nativi frontend, CMSwift per dashboard.
- Inserito supporto multilingua come requisito fondamentale.
- Pianificata palette globale unica.
- Creato scaffold Laravel 13.
- Installate dipendenze Composer.
- Installate dipendenze Node minime.
- Rimosso Tailwind dal setup per rispettare CSS nativo.
- Creata palette globale `public/assets/css/palette.css`.
- Creata home Laravel iniziale con route multilingua `/{locale?}`.
- Creati file lingua iniziali `resources/lang/en/home.php` e `resources/lang/it/home.php`.
- Creata config `config/audiobook.php` con locali e codici TTS iniziali.
- Aggiunta route `/project-plan` per consultare la documentazione via browser.
- Verificati `npm run build` e `php artisan test`.
- Aggiornata home pubblica sul mockup ricevuto: header, hero, CTA, social proof, griglia funzionalita, metriche, testimonial e CTA finale.
- Aggiunto uso Google Material Symbols Rounded per le icone.
- Pulito il hero: rimossa la ricostruzione HTML/CSS del mockup e lasciata solo immagine `public/assets/images/hero-audiobook-tool.png`.
- Riorganizzata documentazione AI: `ai/ai.md` e' ora indice, i dettagli sono in file separati.

## 2026-08-03

- Avviata dashboard CMSwift con prima pagina menu `New book`.
- Aggiunto flusso frontend CMSwift per scelta `Write book` / `Upload book` e form `Write book`.
- Aggiunti backend Laravel, migrazioni, modelli e test per categorie libro e creazione libro vuoto.

## 2026-08-06

- Aggiunto piano operativo `editor-block-save-plan.md` per editor TipTap, blocchi, versioni append-only, autosave e tracking audio/traduzioni.
- Avviato Step 1 editor blocchi: migrazioni `book_blocks` e `book_block_versions`, modelli Laravel e test base relazioni/versione corrente.
- Avviato Step 2 editor blocchi: creato `BookBlockService` con normalizzazione testo, hash contenuto backend, creazione versioni, no-op su contenuto invariato e conflitto `base_version_id`.
- Avviato Step 3 editor API: aggiunti endpoint `GET /dashboard/api/books/{keyBook}/editor` e `PATCH /dashboard/api/books/{keyBook}/blocks` con test per caricamento, salvataggio batch e conflitto `409`.
- Avviato Step 4 TipTap block IDs: aggiunta estensione frontend `blockId`, caricamento documento dal backend, iniezione `block_uuid` nel JSON editor e preparazione estrazione blocchi per autosave.
- Avviato Step 5 autosave: aggiunto debounce frontend, confronto blocchi dirty, salvataggio `PATCH` solo dei blocchi modificati e stato UI `Unsaved/Saving/Saved/Error/Conflict`.
- Avviato Step 6 gestione blocchi rimossi/riordinati: l'autosave invia `deleted_block_uuids`, il backend marca i blocchi come `deleted`, l'editor non li ricarica e il riordino aggiorna `sort_order` senza creare nuove versioni contenuto.
- Corretto autosave TipTap: i nuovi paragrafi ricevono sempre un `blockId`, il documento iniziale non contiene piu' testo demo hardcoded e l'apertura dell'editor non autosalva un documento vuoto.
