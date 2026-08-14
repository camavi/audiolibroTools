# Audiobook Tool - AI Index

Questo file e' l'indice principale della documentazione di lavoro.
Non deve diventare un file enorme: i dettagli vanno nei file collegati sotto `ai/`.

## Regola

Quando una sezione cresce oltre poche righe, va spostata in un file dedicato e linkata qui.

Per tutta la dashboard, CMSwift e' il framework ufficiale: JS, layout, componenti UI, token CSS e temi devono partire da CMSwift. Nel JS della dashboard usare l'API tramite alias `_.` (`_.Layout`, `_.Icon`, `_.mount`, helper DOM, ecc.). CSS nativo del progetto e' ammesso solo per composizione specifica, branding Audiobook Tools o casi non coperti da CMSwift.

Quando si usa una immagine come reference per la dashboard, copiarne solo la struttura richiesta. Non copiare colori, logo, stile visuale o dettagli grafici se non viene richiesto esplicitamente.

## Regole Dashboard

Prima di lavorare sulla dashboard leggere e seguire come base `resources/js/dashboard.js` e `resources/js/dashboard/newBookStart.js`.

- `resources/js/dashboard.js` deve restare la shell principale: importa `cmswift`, monta `#dashboard-root`, crea `_.Layout`, gestisce drawer, header, outlet e routing con `_.router`.
- Ogni pagina/feature della dashboard va in un file JS dedicato sotto `resources/js/dashboard/` ed esporta una funzione/componente, poi viene importata e registrata nella shell.
- Usare CMSwift tramite alias globale `_` per layout, form, card, dialog, grid, input, select, button, alert, router, mount e stato reattivo con `_.rod`.
- Non creare CSS custom per la dashboard se CMSwift copre il caso. Classi custom o CSS di progetto sono ammessi solo per composizione specifica, branding Audiobook Tools o casi non coperti dai componenti/token CMSwift.
- Per chiamate backend usare `_.http.getJSON`, `_.http.postJSON` e gli helper HTTP CMSwift; evitare `fetch` diretto salvo motivo tecnico documentato nel codice.
- I form devono gestire stato locale con `_.rod`, validazione minima lato client, stato loading/submitting, feedback tramite `_.Alert` e `try/catch/finally`.

## CMSwift: focus e controlli reattivi

Quando lavori con CMSwift, evita che un parent dinamico si sottoscriva ai model dei controlli figli. Non leggere `.value` di un rod/model dentro la stessa funzione dinamica che crea `_.Input`, `_.Textarea`, `_.Select` o altri controlli editabili: a ogni modifica il parent verrebbe ricreato e il controllo perderebbe il focus.

- Mantieni i controlli editabili in un parent stabile e metti l'interfaccia dipendente in piccoli callback dinamici separati.
- Non chiamare side effect (`load...`, `fetch`, `save`) dentro un render dinamico. Se indispensabile per retrocompatibilità, isolarli con `CMSwift.reactive.untracked(() => ...)`.
- Anche l'idratazione iniziale dei model nei componenti CMSwift deve usare `CMSwift.reactive.untracked()`.
- In `FormField`, il calcolo iniziale di `hasValue` non deve sottoscrivere il parent al model; per `Select`, `value: ''` è valido se esiste un'opzione con quel valore.
- Quando correggi focus perso: individua il controllo, verifica se un parent `() => ...` legge lo stesso model, sposta quella lettura in un callback più piccolo e aggiungi un test affinché l'update del model non ricrei il parent.

## Mappa Documenti

- [Overview prodotto](project/overview.md)
- [Architettura tecnica](project/architecture.md)
- [Multilingua](project/multilingual.md)
- [UI, palette e design system](project/ui-design.md)
- [Moduli funzionali](project/modules.md)
- [Timeline sviluppo](workflow/timeline.md)
- [Piano editor blocchi e salvataggio](workflow/editor-block-save-plan.md)
- [Decisioni tecniche](workflow/decisions.md)
- [Registro avanzamento](workflow/changelog.md)
- [Riferimenti vecchio progetto](reference/old-project.md)

## Stato Rapido

- Backend: Laravel 13 creato.
- Frontend: Node/Vite.
- Dashboard: da sviluppare con CMSwift come framework ufficiale.
- Multilingua: configurazione iniziale `en` e `it`, lista locale completa in `config/audiobook.php`.
- Palette globale: `public/assets/css/palette.css`.
- Home: impostata sul mockup base; hero usa solo immagine `public/assets/images/hero-audiobook-tool.png`.
- Immagine hero: file non ancora presente nel workspace.

## Prossima Fase

Prossimo blocco consigliato: definire schema database e dominio Laravel.

File da aggiornare quando si inizia:

- [Timeline sviluppo](workflow/timeline.md)
- [Moduli funzionali](project/modules.md)
- [Decisioni tecniche](workflow/decisions.md)
