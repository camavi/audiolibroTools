# Registro Avanzamento

## 2026-09-18

- Migrata la dashboard da CMSwift a JSswift: dipendenza npm, import JavaScript, configurazione globale, CSS, chunk Vite e riferimenti runtime ora usano `jsswift`/`JSswift`. L'alias `_` e le classi CSS `cms-*` restano compatibili con il framework rinominato.
- Aggiunta Administration → AI pricing: catalogo modificabile e auditato per i costi dei modelli AI, con testo per 1M token input/output, TTS per minuto audio e immagini per generazione. Il catalogo prepara il cost tracking senza ancora alterare il wallet clienti; ogni modello può inoltre essere disabilitato o rimosso dalla lista con conferma.
- Aggiunta Administration → Subscription plans: catalogo iniziale di tre piani mensili modificabili (Starter, Creator e Studio), ciascuno con prezzo, token inclusi, descrizione e stato. I pacchetti token extra restano volutamente fuori da questa prima fase.
- Aggiunta Administration → Token packages: catalogo separato e modificabile dei top-up una tantum, con creazione, stato, modifica e rimozione. Il wallet cliente legge i soli pacchetti attivi; pagamento e accredito token restano disabilitati fino a checkout verificato.
- Avviato Stripe Checkout per i pacchetti token: il wallet apre il checkout solo quando le chiavi server sono configurate; l'accredito è eseguito esclusivamente dal webhook firmato `checkout.session.completed`, con controllo importo/valuta e protezione idempotente contro eventi duplicati.
- Stripe Checkout è messo in sospeso dopo l'implementazione: senza chiavi test e webhook configurati il wallet lo mantiene disabilitato, quindi non genera addebiti né accrediti.
- Aggiunta Administration → Billing con analisi delle vendite token: KPI, filtro periodo, raggruppamento giorno/settimana/mese, trend, pacchetti venduti, funnel checkout e attività recente. Il report resta separato da royalties e payout delle pubblicazioni.
- Aggiunti i comandi locali `billing:seed-demo` e `billing:clear-demo`: popolano e rimuovono in modo isolato i dati demo delle vendite token, senza interferire con account o acquisti reali.

## 2026-09-16

- Rinnovata la pagina Settings: hero con stato delle preferenze locali e dei default AI, navigazione interna e sezioni distinte per Workspace, default dell'editor e configurazione AI. I default dell'editor sono raggruppati per pannello; la ricerca Versions non viene piu' ripristinata, così non nasconde risultati al riavvio. Ogni tool AI ha ora la propria card configurabile e salvabile, senza un selettore che nasconde gli altri default.
- Il pulsante del menu Account nella topbar usa ora una superficie chiara nel tema light, con bordo e icona leggibili; nel tema dark mantiene i token della relativa superficie scura.
- Arricchita la hero del Book panel con indicatori reali di manoscritto, traduzioni completate, timeline audio, release e visibilita'; titolo e descrizione sono ora mostrati nella copertina placeholder senza il marchio ripetuto.
- La libreria Books riepiloga nell'intestazione quanti libri hanno traduzioni completate, senza appesantire le card con lo stato delle singole lingue.
- Le copertine generate nella libreria Books mostrano ora titolo e descrizione al loro interno; rimosso il marchio ripetuto e il duplicato di titolo/descrizione sotto la copertina.
- Le categorie e la data di aggiornamento sono state spostate nel footer delle copertine generate, al posto dell'icona decorativa del libro.
- Anche il conteggio delle release e' stato spostato nel footer della copertina, sotto la data di aggiornamento.
- Riorganizzata la topbar globale della dashboard: `Book panel` viene mostrato accanto al nome del prodotto nelle pagine di un libro, mentre a destra resta un unico menu account con Profile, sottomenu Language e cambio tema. Rimossi dalla barra i selettori separati che duplicavano i controlli di lingua e tema.
- Corretto il playback runtime della timeline: dopo l'evento nativo `ended` di un clip, il transport non invia piu' un secondo `play()` nello scarto di pochi millisecondi rispetto alla durata persistita. Questo evita il riavvio da zero del clip e il taglio percepito alla fine dei segmenti audio.
- La selezione di un gruppo nella timeline ora centra automaticamente nel pannello lettura il paragrafo a cui appartiene; la label del gruppo non viene piu' sovrapposta dall'indicatore percentuale del volume.
- La barra spaziatrice controlla il transport della timeline: avvia la riproduzione oppure la mette in pausa, senza interferire con i campi di testo.
- Aggiunto il ripple move nella timeline: trascinando un clip o gruppo con `Shift` premuto, esso e tutti gli elementi successivi si spostano insieme mantenendo le rispettive distanze.

## 2026-09-12

- Corretto l'editor delle voci progettate nella libreria Audio: il comando Edit riconosce il provider `at-qwen-design`, mostra i prompt, le frasi di riferimento e un player per il sample salvato senza upload file e rigenera ogni sample singolarmente. Il footer salva solo i dettagli della voce. I requisiti di genere (maschile, femminile o neutro) e lingua vengono ora inviati esplicitamente al motore Qwen; le nuove frasi di riferimento predefinite sono localizzate per ogni lingua supportata.
- La timeline non scarica piu' tutte le waveform e tutti i player al caricamento: la waveform viene richiesta solo selezionando un clip o aprendo un gruppo, con al massimo due download simultanei; i player vengono creati quando il playhead raggiunge il relativo audio.
- Il canvas della timeline resta alla larghezza del viewport: la finestra temporale limita la durata disegnata, evitando bitmap enormi e canvas bianchi nei libri molto lunghi.
- Il righello della timeline sceglie ora intervalli in base alla durata e alla larghezza disponibile, con etichette `mm:ss` o `hh:mm:ss`, evitando sovrapposizioni nei libri lunghi.
- Le timeline lunghe aprono una finestra iniziale di circa dieci minuti, anziche' comprimere l'intero libro: zoom e barra di navigazione spostano la finestra lungo la durata completa, e la vista segue il playhead in riproduzione.
- Il Preview player riproduce in sequenza i segmenti Voice gia' presenti nella timeline e non richiede piu' il render del master. L'endpoint `audio-preview` e' ora di sola lettura: puo' restituire una cache gia' valida ma non avvia FFmpeg; il render dei master resta esclusivamente nel comando Publish audiobook.
- Le release audio sono ora renderizzate da un job in background: la dialog torna subito utilizzabile, la lista aggiorna automaticamente lo stato `Queued`/`Building` e mostra la percentuale del render. Il job conserva lo snapshot della timeline e completa o fallisce la release senza bloccare PHP; la notifica e' interna alla lista release, mentre l'invio email richiede un canale mail dedicato e configurato.
- Ogni master WAV di una release pronta puo' ora essere esportato anche in MP3 su richiesta: il primo click apre un dialog con avanzamento, avvia un job separato e conserva l'MP3 nella stessa release; i download successivi riusano il file gia' creato.
- La dialog Generate book audio si chiude appena il batch e' accodato; il comando principale resta disabilitato e mostra `Generating book audio…` fino al termine o annullamento del processo.

## 2026-09-09

- Collegato LM Studio al tool Correct: le correzioni locali usano `chat/completions`, con prompt e metadata coerenti con gli altri provider.
- Allineata la risoluzione dei modelli LM Studio di Correct a Translate e aggiunto logging diagnostico privo di testo del manoscritto per richiesta, modello, endpoint ed eventuali errori del provider locale.
- Aggiunta cancellazione permanente delle review nel tool Correct: ogni correzione ha Delete con dialog di conferma esplicito e API che verifica l'appartenenza al blocco/libro.
- Le correzioni Applied espongono ora `Reset`: con conferma ripristina il testo originale in una nuova versione del blocco, senza eliminare la review applicata e la relativa cronologia.
- Aggiunto Correct all nel Right Workspace: crea progressivamente review grammar per tutti i blocchi salvati, riusa l'idempotenza delle review e mostra avanzamento/errori senza applicare modifiche al manoscritto. Il batch e' ora una catena di job Laravel persistenti: ogni job completa e salva un solo blocco prima di accodare il successivo; continua dopo refresh/chiusura della pagina, blocca i duplicati e il pulsante diventa `View process` finche' e' in coda o in esecuzione.
- Aggiunto il guardiano `corrections:recover-stalled`, pianificato ogni minuto: recupera automaticamente un batch Correct attivo che non salva avanzamenti per sei minuti, ripartendo dall'ultimo blocco persistito. Lo stack `dev.sh` avvia anche lo scheduler Laravel.
- Rafforzata la concorrenza SQLite per i batch AI: WAL, busy timeout e transazioni `IMMEDIATE` serializzano le scritture concorrenti di worker/coda invece di interrompere la correzione con `database is locked`.
- Nel tool Correct il comando globale e' ora il menu JSswift `All operations`: contiene `Correct all`, `Apply all`, `Reject all` e `Delete all`. Le azioni bulk richiedono conferma, agiscono solo sulle bozze della versione corrente e restano bloccate finche' Correct all e' attivo; Apply usa esclusivamente la proposta draft piu' recente per ogni blocco e crea una nuova versione del testo.
- Aggiunta nel footer globale di Correct la navigazione `Previous · posizione · Next`, con la stessa grafica e comportamento della coda Activity. Scorre tra i blocchi che hanno almeno una correzione draft della versione corrente e rimane disponibile mentre il contenuto del pannello scorre.
- Il dialog `View process` permette ora di annullare un batch Correct all con conferma: il job si ferma dopo l'eventuale blocco gia' in corso e conserva le correzioni draft gia' create.
- Gli errori del batch Correct all sono ora persistenti per blocco/versione: `View failed blocks` mostra anteprima e causa, permette di aprire il paragrafo nell'editor e di avviare `Retry failed` solo sui blocchi non riusciti.
- Nel tool Correct dell'editor aggiunto accesso diretto al dialog System prompt: mostra la libreria di prompt salvati, copia il prompt scelto nell'editor modificabile, permette il reset al prompt predefinito e salva l'override per il libro corrente.
- Rafforzate le istruzioni di Correct: system e user prompt richiedono esclusivamente il paragrafo revisionato, vietando commenti, spiegazioni, saluti, etichette, Markdown e richieste di altri testi.
- Il dialog System prompt di Correct permette ora di configurare anche le istruzioni editoriali inviate con il blocco; il contratto di output che impone il solo paragrafo corretto resta fisso lato backend.
- Rinominato il tool editor `Voices` in `Characters` e corretto il falso stato `Unsaved`: il baseline viene ora calcolato dopo la normalizzazione TipTap del documento appena caricato, quindi un blocco non modificato resta subito assegnabile.
- Aggiunto primo rilevamento assistito dei personaggi: riconosce dialoghi con speaker esplicito (`Nome:` e `Nome —`), mostra esempi e blocchi trovati, richiede revisione dell'utente e solo dopo crea i Character e assegna i blocchi alla loro versione salvata. Le attribuzioni narrative ambigue non vengono assegnate automaticamente.
- Rimosse le AI settings dal tool `Characters`: il rilevamento corrente è deterministico e non usa un LLM. Il servizio AI `voices` non viene più esposto nella dashboard; il dialog e i relativi stili condivisi restano disponibili agli strumenti AI che li usano.
- Il dialog di rilevamento Characters permette ora di inserire i caratteri separatori usati nel proprio libro; il backend applica esattamente quelli alla scansione.
- Normalizzato l'import manoscritti DOCX/TXT/PDF: le entità HTML residue dagli export, come `&quot;`, vengono decodificate sia nella review sia nei blocchi salvati.
- Aggiunta gestione sicura dalla libreria Books: delete definitivo con conferma per libri senza release e pausa delle release pubbliche per libri pubblicati; i libri con release non sono eliminabili.
- Rimosso l'accesso alle `Audio AI settings` dal tool Audio: la configurazione mostrata era solo mockup. Le impostazioni AI condivise restano disponibili esclusivamente per gli strumenti che le usano davvero.

## 2026-09-07

- Completato code splitting dashboard/Vite: la shell mantiene JSswift e routing, mentre editor, studio audio e pagine dashboard vengono caricati su richiesta. Il bundle iniziale della dashboard e' sceso a circa 11 kB; il core JSswift condiviso resta separato.
- Avviate le pubblicazioni versionate: ogni release salva lo snapshot dell'edizione e genera PDF/ePub in un percorso dedicato, preservando i file delle release precedenti. Le traduzioni approvate vengono incluse nell'export dell'edizione selezionata; l'audiolibro resta per ora composto dai tre master WAV della timeline.
- Spostato il controllo delle release in un gestore a dialog: mostra data, file, peso e download per ogni versione e permette di ritirare una release dalla disponibilità online senza cancellarne i file. Le versioni audio restano intenzionalmente separate dalle release ePub/PDF.
- Aggiunte release audio versionate: ogni release congela file sorgente, trim, volumi, fade e posizioni della timeline prima del render, così non legge la timeline live. Voice è obbligatoria; Music e FX sono opzionali. Il gestore permette download, retry delle release fallite con dettaglio errore, conferma per il ritiro offline e apertura/copia del link pubblico. Il player pubblico e lo streaming espongono soltanto release `ready` e online.
- Aggiunto delivery pubblico del libro: pagina `/read`, download ePub/PDF e passaggio al player audiobook sono autorizzati solo per release online. Il proprietario configura Private, Public oppure un link-invito segreto dal Distribution hub.
- Avviato workflow di distribuzione per provider: il Distribution hub prepara consegne tracciate scegliendo release ePub/PDF e/o audio online. I canali manuali ricevono uno stato `ready_to_upload`; i canali API entrano in coda in attesa dell'adattatore provider.
- Definita la policy di integrazione Distribution Hub: nessuna password o 2FA del cliente; automazione solo con token revocabile, file feed ufficiale o partnership. Documentata la classificazione operativa iniziale dei principali provider.
- I canali in attesa di partnership sono ora nascosti come dettaglio interno: nel dashboard cliente mostrano soltanto lo stato `Coming soon`.
- Distribution Hub e partnership spostati formalmente all'ultima priorita' del progetto: nessun nuovo connettore o workflow provider viene sviluppato fino a riapertura esplicita.
- Completato l'import manoscritti: upload TXT/PDF, conservazione del file originale, estrazione del testo e creazione di blocchi editor con versione append-only `import`. I PDF scansiti richiedono OCR prima del caricamento.
- Aggiunta revisione pre-import: rilevamento di heading Markdown, capitoli/parti e titoli in maiuscolo, con riepilogo capitoli, blocchi e parole prima della creazione del libro.
- La revisione pre-import consente di riclassificare ogni blocco come titolo di capitolo o paragrafo prima della conferma.
- Aggiunto import DOCX: titoli Word e stili Heading vengono riconosciuti come capitoli nella revisione pre-import.

## 2026-09-01

- Aggiornato `dev.sh`: `./dev.sh` avvia anche il servizio Qwen dal repository operativo fratello `../qwen3-TTS-AT`; il percorso resta configurabile con `QWEN_TTS_DIR`.

## 2026-08-24

- Avviato player preview audiolibro: tre master separati Voice, Music e FX, cache per edizione basata sul fingerprint della timeline e invalidazione automatica alla sua modifica.
- Definiti comportamenti reader: Cover mostra copertina/dettagli; Text segue il transport; Block evidenzia il blocco corrente; Word evidenzia la parola corrente tramite timing TTS.

## 2026-07-27

- Creata struttura iniziale `ai/`.
- Creato `ai/ai.md`.
- Definita architettura: Laravel backend, Node/CSS/JS nativi frontend, JSswift per dashboard.
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

- Avviata dashboard JSswift con prima pagina menu `New book`.
- Aggiunto flusso frontend JSswift per scelta `Write book` / `Upload book` e form `Write book`.
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
- Migliorato pannello Comments come revisione: navigazione Previous/Next, filtro anchor Anchored/Reanchored/Stale e conteggi commenti nella bottom bar.
- Aggiunta queue globale Comments per libro: endpoint API lista commenti, navigazione Previous/Next tra blocchi diversi e sincronizzazione dopo create/resolve/reanchor.
- Avviata queue unificata Activity: nuovo tool nel Right Workspace, endpoint aggregato per commenti/correzioni/traduzioni/audio e apertura rapida del blocco nel tool corretto.
- Corretto layout del pannello Versions nel Right Workspace stretto: filtri su righe leggibili e Order/Search senza sovrapporsi alle card versione.
- Aggiunta navigazione Previous/Next alla queue Activity: item attivo evidenziato, focus automatico del blocco e apertura del tool collegato.
- Spostata la navigazione Activity nel bottom del pannello con layout assoluto e area lista scrollabile, allineata al comportamento di Comments.
- Corretto Previous/Next Activity: naviga e mette a fuoco il blocco restando nel tool Activity; solo il click sulla card apre il tool collegato.
- Aggiunto highlight editor per Activity: il blocco dell'item attivo viene evidenziato nel documento senza interferire con i marker Comments.
- Aggiunte azioni rapide Activity: click sulla card seleziona/focalizza restando in Activity, mentre `Open` apre esplicitamente il tool collegato.
- Migliorata Activity inbox: ogni item ha azioni `Focus` e `Open`, e la bottom bar mostra il contesto dell'activity selezionata.
- Corretto scroll Activity: `Focus` e click sulla card mantengono la posizione della lista, mentre `Previous/Next` continua a centrare l'item attivo.
- Migliorata priorita' Activity: label editoriali piu' chiare, ordinamento deterministico per severita'/blocco/tipo e badge sorgente per ogni item.
- Avviate azioni dirette Activity: gli item `Audio not generated` possono generare audio dalla coda senza aprire il pannello Audio.
- Estese le azioni dirette Activity a draft singoli: correzioni con `Apply/Reject` e traduzioni con `Approve/Reject`, mentre i gruppi multipli restano nel tool dedicato.
- Aggiunte conferme e feedback alle azioni dirette Activity, con messaggi temporanei in card e bottom bar dopo apply/reject/approve/audio.
- Aggiunta preferenza locale `Confirm panel actions`: i pannelli Correct, Translate e Audio possono disattivare le conferme, mentre Activity le mantiene obbligatorie.
- Avviata pagina `/dashboard/setting` con Settings generale JSswift per preferenze editor locali, inclusa `Confirm panel actions`, rimuovendo il toggle temporaneo dal book editor.
- Estesa pagina Settings con preferenze editor locali: visibilita' pannelli, tool destro predefinito, formato pagina, filtri Activity/Comments/Versions e lingua target traduzione.
- Aggiunti AI defaults globali nella pagina Settings e fallback backend: i libri senza override specifico ereditano provider, modello e system prompt globali per servizio.

## 2026-08-22

- Completato hardening dashboard: pagine e API richiedono autenticazione, con test di accesso per guest e utenti autenticati.
- Aggiunti rate limit per login/registrazione e Voice Design Qwen.
- Reso l'avvio del dashboard coerente con `APP_DEBUG`, senza lasciare JSswift in modalita' sviluppo in produzione.
- Aggiunta checklist di deploy, monitoraggio e QA manuale responsive/accessibilita' in `docs/deployment.md`.
- Verificati suite PHP completa e build Vite di produzione.
- Approvata QA manuale responsive e keyboard della dashboard; confermato anche il test reale Qwen contro il taglio dell'ultima parola.
