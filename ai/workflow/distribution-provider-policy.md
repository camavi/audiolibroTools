# Policy Provider Distribution Hub

_Verificata il 2026-09-08. Questa e' una decisione di prodotto e tecnica, non consulenza legale._

## Obiettivo

Audiobook Tools (AT) e' il punto unico in cui l'autore prepara file, metadata, validazioni e stato delle consegne. AT non deve diventare publisher, distributore, merchant of record o destinatario delle royalties del cliente senza un accordo commerciale scritto con il provider che lo preveda.

## Regola di accesso

Una vera azione `Connect` e' ammessa soltanto se il provider offre almeno una delle seguenti strade ufficiali:

1. API documentata con OAuth, API key o token revocabile dell'account del cliente;
2. partnership o programma service-provider/distributor scritto;
3. file feed ufficiale, attivato dal provider per il cliente o per AT.

Non chiedere, non salvare e non usare mai password del portale, codici 2FA, cookie di sessione o credenziali del browser. Le informazioni fiscali, bancarie e i pagamenti restano sempre nel portale del cliente.

Un accesso delegato e ufficiale (un invito a un account AT distinto, con ruoli revocabili) e' diverso dalla condivisione della password: puo' essere usato solo come servizio manuale assistito, non viene presentato come integrazione API.

## Classificazione operativa iniziale

| Provider | Classe | Può AT pubblicare nell'account cliente? | Esperienza in AT |
| --- | --- | --- | --- |
| Amazon KDP | `MANUAL ONLY` | Non risulta un'API self-service ufficiale per pubblicare nel Partner/KDP account. Il cliente effettua upload e conferma nel suo portale. | `Download package` + `Open provider portal` |
| Apple Books | `MANUAL ONLY` | Il cliente mantiene Apple Account, contratti, dati fiscali e bancari. Nessuna API pubblica self-service verificata. | `Download package` + checklist |
| Google Play Books | `FILE FEED` | Si', **solo** dopo consenso del publisher/service-provider e setup approvato da Google. Supporta fetch di EPUB/PDF, metadata/rights e anche audiolibri. | `Request setup` poi `Send feed` |
| Kobo Writing Life | `MANUAL ONLY` | Nessuna API pubblica self-service verificata; upload nel portale dell'autore/editore. | `Download package` + `Open provider portal` |
| Barnes & Noble Press | `MANUAL ONLY` | Il portale consente ruoli contributor per operazioni editoriali; usarli solo tramite invito esplicito e revocabile del cliente, mai con password. | `Invite a collaborator` + checklist |
| Draft2Digital | `MANUAL ONLY` | Si', come assistenza manuale: Account Sharing ufficiale permette permessi limitati e revocabili a un account AT separato. Non e' un'API. | `Request delegated access` |
| IngramSpark | `MANUAL ONLY` | Upload self-service di EPUB/PDF; nessuna API pubblica self-service verificata. Account, tax e pagamenti restano del cliente. | `Download package` + checklist |
| StreetLib | `PARTNERSHIP API` | Si', soltanto dopo partnership: la Partners API e' destinata a publishing organizations partner e il Dev Portal e' in private beta. | `Contact partnership` finche' non approvata |
| PublishDrive | `PARTNERSHIP API` | Da validare contrattualmente: non trattarla come API aperta; l'eventuale automazione richiede un accordo commerciale/enterprise. | `Contact partnership` |
| Spotify for Authors | `MANUAL ONLY` | Pubblicazione diretta dal portale; nessuna API pubblica di publishing verificata. | `Download package` + `Open provider portal` |
| ACX | `MANUAL ONLY` | Il rights holder/authorized agent completa accordi e upload nel portale; nessuna API pubblica di publishing verificata. AT prepara i master, il cliente completa il flusso. | `Download package` + checklist |

`DIRECT API` resta volutamente vuoto finche' non esiste documentazione ufficiale che autorizzi AT a operare per singolo account cliente con autorizzazione revocabile. L'assenza di una API pubblica non significa che il provider sia impossibile: significa che AT non promette una connessione automatica.

## Regole UI

| Classe | CTA primaria | Cosa AT fa | Cosa non fa |
| --- | --- | --- | --- |
| `DIRECT API` | `Connect` | OAuth/token, invio e stato | Password e dati bancari/fiscali |
| `PARTNERSHIP API` | `Contact partnership` | Mostra requisiti e abilita il connettore solo dopo approvazione | Pubblicare prima dell'accordo |
| `FILE FEED` | `Request setup` | Prepara feed, manifest e storage di consegna | Attivare feed non autorizzati |
| `MANUAL ONLY` | `Download package` / `Open provider portal` | File, metadati, validazione, checklist | Compilare il portale con password cliente |
| `NOT POSSIBLE` | `Not supported` | Spiega il limite e conserva le release | Qualsiasi workaround non ufficiale |

Per l'accesso delegato, la CTA deve dire `Request delegated access`, mai `Connect`: il cliente invita un account AT nominativo dal proprio portale, sceglie i permessi e puo' revocarli in qualsiasi momento. L'operatore AT non deve poter visualizzare o cambiare pagamenti, tasse o credenziali.

## Requisiti prima di implementare un connettore

- Confermare termini, paesi supportati, ruoli, diritti e responsabilita' con il provider e, quando serve, con consulenza legale.
- Salvare solo token cifrati e metadati minimi (provider, scope, scadenza, owner, data di revoca); mai il segreto in log o risposte API.
- Richiedere scope minimi e consenso esplicito per ogni account cliente.
- Esporre sempre `Disconnect`/`Revoke`; la revoca deve fermare nuove consegne.
- Registrare audit log: chi ha autorizzato, quale release e' stata inviata, provider, timestamp, esito e riferimento esterno.
- L'azione conclusiva di vendita/pubblicazione resta del cliente quando i termini del provider la richiedono.

## Fonti ufficiali

- [Google Play: automated content fetching](https://support.google.com/books/partner/answer/2763162?hl=en) e [service provider access](https://support.google.com/books/partner/answer/3323299?hl=en).
- [Google Play: feed per audiolibri](https://support.google.com/books/partner/answer/7504302?hl=en-GB).
- [StreetLib Developer Portal](https://developers.streetlib.com/).
- [Draft2Digital Knowledge Base: Account Sharing](https://draft2digital.com/knowledge-base/) e [annuncio Shared Accounts](https://draft2digital.com/blog/a-little-help-introducing-d2d-shared-accounts/).
- [Apple Books: pubblicare](https://authors.apple.com/publish) e [creare l'account iTunes Connect](https://authors.apple.com/support/3967-create-itunes-connect-account).
- [Kobo Writing Life](https://help.kobo.com/hc/en-us/articles/360017771754-What-is-Kobo-Writing-Life).
- [Barnes & Noble Press: iniziare](https://help-press.barnesandnoble.com/hc/en-us/articles/19897122642971-Getting-Started-with-B-N-Press) e [Contributor permissions](https://help-press.barnesandnoble.com/hc/en-us/articles/5359462497691-My-Contributors-FAQs).
- [IngramSpark: requisiti file eBook](https://www.ingramspark.com/blog/file-requirements-for-ebooks).
- [Spotify for Authors](https://authors.spotify.com/get-started).
- [ACX: upload audio files](https://help.acx.com/s/article/upload-audio-files).
- [PublishDrive Terms](https://publishdrive.com/terms-and-conditions.html).
