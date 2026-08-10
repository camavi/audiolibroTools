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

## Decisioni da Prendere

- Tipo database primario.
- Strategia auth Laravel + CMSwift.
- Provider AI iniziale.
- Provider TTS iniziale.
- Storage file locale/S3.
- Formato editor blocchi.
- Sistema export ePub/PDF.
