# Audiobook Tools — AI Entry Point

Scopo: punto di ingresso minimo per gli agenti AI che lavorano su Audiobook Tools.
Leggere: sempre, prima di modificare il codice.

## Ordine di lettura

1. Leggi questo file.
2. Leggi [`ai/ai.md`](ai/ai.md): è l'indice della documentazione AI del progetto.
3. Dal suo elenco **Mappa Documenti**, apri solo i documenti pertinenti all'attività.
4. Per la dashboard, leggi sempre anche `resources/js/dashboard.js` e `resources/js/dashboard/newBookStart.js` prima di intervenire.

## Regole non negoziabili

- Non trasformare `ai/ai.md` in un documento monolitico: i dettagli vanno in file dedicati sotto `ai/` e devono essere linkati dall'indice.
- Per la dashboard, CMSwift è il framework ufficiale. Segui le regole e i pattern riportati in `ai/ai.md`.
- Quando lo stato o le decisioni di progetto cambiano, aggiorna la documentazione pertinente indicata in `ai/ai.md`.
