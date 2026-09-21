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
- Gli addebiti AI sono amministrativi e usano solo token cliente: testo con token distinti in ingresso e uscita, entrambi espressi per 1K token LLM; audio per minuto generato e immagini per immagine generata. Il wallet è attivo per le copertine GPT (`gpt-image-1` medium 1024×1536, 70 token) e per i batch di traduzione OpenAI gestiti. Le traduzioni salvano nel job lo snapshot delle tariffe input/output configurate dall'admin, prenotano una stima e, dopo la risposta, consumano dai dati `usage` del provider i soli token effettivi, rilasciando la differenza o tutto il residuo in caso di errore. I valori restano modificabili dall'admin per modello; TTS sarà collegato ai job in un passaggio separato. Un modello può essere disabilitato nel catalogo oppure rimosso dalla lista; nessuna delle due azioni altera job o impostazioni già salvati.
- Il calcolatore del catalogo AI è disponibile su ogni singola riga e usa i prezzi EUR e le quantità token dei piani/pacchetti attivi. Per LLM confronta costo fornitore e token cliente per 1K input/output, calcolando per ogni piano/pacchetto il break-even e il margine lordo; per le immagini il costo GPT in EUR per immagine è un input di simulazione, non hardcoded o salvato. Senza un costo fornitore non deve essere chiamato margine o profitto tecnico.
- La monetizzazione parte da tre piani mensili configurabili (`Starter`, `Creator`, `Studio`) con token inclusi. I piani usano un Price Stripe mensile salvato come `stripe_price_id`; il comando esplicito di sync crea i prodotti/prezzi nell’ambiente Stripe configurato. Una variazione locale di prezzo o valuta invalida l’ID e richiede una nuova sincronizzazione, perché i Price Stripe sono immutabili. Prima del cambio piano Stripe produce una preview della fattura; la dialog cliente espone l’importo/credito esatto e passa lo stesso `proration_date` al cambio. Il cambio aggiorna il singolo item con `always_invoice` e `error_if_incomplete`: la differenza prorata viene richiesta subito e la capacità non cambia se l’addebito fallisce. Disdetta e riattivazione impostano `cancel_at_period_end`, così il periodo e i token già concessi non vengono sottratti. Il Customer Portal Stripe espone fatture e metodo di pagamento. I token extra restano acquistabili separatamente.
- I top-up usano un catalogo indipendente di pacchetti token una tantum: l'admin gestisce prezzo, quantità, stato e rimozione; il wallet espone esclusivamente quelli attivi. Nessun token viene accreditato e nessun pagamento viene simulato fino all'integrazione di un provider verificato.
- Stripe è il provider iniziale per i top-up: l'accesso al suo SDK è confinato in `StripeCheckoutService`, per consentire una futura sostituzione. Il ritorno browser non accredita nulla; solo il webhook Stripe firmato, con importo/currency verificati e una riga acquisto bloccata in transazione, crea l'accredito idempotente nel ledger. L'attivazione reale resta sospesa finché non saranno disponibili chiavi test Stripe e un endpoint webhook raggiungibile (o Stripe CLI in locale).
- Le analytics Billing sono amministrative e autonome dalle statistiche di ricavi dei libri: fatturato e token venduti contano esclusivamente `token_purchases` con stato `paid` e `paid_at` nel periodo selezionato; checkout pendenti o falliti sono solo indicatori del funnel.
- Le analytics degli abbonamenti sono distinte dalle vendite token: MRR e distribuzione piani includono gli stati `active` e `canceling`; `past_due` è mostrato come rischio separato e le disdette storiche contano solo lo stato `cancelled` con data di cancellazione nel periodo.
- Gli alert Billing sono una coda amministrativa read-only: segnalano i rischi deducibili dai dati locali e dalla configurazione (pagamenti `past_due`, disdette imminenti, checkout token falliti, chiavi Stripe/webhook mancanti). Gli eventi webhook rifiutati non vengono ancora persistiti: finché Stripe non è attivo, la mancanza del signing secret resta il segnale operativo esplicito.

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
