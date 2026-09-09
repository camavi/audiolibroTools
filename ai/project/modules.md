# Moduli Funzionali

## 1. Fondazione Progetto

- Creare progetto Laravel.
- Configurare Node tooling.
- Configurare struttura CSS/JS nativa.
- Collegare palette globale.
- Configurare `.env`.
- Configurare database.
- Configurare multilingua.
- Preparare CMSwift dashboard integration.

## 2. Autenticazione e Utenti

- Login/register.
- Recupero password.
- Profilo utente.
- Organizzazioni/team.
- Ruoli e permessi.
- Dashboard post-login CMSwift.

## 3. Libri

- Creazione libro vuoto: primo flusso dashboard avviato.
- Upload libro DOCX/TXT/PDF: anteprima di capitoli/blocchi/parole prima della conferma, poi crea blocchi editor con versione `import`; i titoli Word diventano heading e i PDF devono contenere testo selezionabile (OCR esterno per scansioni). Il re-import confronta i blocchi e permette di selezionare quali modifiche, aggiunte e rimozioni applicare; le rimozioni sono escluse per default. Le modifiche applicate rendono `stale` audio e traduzioni legati alla versione precedente.
- Metadati libro.
- Categorie: tabella, seed e API iniziali avviati.
- Copertina.
- Stato progetto.
- Pubblicazioni versionate: ePub/PDF e audiobook mantengono release indipendenti senza sovrascrivere le versioni precedenti; l'audiobook congela i master Voice/Music/FX e può essere ritirato dal player pubblico senza eliminare i file. La distribuzione pubblica può essere privata, pubblica o protetta da link-invito; espone esclusivamente release online.
- Lista libri.
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
