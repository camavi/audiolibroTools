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
