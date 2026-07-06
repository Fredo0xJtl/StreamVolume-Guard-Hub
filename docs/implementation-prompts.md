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
- Ne pas soumettre au Microsoft Store sans demande explicite.
- Ne pas modifier les dossiers generes : `bin/`, `obj/`, `dist/`, `build/`, `out/`, `release-assets/`, `release/`, `releases/`, `graphify-out/`, `.graphify/`, `node_modules/`.
- Toute implementation qui change le comportement, les tests, les docs, GitHub, le packaging ou les limites doit mettre a jour `CHANGELOG.md`.
- Toute implementation qui change l'ordre de suite doit mettre a jour ce fichier.

## Etat Courant Des Paquets

| Paquet | Sujet | Etat 2026-07-04 | Suite reelle |
| --- | --- | --- | --- |
| 0 | Audit et source de verite | Fait | Refaire seulement apres interruption ou gros doute. |
| 1 | Bridge local desktop | Fait/durci/testable | Reste : test port occupe et verification manuelle health/POST. |
| 2 | Extension navigateur -> bridge | Fait/testable | YouTube direct OK, TikTok/Spotify Web fallback no-media garde maintenant l'etat actif ; `0.1.27` restaure le gain direct historique en mode extension seule, autorise l'upgrade generique `tabCapture` standalone quand `media-html` ne trouve aucun media controlable sur un onglet audible, separe `captureFallbackReason` de `mediaHtmlFallbackReason`, et expose `browserState` / `reason` / `recommendedAction` ; la calibration `BrowserGain` robuste reste reservee au bridge desktop connecte ; retest reel requis. |
| 3 | UI melangeur intelligent | Fait/testable | Ajuster apres retours testeur. |
| 4 | Anti-conflit BrowserGain / WindowsSessionVolume | Fait minimal/testable | Verifier avec vrais navigateurs et plusieurs onglets. |
| 5 | Normalisation stable | Moteur present/teste | Valider a l'oreille sur vraies sources, ajuster si besoin. |
| 6 | Panic, exclusions, reglages | Fait/testable | Panic, logs, Auto, exclusions et cible globale persistent. OBS safety est traite dans un paquet dedie plus tard. |
| 6bis | Sortie globale lecture seule | Fait/testable | Verifier en reel que RMS/pic/etat suivent le mix final et que le volume master Windows ne bouge jamais. |
| 6ter | Coverage Dashboard | Fait/testable | Verifier que `Couverture`, `Action couverture` et le rapport `Copier logs` classent les sources en Direct/Fallback/Action/Limite/Inconnu sans double compter le parent navigateur. |
| 6quater | Source inconnue, Stream Safe, Test guide, OBS guide | Fait/testable | `global_output.unknown_active`, `Stream Safe`, `guided_test.*` et `obs.guide.opened` sont presents. Verifier en reel avant stabilisation. |
| 7 | Tests reels multi-sources | En cours | YouTube et TikTok valides en reel ; retester Spotify Web apres correction `0.1.27` avec `site=open.spotify.com`, `enabled=true`, `browserState`, `reason`, `recommendedAction`, `captureFallbackReason`, `mediaHtmlFallbackReason`, `skippedAlreadyProcessed`, `mediaDetected/mediaProcessed`, cible dB directe en standalone si `mediaProcessed>0`, ou upgrade generique `tabCapture` si `media-html` reste a 0/0 sur un onglet audible ; puis desktop connecte, Discord, VLC, OBS et combos. |
| 8 | Packaging testeur Windows | Fait en alpha locale | Reste : valider le zip depuis un dossier propre, puis publier seulement sur demande explicite. |
| 9 | Stabilisation V1 | Pas fait | Pass final apres tests reels et packaging propre. |
| 10 | OBS Stream Safety Setup | Fait en guide initial | Doc et bouton `Guide OBS` presents. Reste validation reelle OBS avec meters visibles. |
| 11 | Microsoft Store readiness | Pas fait | Apres stabilisation V1 et OBS safety : preparer une beta publique Store sans publier. |

## Commandes Automatiques De Base

Depuis :

```powershell
cd "D:\Codex\StreamVolume Guard Hybride"
```

Lancer :

```powershell
node "packages/protocol/tests/protocol.test.js"
node "apps/browser-extension/tests/unit.test.js"
node --check "apps/browser-extension/audio/browser-gain-calibration.js"
node --check "apps/browser-extension/audio/normalizer.js"
node --check "apps/browser-extension/bridge/client.js"
node --check "apps/browser-extension/background.js"
node --check "apps/browser-extension/content.js"
node --check "apps/browser-extension/offscreen/offscreen.js"
node --check "apps/browser-extension/popup/popup.js"
node --check "apps/browser-extension/options/options.js"
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
Notes alpha : D:\Codex\StreamVolume Guard Hybride\docs\release-notes\v0.1.0-alpha.1.md
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

Ne reimplemente pas le bridge, l'envoi extension, l'UI de classification, l'anti-conflit minimal, la config Auto/exclusions/token bridge ou la sortie globale lecture seule : ils existent deja en version testable. Commence par verifier l'etat reel puis lance les tests reels source par source.

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
- sortie globale : etat, RMS, pic recent, peripherique, et absence de mouvement du volume master ;
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

## Paquet 6bis - Sortie Globale Lecture Seule

Statut : fait/testable.

Deja present :

- monitor desktop `GlobalOutputMonitor` via NAudio loopback sur la sortie Windows par defaut ;
- bloc UI `Sortie globale` avec etat, RMS, pic recent, peripherique et message d'erreur si capture indisponible ;
- logs `global_output.monitor.started`, `global_output.monitor.stopped`, `global_output.level`, `global_output.risky`, `global_output.silent`, `global_output.error` ;
- throttling de `global_output.level` pour eviter le spam ;
- rapport lisible avec section `Sortie globale` ;
- aucun controle du volume master Windows, aucun audio brut dans les logs.

Si repris, objectif : corriger seulement les bugs observes en test reel.

```text
Verifie le Global Output Monitor existant sans le transformer en compresseur.

Conserver :
- lecture seule ;
- pas de volume master modifie ;
- pas d'audio brut, samples ou buffers dans les logs ;
- app fonctionnelle si loopback indisponible ;
- logs globaux utiles mais throttles.

Tester avec toutes les sources en pause, puis YouTube/TikTok/Spotify Web/VLC/Discord un par un.
```

Validation : tests desktop + build desktop + test manuel du bloc `Sortie globale`.

## Paquet 6quater - Source Inconnue, Stream Safe, Test Guide Et OBS Guide

Statut : fait/testable.

Deja present :

- detection `global_output.unknown_active` quand la sortie globale est active sans source connue active ;
- resolution `global_output.unknown_active.resolved` quand une source explique a nouveau le signal ou quand le mix retombe ;
- toggle `Stream Safe` persistant qui active Auto et revient a la cible Standard ;
- boutons `Demarrer guide` / `Etape suivante` avec logs `guided_test.started`, `guided_test.step`, `guided_test.completed` ;
- bouton `Guide OBS` avec rappel Application Audio Capture, Compressor et Limiter ;
- libelles WPF raccordes au `DesktopTextCatalog`.

Si repris, objectif : corriger seulement les bugs observes en test reel. Ne transforme pas `Sortie globale` en controle master et ne promets pas de lecture automatique OBS.

```text
Verifie le paquet 6quater existant.

Tester :
- lancer l'app ;
- cocher Stream Safe ;
- verifier Auto actif + cible Standard ;
- cliquer Demarrer guide puis Etape suivante ;
- ouvrir Guide OBS ;
- creer volontairement un son non explique si possible et verifier global_output.unknown_active ;
- copier logs et verifier que les evenements sont lisibles.
```

Validation : tests desktop + build desktop + test manuel rapide UI/logs.

## Paquet 7 - Tests Reels Multi-Sources

Statut : prochaine priorite.

```text
Travaille dans D:\Codex\StreamVolume Guard Hybride.

Prepare et execute une campagne de tests reels guidee avec le bouton `Demarrer guide`.

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
- utiliser `Demarrer guide` puis `Etape suivante`, ou `Marquer etape` si tu fais une variante manuelle ;
- mettre Play ;
- attendre 15 a 20 secondes pour les sources navigateur, sauf si un `no-signal` explicite arrive avant ;
- noter detection, origin, controlSurface, status, isControllable ;
- noter si la sous-source navigateur est `media-html` ou un upgrade generique `tab-capture` quand c'est visible dans les logs ; en mode extension seule, cet upgrade peut partir si l'onglet est audible et que le chemin HTML reste muet, mais il doit rester generique et honnete ;
- noter `browserState`, `reason`, `recommendedAction`, `captureSignalState`, `fallbackRecommended` et `fallbackReason` si une capture `tab-capture` ne fournit pas de signal Web Audio ;
- noter `needs-user-action`, `restricted` ou `unsupported` si `tabCapture` ne peut pas demarrer ;
- noter aussi `mediaHtmlFallbackReason=no-media-element-detected` ou `no-controllable-media-detected` en mode extension seule si `media-html` est actif mais ne controle aucun media ; verifier `tabAudible` / `tabActive` et l'eventuelle bascule generique `tab-capture` meme sans desktop si l'onglet est audible ;
- noter `skippedAlreadyProcessed` si `media-html` detecte un lecteur mais reste a `mediaProcessed=0`, afin de separer un marqueur `processed` orphelin d'une vraie limite de controle ;
- verifier apres changement de cible dB que l'onglet reste `enabled=true` sauf Stop utilisateur ou exclusion ;
- noter l'etat `Sortie globale`, `rmsDb`, `peakDb` / pic recent, et verifier que le volume master Windows ne bouge pas ;
- noter si `global_output.unknown_active` apparait et identifier la source Windows/OBS/systeme probable ;
- tester `Stream Safe` : Auto doit etre actif et la cible doit revenir a Standard ;
- si la source reste `ObserveOnly`, `Unknown`, `skipped` ou `no-signal`, verifier que le desktop affiche une `Raison` et une `Action` claire : recharger, reproteger, fallback Windows ou OBS ;
- copier logs recents ;
- noter si ObserveOnly ou Unknown est honnete et comprehensible.

Ne valide pas globalement si TikTok ou OBS n'a pas ete traite clairement.
```

Validation : `docs/tester-checklist.md` renseignee/ajustee + eventuels bugs ou test reports GitHub si necessaire.

## Paquet 8 - Packaging Testeur Windows

Statut : fait en alpha locale avec package self-contained et checksum, a valider depuis un dossier propre.

```text
Prepare un packaging testeur Windows propre.

Objectif : un testeur non technique ne doit pas cliquer sur le `.sln`.

A fournir :
- dossier `artifacts/tester` ou equivalent ;
- zip `StreamVolumeGuardHub-Tester-v0.1.0-alpha.1.zip` ;
- checksum SHA256 du zip ;
- desktop publie self-contained `win-x64` ;
- launcher clair ;
- README testeur ;
- checklist courte ;
- licence racine incluse ;
- emplacement logs et config ;
- limites ObserveOnly / Unknown ;
- limite Windows unsigned/SmartScreen documentee ;
- rappeler que le zip GitHub non signe peut encore afficher SmartScreen ;
- Microsoft Store garde comme chemin beta publique possible pour reduire la friction sans certificat payant ;
- aucune release GitHub/tag sans demande explicite.
```

Validation : build + lancement depuis package + zip/checksum presents + pas de dossiers generes inutiles dans le package final.

## Paquet 9 - Stabilisation V1

Statut : pas fait.

```text
Fais une passe de stabilisation V1 apres tests reels et packaging.

Criteres :
- desktop demarre ;
- bridge demarre ou echoue proprement ;
- extension envoie au moins une vraie sous-source navigateur ;
- sources Windows visibles ;
- dashboard `Couverture` visible avec score et actions ;
- ObserveOnly / Unknown visibles avec raison et action de recuperation ;
- Auto desactivable ;
- Panic fonctionne ;
- exclusions persistent ;
- logs exploitables ;
- docs alignees avec comportement reel ;
- tests principaux passent.

Ne declare pas V1 stable si les limites navigateur ne sont pas visibles dans l'UI et les docs.
```

Validation finale : commandes automatiques, campagne manuelle, package testeur, docs et changelog a jour.

## Paquet 10 - OBS Stream Safety Setup

Statut : fait en guide initial. A reprendre seulement si les tests reels OBS montrent que le guide actuel est insuffisant. Ce paquet passe avant Microsoft Store readiness seulement s'il faut completer la doc ou l'UI.

Objectif : donner une vraie valeur streamer au Hub sans developper tout de suite un plugin OBS ou un VST. Le Hub reste le centre de controle Windows + navigateur ; OBS devient la securite finale du stream avec ses outils existants.

```text
Travaille dans D:\Codex\StreamVolume Guard Hybride.

Ajoute le paquet OBS Stream Safety Setup.

But produit :
- expliquer clairement que StreamVolume Guard Hub organise, calibre et ajuste les sources visibles ;
- expliquer que le Hub desktop seul n'est pas un compresseur studio global ;
- guider l'utilisateur pour securiser le son final dans OBS ;
- utiliser d'abord Application Audio Capture, Compressor et Limiter natifs OBS ;
- garder plugin OBS et VST comme pistes futures, pas comme implementation immediate.

A produire :
- docs/obs-stream-safety-setup.md ;
- liens depuis README.md ;
- checklist testeur OBS alignee ;
- product-next-plan.md aligne ;
- .github/project/backlog.csv aligne ;
- CHANGELOG.md mis a jour.

La doc OBS doit couvrir :
- quand utiliser le Hub ;
- quand utiliser OBS ;
- comment ajouter Application Audio Capture pour Brave/Chrome/Discord/Spotify/jeu quand OBS le permet ;
- pourquoi desactiver Desktop Audio global si les apps sont capturees separement ;
- ordre conseille des filtres ;
- reglages de depart Compressor ;
- reglages de depart Limiter ;
- test manuel YouTube, TikTok, Spotify Web, Discord, VLC/jeu ;
- limites honnetes : apps incompatibles, besoin possible d'un cable audio virtuel, extension navigateur separee.

Ne pas :
- developper un plugin OBS maintenant ;
- developper un VST maintenant ;
- promettre que le Hub seul compresse les pics internes ;
- modifier les dossiers generes ;
- creer une release, un tag ou une soumission Store.
```

Validation : docs alignees, backlog GitHub mis a jour, checklist testeur claire. Les tests code ne sont pas obligatoires si le paquet ne change que la documentation, mais relancer `rg`/diff pour verifier les liens et l'ordre.
## Paquet 11 - Microsoft Store Readiness

Statut : pas fait. A faire seulement apres tests reels, validation du zip alpha depuis un dossier propre, stabilisation V1 et OBS Stream Safety Setup.

Objectif : preparer une beta publique Microsoft Store pour reduire la friction SmartScreen sans acheter tout de suite un certificat OV/EV.

```text
Travaille dans D:\Codex\StreamVolume Guard Hybride.

Prepare la readiness Microsoft Store, sans publier ni soumettre l'app.

A verifier/documenter :
- type de package adapte : MSIX ou Win32 Store package ;
- compatibilite WPF/.NET desktop avec Microsoft Store ;
- comportement attendu du bridge local 127.0.0.1:47841 ;
- logs locaux et privacy policy ;
- absence de compte, cloud, telemetrie et audio upload ;
- assets Store : nom, icones, screenshots, description courte/longue ;
- lien support/GitHub et privacy policy publique ;
- extension navigateur separee : Chrome/Brave/Edge ne seront pas installes automatiquement par le Microsoft Store ;
- chemin futur extension : chargement manuel en alpha, puis Chrome Web Store / Edge Add-ons si necessaire ;
- workflow CI/package sans tag, sans GitHub release et sans soumission Store automatique.

Ne pas promettre que Microsoft Store resout tout :
- la validation Store peut refuser ou demander des ajustements ;
- l'extension reste un produit separe ;
- le zip GitHub non signe peut encore afficher SmartScreen ;
- le certificat OV/EV reste l'option pour une distribution hors Store vraiment propre.
```

Validation : docs Store readiness + backlog GitHub + checklist release + CHANGELOG. Pas de soumission Store sans demande explicite.
