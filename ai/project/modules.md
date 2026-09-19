# Moduli Funzionali

## 1. Fondazione Progetto

- Creare progetto Laravel.
- Configurare Node tooling.
- Configurare struttura CSS/JS nativa.
- Collegare palette globale.
- Configurare `.env`.
- Configurare database.
- Configurare multilingua.
- Preparare integrazione dashboard JSswift.

## 2. Autenticazione e Utenti

- Login/register.
- Recupero password.
- Profilo utente.
- Organizzazioni/team.
- Ruoli e permessi.
- Dashboard post-login JSswift.

## 3. Libri

- Creazione libro vuoto: primo flusso dashboard avviato.
- Upload libro DOCX/TXT/PDF: anteprima di capitoli/blocchi/parole prima della conferma, poi crea blocchi editor con versione `import`; durante upload e analisi la dialog mostra uno stato persistente che chiarisce che il server sta elaborando il manoscritto. Le entità HTML residue degli export (es. `&quot;`) vengono decodificate prima di preview e salvataggio. I titoli Word diventano heading e i PDF devono contenere testo selezionabile (OCR esterno per scansioni). Il re-import confronta i blocchi e permette di selezionare quali modifiche, aggiunte e rimozioni applicare; le rimozioni sono escluse per default. Le modifiche applicate rendono `stale` audio e traduzioni legati alla versione precedente.
- Metadati libro.
- Categorie: tabella, seed e API iniziali avviati.
- Copertina.
- Stato progetto.
- Pubblicazioni versionate: ePub/PDF e audiobook mantengono release indipendenti senza sovrascrivere le versioni precedenti; l'audiobook congela i master Voice/Music/FX e può essere ritirato dal player pubblico senza eliminare i file. La distribuzione pubblica può essere privata, pubblica o protetta da link-invito; espone esclusivamente release online.
- Lista libri: l'intestazione riepiloga i libri con traduzioni complete; le card restano pulite e mostrano i metadati essenziali all'interno della copertina.
- Libreria libri: un libro senza release può essere eliminato definitivamente dopo conferma esplicita, inclusi dati e file specifici. La presenza di qualunque release blocca l'eliminazione; il libro può solo essere messo in pausa, rendendo private e offline le release locali senza cancellarle.
- Pannello libro.

## 4. Editor Testo

- Editor a blocchi.
- Versioni blocco.
- Inserimento blocchi.
- Cancellazione blocchi.
- Cronologia.
- Diff originale/modificato.
- Stato revisione blocco.
- Salvataggio automatico.

## 5. AI

- Prompt di sistema.
- Prompt utente.
- Chat AI per libro.
- Correzione singolo blocco.
- Correzione pagina/gruppo.
- Revisione intero libro.
- Suggerimenti.
- Miglioramento stile.
- Conteggio token e costi.
- Queue job AI.

## 6. Traduzioni

- Selezione lingua destinazione.
- Traduzione blocchi.
- Traduzione libro intero.
- Sincronizzazione solo blocchi modificati.
- Diff tra lingua originale e traduzione.
- Stato completamento per lingua.

## 7. Audiolibro

- Voci disponibili.
- Toni.
- Voce default libro.
- Personaggi: nel tool Characters dell'editor, rilevamento assistito dei dialoghi con speaker esplicito (`Nome:` o `Nome —`), revisione obbligatoria dei candidati e creazione/assegnazione tracciata ai blocchi salvati. Prima della scansione l'utente inserisce i caratteri separatori usati dal proprio libro (per esempio `:`, `—` o `»`). Le attribuzioni narrative ambigue restano da confermare in una fase AI successiva.
- Lingua per voce.
- Marcatori nel testo.
- Generazione singolo blocco.
- Generazione intero libro.
- Generazione solo mancanti/modificati.
- Mappa testo-audio.
- Durate.
- Normalizzazione audio.
- Preview blocco.

## 8. Timeline Audio

- Canali voce.
- Canali musica.
- Canali effetti.
- Posizionamento su timeline.
- Drag/drop.
- Taglio o regolazione asset.
- Volume per canale.
- Equalizzatore non distruttivo a tre bande vocali (180 Hz, 1,2 kHz, 4 kHz) per clip e master di ciascun canale; i parametri vengono congelati nella release e applicati al render WAV con FFmpeg.
- Limiter trasparente dopo il mix dei master per evitare clipping causato da sovrapposizioni o boost EQ.
- Preview sincronizzata.
- Salvataggio metadati.

## 9. Libreria Asset

- Upload immagini.
- Upload audio.
- Copertine.
- Effetti sonori.
- Musica.
- Avatar/personaggi.
- Metadati file.
- Eliminazione sicura.

## 10. Pubblicazione/Esportazione

- Impostazioni pubbliche.
- Contenuti sensibili.
- Categorie pubbliche.
- Preview pubblica.
- Export audio.
- Export ePub.
- Export PDF.
- Pubblicazione privata/pubblica/su invito.

## 11. Admin

- Gestione prompt AI.
- Gestione modelli AI.
- Gestione voci.
- Gestione toni.
- Test audio.
- Job monitor.
- Utenti.
- Costi/consumi.
- Catalogo prezzi AI: pagina amministrativa per modello. Il testo registra USD per 1M token input/output, il TTS USD per minuto audio generato e le immagini USD per immagine generata; il catalogo è separato finché il calcolo dei costi reali non viene collegato ai job.
- Abbonamenti mensili: catalogo amministrativo iniziale di tre piani (`Starter`, `Creator`, `Studio`) con prezzo EUR e token inclusi al mese. Il comando `billing:sync-stripe-subscription-plans` crea nel Sandbox Stripe i prodotti/prezzi mensili e collega gli ID al catalogo locale. Il portale cliente può quindi aprire Stripe Checkout per un primo abbonamento; webhook `customer.subscription.*` sincronizzano stato e periodo, mentre `invoice.paid` conferma il credito mensile idempotente. Cambio piano, disdetta richiesta dal cliente e fatture restano fasi successive.
- Test rinnovo Stripe: i comandi `billing:create-subscription-clock-test` e `billing:advance-stripe-subscription-clock-test {clock_id}` creano un utente locale isolato, Customer Stripe con carta test e Test Clock, quindi avanzano un mese simulato per validare webhook e grant mensile senza aspettare il rinnovo reale.
- Pacchetti token: catalogo amministrativo separato per top-up una tantum, visibile già nel wallet cliente con solo i pacchetti attivi. Stripe Checkout crea l'acquisto; il webhook firmato accredita i token in modo idempotente solo dopo conferma. Richiede chiavi Stripe e configurazione endpoint webhook prima dell'uso reale.
- Billing analytics: Administration → Billing separa le vendite token dai ricavi e payout delle pubblicazioni. Il primo report mostra solo gli acquisti token `paid`, aggregabili per giorno, settimana o mese, insieme a pacchetti, funnel checkout e attività recente.
- Subscription analytics: Administration → Subscription analytics riporta MRR, nuovi e cancellati nel periodo, distribuzione dei piani, stati di rischio (`canceling`/`past_due`) e attività recente. I dati sono locali e leggono il ciclo di vita `account_subscriptions`; non richiedono Stripe attivo.
- Billing alerts: Administration → Billing alerts raccoglie abbonamenti `past_due`, disdette entro sette giorni, checkout token falliti e configurazione Stripe/webhook mancante. Gli alert sono read-only e rimangono utili anche quando Stripe è sospeso.
- Demo Billing locale: `billing:seed-demo` crea utenti e checkout token isolati, marcati dall'indirizzo `demo.billing.*@example.test`; `billing:clear-demo` elimina esclusivamente tali record, compresi saldo e ledger associati.
