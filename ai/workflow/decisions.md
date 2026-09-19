# Decisioni Tecniche

## Decisioni Iniziali

- I blocchi testo devono avere ID stabili generati dal database, non MD5 del testo.
- La cronologia deve essere normalizzata: `book_blocks` e `book_block_versions`.
- Le elaborazioni lunghe devono usare queue Laravel, non processi shell manuali.
- I job devono avere stati espliciti e log.
- L'audio deve separare testo sorgente, segmento TTS, file generato e posizione timeline.
- La UI deve usare CSS globale e componenti.
- La dashboard deve essere densa e gestionale, non una landing page.
- Tutto il testo visibile deve passare da sistema multilingua.
- `ai/ai.md` deve restare solo indice, non documentazione monolitica.
- Il Settings generale dell'editor deve includere la preferenza `Confirm panel actions`: Activity conferma sempre, mentre i pannelli dedicati possono rendere le conferme opzionali.
- Distribution Hub: AT non raccoglie password, 2FA o sessioni dei portali. Una connessione automatica richiede OAuth/token revocabile, file feed ufficiale oppure una partnership esplicita; per i portali manuali AT prepara il pacchetto e il cliente completa la pubblicazione. Vedi [Policy provider Distribution Hub](distribution-provider-policy.md).
- Il listino costi AI è amministrativo e distinto dal wallet cliente: testo in USD per 1M token input/output, audio in USD per minuto generato, immagini in USD per immagine generata. I valori vengono catalogati per modello ma non modificano ancora gli addebiti in token. Un modello può essere disabilitato nel catalogo oppure rimosso dalla lista; nessuna delle due azioni altera job o impostazioni già salvati.
- La monetizzazione parte da tre piani mensili configurabili (`Starter`, `Creator`, `Studio`) con token inclusi. Il portale cliente può già presentare piano, rinnovo, confronto piani e azioni di cambio/disdetta, ma nessuna azione modifica i dati fino all'attivazione del checkout Stripe per abbonamenti. I token extra restano acquistabili separatamente; rinnovi e allocazione token non sono ancora connessi al catalogo piani.
- I top-up usano un catalogo indipendente di pacchetti token una tantum: l'admin gestisce prezzo, quantità, stato e rimozione; il wallet espone esclusivamente quelli attivi. Nessun token viene accreditato e nessun pagamento viene simulato fino all'integrazione di un provider verificato.
- Stripe è il provider iniziale per i top-up: l'accesso al suo SDK è confinato in `StripeCheckoutService`, per consentire una futura sostituzione. Il ritorno browser non accredita nulla; solo il webhook Stripe firmato, con importo/currency verificati e una riga acquisto bloccata in transazione, crea l'accredito idempotente nel ledger. L'attivazione reale resta sospesa finché non saranno disponibili chiavi test Stripe e un endpoint webhook raggiungibile (o Stripe CLI in locale).
- Le analytics Billing sono amministrative e autonome dalle statistiche di ricavi dei libri: fatturato e token venduti contano esclusivamente `token_purchases` con stato `paid` e `paid_at` nel periodo selezionato; checkout pendenti o falliti sono solo indicatori del funnel.
- Le analytics degli abbonamenti sono distinte dalle vendite token: MRR e distribuzione piani includono gli stati `active` e `canceling`; `past_due` è mostrato come rischio separato e le disdette storiche contano solo lo stato `cancelled` con data di cancellazione nel periodo.

## Decisioni da Prendere

- Tipo database primario.
- Strategia auth Laravel + JSswift.
- Provider AI iniziale.
- Provider TTS iniziale.
- Storage file locale/S3.
- Formato editor blocchi.
- Sistema export ePub/PDF.

## Comunicazione del motore vocale

- La dashboard descrive il TTS come motore vocale interno/AT, senza esporre il provider o il modello sottostante. L'eventuale attribuzione tecnica sara' valutata e pubblicata nella documentazione del sito in una fase successiva, secondo gli obblighi di licenza applicabili.
