# Prompts De Suite - StreamVolume Guard Hub

Decision validee : Option C - architecture hybride Desktop + Extension + Bridge Local.

Etat reel au 2026-07-02 : ce fichier est le document de pilotage des prochaines sessions. Il doit rester synchronise avec le code, `docs/product-next-plan.md`, `docs/tester-checklist.md`, `docs/maintainer-checklist.md`, README/CONTRIBUTING quand ils changent, et `CHANGELOG.md`.

Regle ajoutee par decision utilisateur : apres chaque implementation, verifier si les prompts a venir doivent etre recalibres. Si oui, mettre a jour ce fichier dans le meme paquet de travail, puis mettre a jour `CHANGELOG.md`.

## Objectif V1 Stable Testable

Construire une version locale Windows qui equilibre les sources audio disponibles sans driver, sans compte, sans cloud et sans telemetrie :

- applications Windows via sessions audio Windows ;
- sous-sources navigateur via extension et bridge local quand possible ;
- sources non controlables visibles honnetement en `ObserveOnly` ou `Unknown`.

Le produit ne doit jamais decouvrir a la fin qu'une source ne peut pas etre controlee. Toute source visible doit annoncer :

```text
origin: WindowsSession / BrowserExtension
controlSurface: WindowsSessionVolume / BrowserGain / ObserveOnly / Unknown
status: Safe / Risky / Low / Muted / Excluded / Unknown
isControllable: true / false
```

## Regles Permanentes

- Pas de driver audio maison pour la V1.
- Pas de traitement sample par sample dans le desktop V1.
- Pas de compte, cloud sync, tracker ou telemetrie.
- Pas de patch moteur cible du type `if TikTok`, `if Chrome`, `if Spotify`.
- Desktop, extension, protocole et bridge restent separes.
- Ne pas creer de release GitHub ni de tag sans demande explicite.
- Ne pas modifier les dossiers generes : `bin/`, `obj/`, `dist/`, `build/`, `out/`, `release-assets/`, `release/`, `releases/`, `graphify-out/`, `.graphify/`, `node_modules/`.
- Toute implementation qui change le comportement, les tests, les docs, GitHub, le packaging ou les limites doit mettre a jour `CHANGELOG.md`.
- Toute implementation qui change l'ordre de suite doit mettre a jour ce fichier.

## Etat Courant Des Paquets

| Paquet | Sujet | Etat 2026-07-02 | Suite reelle |
| --- | --- | --- | --- |
| 0 | Audit et source de verite | Fait | Refaire seulement apres interruption ou gros doute. |
| 1 | Bridge local desktop | Fait/durci/testable | Reste : test port occupe et verification manuelle health/POST. |
| 2 | Extension navigateur -> bridge | Fait/testable | Verifier en reels sites, pas reimplementer. |
| 3 | UI melangeur intelligent | Fait/testable | Ajuster apres retours testeur. |
| 4 | Anti-conflit BrowserGain / WindowsSessionVolume | Fait minimal/testable | Verifier avec vrais navigateurs et plusieurs onglets. |
| 5 | Normalisation stable | Moteur present/teste | Valider a l'oreille sur vraies sources, ajuster si besoin. |
| 6 | Panic, exclusions, reglages | Fait/testable | Panic, logs, Auto, exclusions et cible globale persistent. Reste calibration OBS mieux guidee. |
| 7 | Tests reels multi-sources | Prochaine priorite | YouTube, TikTok, Spotify Web, Discord, VLC, OBS, combos. |
| 8 | Packaging testeur Windows | Pas fait | Dossier testeur clair sans confusion avec `.sln`. |
| 9 | Stabilisation V1 | Pas fait | Pass final apres tests reels et packaging. |

## Commandes Automatiques De Base

Depuis :

```powershell
cd "D:\Codex\StreamVolume Guard Hybride"
```

Lancer :

```powershell
node "packages/protocol/tests/protocol.test.js"
node "apps/browser-extension/tests/unit.test.js"
node --check "apps/browser-extension/bridge/client.js"
node --check "apps/browser-extension/background.js"
node --check "apps/browser-extension/content.js"
dotnet run --project "apps/desktop/tests/StreamVolumeGuard.Tests/StreamVolumeGuard.Tests.csproj"
dotnet build "apps/desktop/StreamVolumeGuard.Desktop.sln" -nr:false
```

Ces commandes ne remplacent pas les tests reels avec audio. Une build verte ne prouve pas que TikTok, OBS ou un navigateur se comportent bien.

## Chemins A Connaitre

```text
Racine projet : D:\Codex\StreamVolume Guard Hybride
Prompts : D:\Codex\StreamVolume Guard Hybride\docs\implementation-prompts.md
Plan produit : D:\Codex\StreamVolume Guard Hybride\docs\product-next-plan.md
Checklist testeur : D:\Codex\StreamVolume Guard Hybride\docs\tester-checklist.md
Checklist mainteneur : D:\Codex\StreamVolume Guard Hybride\docs\maintainer-checklist.md
Protocole : D:\Codex\StreamVolume Guard Hybride\packages\protocol
Desktop : D:\Codex\StreamVolume Guard Hybride\apps\desktop
Extension : D:\Codex\StreamVolume Guard Hybride\apps\browser-extension
Logs locaux : %LOCALAPPDATA%\StreamVolumeGuard\logs
Config locale : %LOCALAPPDATA%\StreamVolumeGuard\config.json
Package testeur attendu : D:\Codex\StreamVolume Guard Hybride\artifacts\tester
```

## Maintenance Obligatoire Apres Chaque Implementation

A la fin de chaque paquet d'implementation, faire cette passe avant de dire que c'est termine :

1. Verifier si `docs/implementation-prompts.md` contient encore une hypothese fausse.
2. Verifier si `docs/product-next-plan.md` doit changer l'etat fait/pas fait.
3. Verifier si `docs/tester-checklist.md` doit changer les etapes de test manuel.
4. Verifier si `docs/maintainer-checklist.md`, README ou CONTRIBUTING doivent changer les commandes.
5. Verifier si `.github/` doit changer quand le workflow, PR ou rapports de test changent.
6. Mettre `CHANGELOG.md` a jour pour tout changement produit, test, doc, workflow, packaging ou limite utilisateur.
7. Ne pas toucher aux dossiers generes.
8. Relancer les tests pertinents ou noter clairement pourquoi ils ne sont pas relances.

Question obligatoire avant de passer au paquet suivant :

```text
Les resultats reels changent-ils la suite ?

Verifier :
- une source supposee controlable est-elle ObserveOnly ou Unknown ?
- une commande de test a-t-elle change ?
- un risque nouveau est-il apparu ?
- une checklist doit-elle etre renforcee ?
- un prompt suivant promet-il encore quelque chose de faux ?
- le changelog decrit-il ce qui vient de changer ?
```

## Prompt De Reprise Immediate - Prochaine Session

A utiliser si on reprend maintenant :

```text
Travaille dans D:\Codex\StreamVolume Guard Hybride.

Objectif : passer de base hybride testable a V1 testable en conditions reelles.

Ne reimplemente pas le bridge, l'envoi extension, l'UI de classification, l'anti-conflit minimal ou la config Auto/exclusions/token bridge : ils existent deja en version testable. Commence par verifier l'etat reel puis lance les tests reels source par source.

Priorite : YouTube, TikTok, Spotify Web/Deezer Web, Discord, VLC, OBS, puis combinaisons.

Pour chaque source, relever :
- detection Windows mixer ;
- detection StreamVolume Guard Hub Windows sources ;
- detection sous-source navigateur ;
- origin ;
- controlSurface ;
- status ;
- isControllable ;
- logs ;
- comportement observation/Auto/Panic/exclusion si pertinent.

Apres les tests, mettre a jour docs/tester-checklist.md, docs/product-next-plan.md, docs/implementation-prompts.md et CHANGELOG.md selon les resultats.
```

---

# Paquets De Suite

## Paquet 0 - Audit Apres Interruption

Statut : fait, a refaire seulement si le contexte est incertain.

Prompt :

```text
Travaille dans D:\Codex\StreamVolume Guard Hybride.

Avant toute implementation, fais un audit rapide de reprise :
- verifier AGENTS.md ;
- verifier l'absence ou presence de .git ;
- verifier Graphify seulement si graphify-out contient un rapport utile ;
- lire README.md, CHANGELOG.md, docs/product-next-plan.md, docs/tester-checklist.md, docs/implementation-prompts.md ;
- verifier packages/protocol, apps/desktop, apps/browser-extension ;
- lister ce qui est fait, partiel, casse.

Ne modifie pas de fichier pendant l'audit initial.
```

Sortie attendue : etat reel, risques, fichiers a corriger, ordre court.

## Paquet 1 - Bridge Local Desktop

Statut : fait/durci/testable. Ne pas le reimplementer.

Deja present :

- ecoute uniquement `127.0.0.1:47841` ;
- `GET /health` ;
- `POST /browser-source` ;
- `POST /extension-log` pour les evenements extension sanitizes ;
- validation stricte JSON ;
- refus propre des messages invalides ;
- logs locaux ;
- parsing HTTP par longueur en octets pour garder les titres Unicode ;
- limite de taille de requete ;
- Origin allowlist extension / `127.0.0.1` / `localhost` / outils locaux sans `Origin` ;
- token local optionnel via config `BridgeToken` et en-tete `X-StreamVolume-Guard-Token`.

Si repris, objectif :

```text
Verifie le bridge local desktop existant sans le reimplementer.

Conserver :
- ecoute uniquement 127.0.0.1 ;
- port 47841 documente ;
- GET /health ;
- POST /browser-source ;
- POST /extension-log ;
- validation stricte JSON ;
- refus propre des messages invalides ;
- logs locaux.

Ameliorations possibles avant V1 si les tests reels le demandent :
- message clair si port occupe ;
- test pour port occupe ;
- UX simple pour afficher que le token local est actif sans exposer sa valeur ;
- docs mises a jour si le comportement change.
```

Validation : tests desktop + build desktop + health check manuel.

## Paquet 2 - Extension Navigateur

Statut : fait/testable. Ne pas refaire l'architecture.

Si repris, objectif : verifier sur vrais sites et corriger seulement les bugs generiques.

```text
Verifie que l'extension envoie `browser_source_observed` au bridge local avec :
- origin = BrowserExtension ;
- controlSurface = BrowserGain / ObserveOnly / Unknown ;
- status ;
- isControllable coherent ;
- source navigateur issue de `media-html` ou `tab-capture` ;
- pas d'URL complete ;
- pas d'audio brut ;
- emission `extension_log` uniquement pour les evenements utiles et sanitizes ;
- aucun patch cible par site.

Tester YouTube, TikTok, Spotify Web ou Deezer Web un par un.
```

Validation : tests extension + checks JS + source reelle visible ou echec logue clairement.

## Paquet 3 - UI Desktop Type Melangeur

Statut : fait/testable. L'UI affiche deja les sources Windows, les sous-sources navigateur et `ControlSurface` / `Contrôlable`.

Si repris, objectif : ameliorer la lisibilite apres retours testeur.

```text
Ameliore uniquement ce qui bloque la comprehension testeur :
- libelles plus clairs ;
- separation Windows / navigateur ;
- explication ObserveOnly / Unknown ;
- logs copiables ;
- pas de jargon inutile.

Ne transforme pas l'app en dashboard marketing. Garder l'esprit melangeur Windows intelligent.
```

Validation : build desktop + test visuel + checklist testeur.

## Paquet 4 - Anti-Conflit BrowserGain / WindowsSessionVolume

Statut : minimal fait/testable.

Objectif restant : confirmer sur vrais navigateurs.

```text
Teste et ajuste l'anti-conflit existant.

Regle produit : si une sous-source recente est controlee par BrowserGain, le desktop ne doit pas corriger brutalement toute la session navigateur correspondante. Si la sous-source est ObserveOnly, WindowsSessionVolume peut rester utile.

Ne pas ajouter de patch site/app. Corriger uniquement des regles generiques de matching, fraicheur ou logs.
```

Validation : tests desktop + deux onglets + navigateur/app desktop + logs `volume.browser_conflict_skip`.

## Paquet 5 - Normalisation Stable

Statut : moteur present/teste avec verrou Auto one-shot, validation oreille encore necessaire.

```text
Stabilise la normalisation sur vraies sources.

Contraintes :
- correction ponctuelle d'une source trop forte ;
- correction douce one-shot d'une source trop faible ;
- pas de mouvement continu du fader pendant la meme lecture ;
- pas de mute automatique ;
- pas de saut brutal ;
- cooldown manuel respecte ;
- Auto desactivable ;
- logs comprehensibles, dont `volume.auto` et `volume.auto_locked`.

Ne pas ajuster les seuils sur une seule source. Tester au moins deux sources differentes avant de conclure.
```

Validation : tests desktop + YouTube/TikTok ou Spotify + VLC/Discord, logs copies. Confirmer que `volume.auto` apparait une fois par source active et que les corrections suivantes sont verrouillees par `volume.auto_locked` jusqu'a silence durable ou disparition de session.

## Paquet 6 - Panic, Exclusions Et Reglages

Statut : fait/testable pour Panic, exclusions, Auto, logs et cible globale.

Deja present : Panic, logs locaux, exclusions, `Auto actif`, cible globale, persistance JSON de Auto/exclusions/cible, exposition `GET /global-target`, reception locale `POST /extension-log`, et synchro extension des onglets deja proteges quand la cible desktop change.

Reste a clarifier ou implementer selon tests :
- calibration OBS simple mieux guidee ;
- comportement Panic apres redemarrage si besoin.

```text
Finalise les controles utilisateur essentiels sans compte ni cloud.

Verifier d'abord ce qui existe deja, puis corriger seulement les manques confirmes par tests.
```

Validation : tests desktop + redemarrage app + verification `%LOCALAPPDATA%\StreamVolumeGuard\config.json`.

## Paquet 7 - Tests Reels Multi-Sources

Statut : prochaine priorite.

```text
Travaille dans D:\Codex\StreamVolume Guard Hybride.

Prepare et execute une campagne de tests reels guidee.

Sources a tester une par une :
1. YouTube navigateur.
2. TikTok navigateur.
3. Spotify Web ou Deezer Web.
4. VLC ou lecteur local.
5. Discord.
6. Spotify desktop si disponible.
7. OBS en verification visuelle manuelle.
8. Deux onglets dans le meme navigateur.
9. Navigateur + app Windows.

Pour chaque source :
- cliquer Marquer etape si disponible ;
- mettre Play ;
- attendre 10 a 15 secondes ;
- noter detection, origin, controlSurface, status, isControllable ;
- noter si la sous-source navigateur est `media-html` ou `tab-capture` quand c'est visible dans les logs ;
- copier logs recents ;
- noter si ObserveOnly ou Unknown est honnete et comprehensible.

Ne valide pas globalement si TikTok ou OBS n'a pas ete traite clairement.
```

Validation : `docs/tester-checklist.md` renseignee/ajustee + eventuels bugs ou test reports GitHub si necessaire.

## Paquet 8 - Packaging Testeur Windows

Statut : pas fait.

```text
Prepare un packaging testeur Windows propre.

Objectif : un testeur non technique ne doit pas cliquer sur le `.sln`.

A fournir :
- dossier `artifacts/tester` ou equivalent ;
- launcher clair ;
- README testeur ;
- checklist courte ;
- emplacement logs et config ;
- limites ObserveOnly / Unknown ;
- aucune release GitHub/tag sans demande explicite.
```

Validation : build + lancement depuis package + pas de dossiers generes inutiles dans le package final.

## Paquet 9 - Stabilisation V1

Statut : pas fait.

```text
Fais une passe de stabilisation V1 apres tests reels et packaging.

Criteres :
- desktop demarre ;
- bridge demarre ou echoue proprement ;
- extension envoie au moins une vraie sous-source navigateur ;
- sources Windows visibles ;
- ObserveOnly / Unknown visibles ;
- Auto desactivable ;
- Panic fonctionne ;
- exclusions persistent ;
- logs exploitables ;
- docs alignees avec comportement reel ;
- tests principaux passent.

Ne declare pas V1 stable si les limites navigateur ne sont pas visibles dans l'UI et les docs.
```

Validation finale : commandes automatiques, campagne manuelle, package testeur, docs et changelog a jour.
