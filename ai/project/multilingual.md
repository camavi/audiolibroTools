# Multilingua

Il sistema deve supportare multilingua a tre livelli:

- interfaccia sito/app;
- lingua originale del libro;
- lingue di traduzione e TTS.

## Lingue Iniziali

Derivate dal vecchio progetto:

- `en`: English
- `es`: Spanish
- `fr`: French
- `de`: German
- `it`: Italian
- `pt`: Portuguese
- `pl`: Polish
- `tr`: Turkish
- `ru`: Russian
- `nl`: Dutch
- `cs`: Czech
- `ar`: Arabic
- `zh`: Chinese
- `ja`: Japanese
- `hu`: Hungarian
- `ko`: Korean

## Decisioni Iniziali

- Usare file lingua Laravel in `resources/lang/{locale}`.
- Usare chiavi testuali stabili, non testi hardcoded.
- Salvare lingua principale del libro.
- Salvare lingua di ogni traduzione.
- Salvare lingua TTS per ogni voce/segmento audio.
- Preparare supporto RTL per arabo.
