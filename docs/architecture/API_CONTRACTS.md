# Contrats API Venio

Ce document décrit les conventions vérifiées dans le frontend et le backend.
Pour la liste vivante des routes agent, consulter aussi
[`/api/v1/agent/openapi.json`](https://venio.paris/api/v1/agent/openapi.json).

## Espaces d'API

| Espace | Préfixe | Authentification |
| --- | --- | --- |
| API métier | `/api/*` | Session utilisateur lorsque la route la protège |
| API agent | `/api/v1/agent/*` | Token Bearer avec scopes |

Une URL `/api/*` inconnue répond en JSON `404` et ne bascule pas vers la SPA.

## Authentification humaine

`POST /api/auth/login` crée une session côté serveur et pose le cookie
`venio_session`. Le cookie est HTTP-only, `SameSite=Strict`, limité au chemin
`/` et reçoit l'attribut `Secure` en production. Le frontend ne lit ni ne
stocke le secret de session ; ses appels utilisent les credentials same-origin.

Le middleware backend valide que la session existe, n'est pas révoquée, n'est
pas expirée et correspond à un compte actif. Une réponse `401` fait rediriger
le frontend vers la page de connexion de l'espace courant. Les permissions des
routes administratives s'appuient sur `rbac-matrix.json`, source de vérité
partagée et contrôlée par les tests frontend et backend.

## Helpers frontend

Les nouveaux appels frontend doivent utiliser `src/lib/api.ts` :

| Helper | Contrat |
| --- | --- |
| `apiFetch<T>` | Encode par défaut en JSON, envoie les credentials same-origin et lève `ApiError` en cas d'échec HTTP. |
| `apiUpload<T>` | Envoie un `FormData` sans fixer `Content-Type`, afin que le navigateur ajoute le boundary multipart. |
| `apiDownload` | Renvoie le blob, le type de contenu et un nom de fichier sûr, extrait de `Content-Disposition` si présent. |
| `ApiError` | Expose `status`, `message` et `payload`. |

Les erreurs métier ne possèdent pas une enveloppe universelle : le format
commun est `{ error: string }`, certaines validations ajoutent `errors`. Le
gestionnaire global masque le détail d'une erreur 5xx en production.

## Uploads et téléchargements

- Les routes humaines qui acceptent des fichiers utilisent `multipart/form-data`
  et leurs propres configurations Multer. Ne pas imposer manuellement le header
  `Content-Type` depuis le navigateur.
- Les fichiers sont écrits sous `uploads/`, relatif au répertoire de travail du
  backend. En développement lancé depuis `backend/`, cela correspond à
  `backend/uploads/`; dans le conteneur de production, à `/app/uploads`, monté
  sur le volume Docker `venio-uploads`.
- Les routes de téléchargement protègent leur répertoire autorisé avant de
  servir le fichier. Côté client, employer `apiDownload` quand la réponse est
  binaire.
- L'API agent reçoit ses documents et pièces jointes en JSON base64, pas en
  multipart. Un document agent ne peut pas dépasser 5 MiB après décodage ; la
  requête JSON de l'API agent est plafonnée à 8 MiB. Un JSON invalide renvoie
  `400 MALFORMED_JSON` et un body qui dépasse cette limite renvoie
  `413 PAYLOAD_TOO_LARGE`, toujours avec le format d'erreur agent et un
  `requestId`.

Les limites d'upload peuvent varier selon la route humaine. Ne pas présenter
une limite d'une route comme une limite globale.

## API agent

L'API agent est distincte des sessions humaines et de toute permission de rôle.
Son unique famille d'URL est `/api/v1/agent/*`.

```http
Authorization: Bearer vno_pat_<secret>
```

Les scopes sont contrôlés indépendamment : `write:X` ne donne pas `read:X`.
`GET /api/v1/agent/ping` permet de vérifier un token actif sans scope dédié ;
la spécification OpenAPI est publique.

### Erreurs agent

Les erreurs agent suivent ce format :

```json
{ "error": "Message lisible", "code": "CODE_MACHINE", "requestId": "req_..." }
```

`details` peut compléter la réponse, notamment pour les scopes manquants. Les
codes observables incluent `MISSING_TOKEN`, `INVALID_TOKEN`, `EXPIRED_TOKEN`,
`INSUFFICIENT_SCOPE`, `MISSING_IDEMPOTENCY_KEY`, `INVALID_IDEMPOTENCY_KEY`,
`IDEMPOTENCY_CONFLICT`, `RATE_LIMITED` et `NOT_FOUND`.

### Idempotence

Chaque `POST`, `PATCH`, `PUT` ou `DELETE` exige `Idempotency-Key`. La clé doit
être alphanumérique avec tirets et avoir entre 8 et 255 caractères ; un UUID
convient. Pour un retry de la même méthode et du même endpoint, réutiliser
exactement la clé et le body : la réponse mémorisée (statut et JSON) est alors
rejouée. Réutiliser cette clé sur une autre opération, ou avec un body
différent, renvoie `409 IDEMPOTENCY_CONFLICT`.

Les enregistrements d'idempotence sont isolés par token et expirent après
24 heures. Cette garantie ne remplace pas la vérification fonctionnelle du
résultat par le client.

### Pagination et quotas

Les listes agent qui emploient la pagination commune répondent :

```json
{ "items": [], "page": 1, "pageSize": 50, "total": 0 }
```

`page` commence à 1, `pageSize` vaut 50 par défaut et est plafonné à 200. Le
quota agent est de 120 requêtes/minute par token par défaut, configurable par
token. Il est appliqué en mémoire, donc par processus ; les réponses exposent
`X-RateLimit-Limit` et `X-RateLimit-Remaining`, ou `429 RATE_LIMITED` avec
`Retry-After`.

## Devis Artosera

`POST /api/artosera/devis` envoie par e-mail le devis produit par la page
commerciale Artosera (`venio.paris/artosera/devis`). La route est **publique**
et sans authentification : la page est utilisée en rendez-vous, hors session.

Corps attendu, en JSON :

| Champ | Contenu |
| --- | --- |
| `to` | Adresse e-mail de la galerie destinataire. Une seule adresse. |
| `galerie`, `interlocuteur` | Libellés repris dans la trace ; facultatifs. |
| `subject` | Objet du message, sur une ligne. |
| `body` | Corps en texte brut ; chaque ligne devient un paragraphe en HTML. |
| `filename` | Nom souhaité de la pièce jointe. |
| `pdfBase64` | PDF du devis encodé en base64, sans préfixe `data:`. |
| `devis` | État complet du devis, conservé tel quel pour la trace. |

Réponses : `200 { ok: true }` après remise au serveur SMTP, `400 { ok: false, code, error }`
si le destinataire, l'objet, le corps ou le PDF sont invalides, `413` au-delà
de 8 MiB de JSON, `429` au-delà de 10 envois par IP sur 15 minutes, `502` si
l'envoi SMTP échoue et `503` si la trace ne peut pas être écrite.

Le parser JSON de cette route accepte 8 MiB, le PDF décodé 5 MiB. Le sujet et
les libellés sont débarrassés de leurs caractères de contrôle, et le nom de
fichier est réduit à son basename : le contenu vient du navigateur et sert à
la fois d'en-tête SMTP et de nom sur disque.

Chaque envoi est mis en copie cachée à `ARTOSERA_DEVIS_BCC`
(défaut `contact@venio.paris`) et archivé avant expédition sous
`uploads/artosera-devis/<jour>/<référence>/`, qui contient le PDF envoyé et un
`devis.json` portant l'état du devis, le destinataire et l'IP appelante.

### Appel depuis le site artosera.com

La page `composer.html` (et `en/composer.html`) du site statique artosera.com
appelle la même route en cross-origin, en arrière-plan (`fetch`). Seules les
origines exactes `https://artosera.com` et `https://www.artosera.com` sont
admises, et pour cette route uniquement : le CORS global reste limité à
`CORS_ORIGIN`, avec credentials, partout ailleurs.

**Requête** : `POST https://venio.paris/api/artosera/devis`,
`Content-Type: application/json`, sans cookies (`credentials: 'omit'`).
Préflight `OPTIONS` → `204`, `Access-Control-Allow-Origin` = origine appelante,
`Access-Control-Allow-Methods: POST`, `Access-Control-Allow-Headers: Content-Type`,
`Access-Control-Max-Age: 600`, `Vary: Origin`, sans
`Access-Control-Allow-Credentials`. Toutes les réponses, erreurs comprises,
portent ces en-têtes.

**Corps** (8 MiB de JSON au plus) :

| Champ | Obligatoire | Usage |
| --- | --- | --- |
| `pdfBase64` | oui | PDF en base64 (préfixe `data:application/pdf;base64,` toléré), 5 MiB décodés au plus, commence par `%PDF-`. Joint au seul mail interne. |
| `recap` | oui, sauf si `selection` | Récapitulatif du composeur : `{ kind, lang, offre, engagement, services: [{ titre, sousTotal, lignes: [{ nom, prix, choix? }] }], totaux, notes }`. Converti pour le mail interne (voir ci-dessous). |
| `selection` | non | Forme structurée alternative, prioritaire sur `recap` : `{ coeur: [{ titre, items[] }], modules: [{ titre, groupe?, choix }], accompagnement: [{ titre, choix }], notes }`. |
| `to` (ou `email`) | non | Adresse saisie par le prospect : `Reply-To` du mail interne, destinataire du récapitulatif. Jamais destinataire du mail interne. |
| `devis.responses` | non | `{ "<id>": "<réponse>" }`, source unique du récapitulatif au prospect (liste blanche ci-dessous). |
| `galerie`, `interlocuteur` | non | 160 / 120 caractères. Repris dans le mail au prospect seulement s'ils passent le filtre strict. |
| `recap.lang` (ou `lang`, `selection.lang`) | non | `fr` (défaut) ou `en` : langue des deux mails et des messages d'erreur. |
| `filename` | non | Nom de la pièce jointe interne, réduit à `[a-z0-9._-]` + `.pdf`. |
| `website` | non | Pot de miel : doit être absent ou `""`. Rempli → `200 { ok: true }`, rien n'est archivé ni envoyé. |
| `subject`, `body` | ignorés | Objet et textes sont composés côté serveur. |

**Mail interne** : toujours à `contact@venio.paris`, `Reply-To` = adresse du
prospect si valide, sans copie cachée, PDF joint. Objet « Sélection Artosera —
<galerie> (<n> modules indispensables) » (« Artosera selection — … (<n>
essential modules) »). HTML Halo sans ressource distante + texte : bloc « Qui »
(galerie, interlocuteur, e-mail cliquable, langue, date), cœur, modules par
réponse, accompagnement par réponse, remarques, nom du PDF. Conversion de
`recap` : pour chaque ligne, `choix` explicite s'il est connu ; sinon groupe du
cœur (titre « Le cœur »/« The core » ou sous-total « Compris »/« Included ») ;
sinon titre de groupe de modules (« Modules indispensables / intéressants / pour
plus tard / écartés », « Essential / Interesting modules », « Modules for later
/ set aside ») ; sinon pastille `prix` (« Oui / À discuter / Non », « Yes / To
discuss / No »). Sans module ni accompagnement reconnu : `400 invalid_selection`.

**Récapitulatif au prospect** (en plus, jamais bloquant) : envoyé à l'adresse
saisie, objet « Votre sélection Artosera » / « Your Artosera selection »,
expéditeur Artosera, `Reply-To: contact@venio.paris`, **sans pièce jointe**. Il
est composé uniquement depuis `devis.responses` filtré par la liste blanche de
`backend/src/lib/artosera/composerCatalog.ts` — modules `facturation`,
`viewing-rooms`, `coffre`, `mode-foire`, `mouvements`, `application-hors-ligne`,
`offres-relances`, `documents-prestige`, `newsletter-reseaux`, `artsy-artnet`,
`contrats-artistes`, `editions-provenance`, `modeles-contrats`, `agenda-presse`,
`roles-fins`, `api-comptabilite` (réponses `indispensable`, `interessant`,
`plus-tard`, `pas-pour-nous`) ; services `mise-en-place`, `reprise-donnees`,
`reprise-complexe`, `formation`, `assistance`, `evolutions-sur-mesure`,
`site-galerie`, `boutique-en-ligne` (réponses `oui`, `a-discuter`, `non`) — et
de libellés FR/EN définis côté serveur. Identifiant inconnu ou réponse hors de
son type : ignoré. Aucun texte libre n'y est recopié ; galerie et interlocuteur
n'y figurent que s'ils font 80 caractères au plus, sans caractère de contrôle,
URL, domaine, `@` ni chevron (sinon « Bonjour, »). Sauté sans erreur si
l'adresse est absente ou invalide, si aucune réponse ne passe la liste blanche,
ou si l'adresse a déjà reçu un récapitulatif dans les 24 h (compteur en mémoire
du processus, adresses stockées en empreinte SHA-256 ; un redémarrage le remet
à zéro, le quota par IP restant en vigueur).

**Quotas** : 10 envois / 15 min / IP (commun), plus 5 envois / heure / IP pour
ces origines, plus 1 récapitulatif / adresse / 24 h.

**Réponses** : `200 { ok: true }`. Erreurs `{ ok: false, code, error }`, `code`
stable, `error` en français ou en anglais selon la langue du corps (les refus
émis avant lecture du corps, `413` et `429`, sont en français) :

| Statut | `code` |
| --- | --- |
| 400 | `malformed_json`, `invalid_body`, `missing_pdf`, `invalid_pdf`, `pdf_too_large`, `devis_too_large`, `invalid_text`, `invalid_selection` |
| 413 | `payload_too_large` |
| 429 | `rate_limited` |
| 502 | `send_failed` (mail interne) |
| 503 | `archive_unavailable` |

**Trace** : `devis.json` porte en plus `replyTo`, `origin` et la `selection`
normalisée. L'origine est lue dans l'en-tête `Origin`, que seul un navigateur
garantit : un client qui la falsifie n'obtient qu'un envoi vers
`contact@venio.paris` et, au plus, un récapitulatif par adresse et par jour,
composé de libellés fixes ; sans elle, il retombe sur le comportement de la
page venio.paris, inchangé.

## Limites applicatives transverses

- Le parser JSON général est limité à 2 MiB ; les parsers dédiés de l'API
  agent et de `POST /api/artosera/devis` sont limités à 8 MiB. Ses erreurs de syntaxe et de taille restent normalisées
  (`MALFORMED_JSON` / `PAYLOAD_TOO_LARGE`) pour les consommateurs agent.
- Le backend applique un quota global de 200 requêtes par minute et par IP.
- Les tentatives de connexion sont limitées à 5 par IP sur 15 minutes, en ne
  comptant pas les réponses réussies. Les demandes de réinitialisation de mot
  de passe sont limitées à 3 par IP sur 15 minutes.

Pour les routes humaines et administratives qui utilisent ce parser général,
un JSON invalide répond `400 MALFORMED_JSON` et un body qui dépasse 2 MiB
répond `413 PAYLOAD_TOO_LARGE`, sous la forme `{ error, code }`. Des limites
supplémentaires existent par route. Les clients doivent traiter les réponses
4xx/429, plutôt que supposer qu'une taille ou un débit est illimité.
