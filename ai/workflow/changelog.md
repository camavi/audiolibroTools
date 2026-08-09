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
- Aggiunto primo Book Index laterale dell'editor: lista blocchi/capitoli aggiornata da TipTap, evidenza blocco attivo, stato dirty e click per navigare al blocco.
- Migliorato Book Index: gli heading TipTap diventano capitoli numerati, i blocchi successivi vengono indentati sotto il capitolo corrente e il contatore mostra capitoli/blocchi.
- Corretto recupero autosave: la risposta `PATCH` viene normalizzata come il `GET`, i metadata locali ricevono il nuovo `current_version_id` e un `409` da versione stale ricarica i metadata e ritenta una volta il salvataggio locale.
- Avviato Right Workspace dell'editor: rail verticale stile applicazione desktop con tool AI Chat, Comments, Correct, Voices, Audio, Translate, Versions e Settings, piu' pannello contenuto contestuale al blocco selezionato.
- Collegato il tool Versions del Right Workspace: nuovo endpoint API per versioni del blocco selezionato, lista versioni nel pannello, versione corrente evidenziata e test feature dedicato.
- Avviata base dati del tool Correct: tabella `book_block_reviews`, modello Laravel, relazioni, endpoint API read-only per review del blocco selezionato e UI del pannello Correct con empty/loading/error/lista review.
- Reso operativo `Check selected block` nel tool Correct: nuovo endpoint POST crea una review `mock-ai` legata alla versione corrente del blocco, il frontend salva la review e aggiorna la lista senza provider AI esterno.
- Reso idempotente `Check selected block`: se esiste gia' una review `draft` `mock-ai` dello stesso tipo per la stessa versione del blocco, il backend riusa quella esistente invece di creare duplicati.
- Aggiunto workflow Apply/Reject per le correzioni: le review possono essere marcate `applied` o `rejected`, Apply aggiorna il blocco TipTap, forza il salvataggio e collega la review alla versione applicata.
- Aggiunto diff visuale nel tool Correct: ogni review mostra le parole rimosse e aggiunte tra testo originale e suggerito prima di Apply/Reject.
- Avviato layer provider AI: provider predefiniti, provider custom con hosting/modelli, impostazioni per servizio AI e pannello Settings con dialog per aggiungere provider custom.
- Aggiunta gestione API key per provider AI: credential separate e criptate, campo key nel pannello Settings e nel dialog provider custom, risposta API limitata a `has_api_key`.
- Aggiunte impostazioni AI per singolo tool del Right Workspace: ogni box apre il proprio dialog provider/model/key e il backend mantiene setting separati per chat, comments, correction, voices, audio, translate e versions.
- Avviata integrazione provider reale per Correct: nuovo service backend con mock locale, chiamata OpenAI Responses API per provider `openai`, salvataggio metadata provider/model/prompt/response e messaggi JSON 422 per key mancante o provider non implementati.
- Migliorato pannello Correct: mostra provider/model attivo, stato `Checking with ...`, accesso diretto al dialog AI settings quando manca la key e badge provider/model nelle review.
- Aggiunto system prompt per tool AI: bottone nel dialog AI settings, editor dedicato con `_.Textarea`, salvataggio in `ai_service_settings.options_json` e uso del prompt custom nelle chiamate OpenAI di Correct.
- Avviato tool AI Chat: endpoint non persistente per domande su blocco/libro, service backend con mock e OpenAI Responses API, uso del setting/prompt `chat` e pannello destro con textarea, Ask/Clear, errori e risposte in memoria.
- Aggiunta persistenza AI Chat: thread per libro/blocco/versione, messaggi user/assistant con provider/model/metadata, endpoint GET per ricaricare la conversazione e UI Refresh collegata al contesto selezionato.
- Avviato tool Comments: tabella e modello `book_block_comments`, endpoint per leggere/creare/risolvere commenti editoriali legati a blocco e versione corrente, pannello Right Workspace con form e lista open/resolved.
- Avviato tool Voices: profili voce per libro, assegnazioni voce per blocco/versione corrente, API dedicate e pannello Right Workspace per creare personaggi/narratore e assegnare o rimuovere una voce.
- Avviato tool Audio: job e segmenti audio per blocco/versione/voce, generazione mock TTS, API di lista/generate e pannello Right Workspace con provider audio, voce assegnata e lista segmenti.
- Avviato tool Translate: traduzioni draft per blocco/versione sorgente, target locale, provider/model, API read/create/approve-reject e pannello Right Workspace con lingua target e lista traduzioni.
- Aggiunta Bottom Bar operativa e persistenza locale preferenze editor: pannelli laterali, tool destro, formato pagina e lingua target vengono ripristinati da `localStorage`.
- Migliorato pannello Versions: ogni versione mostra activity count per correzioni, commenti, voci, audio, traduzioni e chat AI, con evidenza delle versioni vecchie che hanno link stale.
- Aggiunta diff visuale nel pannello Versions: riuso dell'algoritmo storico `diff_match_patch` come modulo ES, pulsante `View changes` per ogni versione e dialog con parole aggiunte/rimosse.
- Reso operativo Restore nel pannello Versions: il backend crea una nuova versione `restore` copiando una versione precedente e il frontend ricarica TipTap e storico senza perdere la traccia.
- Avviato Explain changes nel pannello Versions: servizio AI dedicato, endpoint per spiegare il confronto tra versioni, salvataggio come activity AI `versions` e card con ultima spiegazione.
- Migliorata usabilita' del pannello Versions: filtri All/Current/Activity/Stale/AI con contatori, ordine newest/oldest e search persistiti nelle preferenze locali.
- Migliorato dialog View changes: selettore della versione da confrontare, split view vecchio/nuovo, toggle only changes e azione `Explain this diff` sul confronto scelto.
- Migliorato tool Comments: filtri Open/Resolved/Stale/All con contatori, preferenza locale del filtro e badge commenti nel Book Index per il blocco selezionato.
- Collegato Versions a Comments: commenti creabili da diff e spiegazioni AI, con supporto backend a `book_block_version_id` per tracciare note su versioni specifiche.
- Aggiunti marker commenti inline nell'editor: il blocco con commenti caricati mostra badge open/stale/resolved, click per aprire Comments e azione per rifocalizzare il blocco dalla lista commenti.
- Aggiunto summary globale dei commenti per libro: endpoint conteggi per blocco, badge su Book Index e marker inline su tutti i blocchi commentati.
- Aggiunti commenti ancorati alla selezione testo: il commento salva l'anchor in `metadata_json` e l'editor mostra highlight visuali tramite ProseMirror decorations.
- Aggiunto riancoraggio visuale dei commenti: gli anchor stale vengono cercati nel testo corrente con `diff_match_patch` e mostrati come highlight riancorati quando ritrovati.
- Aggiunte azioni sui commenti ancorati: click sull'highlight apre Comments, seleziona la card e `Update anchor` conferma il reanchor sulla versione corrente.
