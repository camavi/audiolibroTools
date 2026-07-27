# UI, Palette e Design System

La nuova UI deve essere piu' moderna, pulita e visivamente forte rispetto al vecchio sito.

## Principi

- Palette unica globale.
- Componenti coerenti.
- Pochi radius e spaziature controllate.
- Layout densi e ordinati nella dashboard.
- Sezioni pubbliche piu' editoriali e visive.
- Player audio e timeline come elementi centrali del prodotto.
- Evitare CSS duplicato per pagina.
- Creare componenti/utility CSS riusabili.

## File Base

- `public/assets/css/palette.css`: design token globali.
- `resources/css/app.css`: CSS applicativo iniziale compilato da Vite.
- `resources/js/app.js`: JS nativo applicativo iniziale.

## Da Creare

- `public/assets/css/base.css`
- `public/assets/css/layout.css`
- `public/assets/css/components.css`
- `public/assets/css/dashboard.css`
- `public/assets/js/app.js`
- `public/assets/js/api.js`
- `public/assets/js/i18n.js`

## Hero Home

Il hero non deve ricostruire il mockup con HTML/CSS.
Deve usare direttamente:

`public/assets/images/hero-audiobook-tool.png`

Se l'immagine manca, la view mostra un placeholder pulito con il path richiesto.
