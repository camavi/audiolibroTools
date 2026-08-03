# Audiobook Tool - AI Index

Questo file e' l'indice principale della documentazione di lavoro.
Non deve diventare un file enorme: i dettagli vanno nei file collegati sotto `ai/`.

## Regola

Quando una sezione cresce oltre poche righe, va spostata in un file dedicato e linkata qui.

Per tutta la dashboard, CMSwift e' il framework ufficiale: JS, layout, componenti UI, token CSS e temi devono partire da CMSwift. Nel JS della dashboard usare l'API tramite alias `_.` (`_.Layout`, `_.Icon`, `_.mount`, helper DOM, ecc.). CSS nativo del progetto e' ammesso solo per composizione specifica, branding Audiobook Tools o casi non coperti da CMSwift.

Quando si usa una immagine come reference per la dashboard, copiarne solo la struttura richiesta. Non copiare colori, logo, stile visuale o dettagli grafici se non viene richiesto esplicitamente.

## Mappa Documenti

- [Overview prodotto](project/overview.md)
- [Architettura tecnica](project/architecture.md)
- [Multilingua](project/multilingual.md)
- [UI, palette e design system](project/ui-design.md)
- [Moduli funzionali](project/modules.md)
- [Timeline sviluppo](workflow/timeline.md)
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
