# Architettura Tecnica

## Backend Laravel

Responsabilita':

- autenticazione e autorizzazioni;
- API JSON;
- modelli e migrazioni database;
- gestione libri e versioni;
- gestione blocchi di testo;
- servizi AI;
- servizi TTS/audio;
- job asincroni e queue;
- notifiche;
- storage file;
- audit log e costi;
- internazionalizzazione lato backend.

Moduli Laravel previsti:

- `Auth`
- `Users`
- `Organizations`
- `Books`
- `BookVersions`
- `TextBlocks`
- `AiPrompts`
- `AiJobs`
- `Translations`
- `AudioVoices`
- `AudioJobs`
- `AudioTimeline`
- `AssetsLibrary`
- `Publishing`
- `BillingWallet`
- `Notifications`
- `Admin`

## Frontend Nativo

Responsabilita':

- sito pubblico multilingua;
- editor e strumenti visuali;
- player audiolibro;
- timeline audio;
- UI ricca e responsive;
- componenti nativi riusabili;
- consumo API Laravel.

Stack frontend:

- Node solo per tooling/build;
- CSS nativo;
- JavaScript nativo;
- nessun framework frontend obbligatorio nella prima fase;
- design token globali in `public/assets/css/palette.css`.

## Dashboard con CMSwift

La dashboard utente loggato deve usare CMSwift per:

- menu area privata;
- layout dashboard;
- componenti gestionali;
- schermate di amministrazione utente;
- integrazione con stato login.

Da progettare:

- confine tra Laravel Auth e CMSwift;
- sessione utente;
- permessi;
- routing dashboard;
- inclusione CSS globale del nuovo progetto senza rompere CMSwift.
