# Plan Produit Courant - StreamVolume Guard Hub

Ce document est la source de verite pour la suite immediate du projet hybride.

## Objectif

Faire fonctionner StreamVolume Guard Hub comme un produit hybride local capable de couvrir :

- les applications Windows via sessions audio Windows ;
- les sous-sources navigateur via extension et bridge local quand possible ;
- les sources non controlables en affichage honnete `ObserveOnly` ou `Unknown`.

Le produit ne doit jamais cacher qu'une source est observee mais non controlable.

## Definition De Couverture

Une source est correctement couverte seulement si l'interface et les logs indiquent :

- son origine : `WindowsSession` ou `BrowserExtension` ;
- sa surface de controle : `WindowsSessionVolume`, `BrowserGain`, `ObserveOnly` ou `Unknown` ;
- son statut : `Safe`, `Risky`, `Low`, `Muted`, `Excluded` ou `Unknown` ;
- sa controlabilite reelle : `isControllable`.
- son bucket de couverture visible : `Direct`, `Fallback Windows`, `Action requise`, `Limite` ou `Inconnu`.

## Etat Actuel

Fait :

- monorepo hybride propre ;
- protocole `browser_source_observed` valide par tests ;
- modele desktop de sous-source navigateur ;
- panneau desktop de sous-sources navigateur ;
- simulation locale YouTube, TikTok et Spotify Web ;
- logs locaux pour les sources navigateur simulees et reelles ;
- bridge local desktop `127.0.0.1:47841` ;
- endpoint `GET /health` ;
- endpoint `POST /browser-source` ;
- endpoint `POST /extension-log` ;
- bridge local durci : parsing HTTP en octets, limites de taille, Origin allowlist et token local optionnel sur les endpoints de donnees ;
- reception desktop de `browser_source_observed` ;
- reception desktop de `extension_log` dans le meme journal local que les evenements app ;
- envoi extension generique `media-html` prioritaire, avec upgrade `tab-capture` si le chemin HTML reste muet ou introuvable alors que l'onglet est audible, vers le bridge local sans URL complete ni audio brut ;
- anti-conflit minimal entre `BrowserGain` et `WindowsSessionVolume` pour les sessions navigateur correspondantes ;
- validation stricte du champ `isControllable` dans le protocole, l'extension et le parser desktop ;
- affichage de la controlabilite dans les listes Windows et navigateur ;
- affichage desktop d'une `Raison` et d'une `Action` quand une sous-source navigateur reste `ObserveOnly`, `Unknown`, `skipped` ou `no-signal`, alimente par `browserState`, `reason` et `recommendedAction` ;
- monitor desktop `Sortie globale` en lecture seule : RMS, pic, pic recent, etat `Safe` / `Risky` / `Silent` / `Unknown`, peripherique de sortie et logs `global_output.*` sans audio brut ;
- dashboard desktop `Couverture` avec score securisable, colonnes `Couverture` / `Action couverture`, logs `coverage.*` et section `Couverture` dans le rapport copie ;
- etats navigateur explicites `needs-user-action`, `restricted` et `unsupported` pour ne pas masquer les cas ou `BrowserGain` direct n'est pas disponible ;
- popup extension stable en mode autonome : si le desktop est ferme et qu'une source web n'est pas controlable directement, le bouton reste actif en observation et le diagnostic garde la limite en raison standalone au lieu de boucler actif/inactif ou d'annoncer un fallback Windows indisponible ;
- diagnostic extension plus lisible sur les lecteurs web detectes mais non traites : `skippedAlreadyProcessed` est expose et les marqueurs `processed` orphelins sont nettoyes avant retry ;
- config locale JSON pour restaurer `Auto actif`, les exclusions et le token optionnel du bridge ;
- cible globale persistante exposee par `GET /global-target`, avec synchro extension pour les onglets deja proteges et controle token si `BridgeToken` est defini ;
- logs extension sanitizes pour la synchro de cible et les etats `tabCapture` utiles, sans URL complete ni dump console.

Pas encore fait :

- campagne de tests reels multi-sources ;
- validation manuelle du package testeur Windows depuis un dossier propre ;
- lecture automatique des scenes ou meters OBS.
- OBS Stream Safety Setup documente et teste.

## Ordre De Suite

### Etape A - Source De Verite Documentaire

Fait : les documents actifs decrivent la strategie hybride actuelle. Les anciens plans restent archives.

### Etape B - Bridge Local Durci

Fait en version testable : le desktop ecoute `127.0.0.1:47841`, accepte `POST /browser-source`, accepte `POST /extension-log`, expose `GET /health`, expose `GET /global-target`, refuse les messages invalides, exige un `isControllable` coherent avec `controlSurface`, lit le corps HTTP en octets, borne les payloads, filtre les origines et peut exiger un token local optionnel sur `/browser-source`, `/extension-log` et `/global-target`.

### Etape C - Extension Envoie `browser_source_observed`

Fait en version testable : l'extension commence par `media-html` quand l'utilisateur protege l'onglet, afin de retrouver le comportement stable de l'ancien projet sur les lecteurs web accessibles. Elle peut ensuite tenter `tab-capture` generiquement si le chemin HTML reste muet ou introuvable alors que l'onglet est audible, meme en mode extension seule. Si cette capture ne donne pas de signal exploitable, elle reste en observation claire au lieu d'annoncer un controle direct fictif ou un fallback Windows indisponible. Elle annonce les sous-sources avec `origin=BrowserExtension`, `controlSurface`, `isControllable`, niveau approximatif, statut, `captureSignalState` et identifiant stable, sans envoyer d'URL complete ni d'audio brut.

### Etape D - Desktop Affiche Les Vraies Sous-Sources Navigateur

Fait en version testable : le desktop ajoute ou met a jour les sous-sources navigateur recues du bridge, affiche leur controlabilite, sans casser le mode simulation quand aucune extension n'est connectee.

### Etape E - Anti-Conflit

Fait en version testable : si une sous-source navigateur recente est controlee par `BrowserGain`, le desktop saute la correction automatique `WindowsSessionVolume` de la session Windows correspondante et logge `volume.browser_conflict_skip`. Les alias de navigateurs Chromium comme Brave, Chrome et Edge sont couverts pour eviter le double controle quand l'extension annonce un process generique.

### Etape E2 - Stabilisation Auto Desktop

Fait en version testable : `Auto actif` applique une correction Windows ponctuelle par source active, puis verrouille cette source pour eviter les mouvements continus de volume pendant la lecture. Le verrou se rearme apres silence durable, disparition de session, ou changement de cible globale. Les skips sont visibles avec `volume.auto_locked`.

### Etape E3 - Dashboard Couverture

Fait en version testable : le desktop classe les sources en `Direct`, `Fallback Windows`, `Action requise`, `Limite` ou `Inconnu`. Le score `Couverture` evite de compter deux fois un onglet navigateur et son parent Windows quand ils representent le meme chemin de fallback. Les evenements `coverage.summary.updated`, `coverage.source.classified`, `coverage.source.action_required`, `coverage.source.fallback_available` et `coverage.source.limited` alimentent aussi le rapport lisible `Copier logs`.

### Etape E4 - Source Inconnue Active

Fait en version testable : `Sortie globale` detecte maintenant le cas ou le mix Windows est actif alors qu'aucune source Windows ou navigateur connue ne montre d'activite. L'app affiche une alerte lisible, logge `global_output.unknown_active`, puis `global_output.unknown_active.resolved` quand une source connue explique a nouveau le signal ou quand la sortie globale n'est plus active.

### Etape E5 - Test Guide, Stream Safe, OBS Guide

Fait en version testable : le desktop expose `Stream Safe`, un mode test guide par etapes et un `Guide OBS`. `Stream Safe` active Auto et revient a la cible Standard sans ajouter de boucle de correction. Le guide journalise `guided_test.started`, `guided_test.step`, `guided_test.completed` et `obs.guide.opened`.

### Etape F - Tests Reels

En cours. Etat reel precedent : YouTube et Spotify Web avaient des chemins `media-html` qui appliquaient mieux la cible dB dans l'ancien projet, et TikTok avait ete vu en `tab-capture-no-signal` avec fallback Windows global. Apres le retour `media-html` prioritaire, YouTube, TikTok et Spotify Web doivent etre retestes : le premier chemin attendu est `media-html` quand un lecteur HTML est accessible, puis `tabCapture` comme upgrade generique si le signal HTML reste muet ou introuvable alors que l'onglet est audible. En mode extension seule, `0.1.27` autorise cette tentative `tabCapture` sans app desktop ; si elle donne un vrai signal, la cible dB doit agir, sinon le diagnostic doit rester honnete avec `browserState=tab-capture-no-signal`, `captureFallbackReason=tab-capture-no-signal`, `mediaHtmlFallbackReason` reserve a la limite HTML, `reason`, `recommendedAction` et `ObserveOnly`. Si `media-html` termine en `no-media-element-detected`, le diagnostic standalone doit exposer `mediaHtmlFallbackReason`, `tabAudible` et `tabActive`. Avec desktop connecte, le fallback Windows peut etre clairement explique. Les refreshs de reglages et changements de cible dB ne doivent plus repasser l'onglet protege en `enabled=false`; seul Stop utilisateur ou exclusion doit couper l'onglet. Le fallback explicite doit rester honnete sans etre declenche immediatement pendant la courte phase de detection. Spotify Web doit etre reteste en `0.1.27` avec `site=open.spotify.com`, `enabled=true`, `tabAudible=true`, puis soit `mediaProcessed>0` et gain direct, soit `sourceType=tab-capture` et `captureSignalState=signal` pour que la cible dB baisse le son.

Suite de test : utiliser `Demarrer guide`, puis Spotify Web, Discord, VLC, OBS visible, puis combinaison simultanee. Verifier que les sources observees mais non controlables restent honnetes, que les colonnes `Raison` / `Action` expliquent le fallback, que le popup extension ne reboucle pas actif/inactif quand le desktop est ferme, que les sessions Windows ne bougent plus en boucle apres la premiere correction Auto, que `Stream Safe` revient a Auto + Standard, et que `Sortie globale` suit le mix final sans modifier le volume master. Si `global_output.unknown_active` apparait, chercher une source Windows/OBS/systeme non expliquee.

### Etape G - Packaging Testeur Windows

Fait en version alpha locale : `tools/package-tester.ps1` publie le desktop en self-contained `win-x64`, copie l'extension, ajoute README/checklists/launcher/logs shortcut/licence et genere `artifacts\tester\StreamVolumeGuardHub-Tester-v0.1.0-alpha.1.zip` avec checksum SHA256. Reste a valider manuellement ce package depuis un dossier propre. Le zip GitHub non signe peut encore afficher SmartScreen.

### Etape H - Stabilisation V1

Pas fait. A faire apres les tests reels et la validation du zip alpha depuis un dossier propre. Objectif : corriger les bugs bloquants, garder les limites navigateur visibles, confirmer que l'UI reste comprehensible, et ne pas declarer V1 stable tant que YouTube, TikTok, Spotify Web, Discord, VLC et OBS n'ont pas ete traites clairement.

### Etape I - OBS Stream Safety Setup

Fait en version guide initiale : la doc `docs/obs-stream-safety-setup.md` existe et le desktop expose `Guide OBS`. Reste a valider en reel avec OBS ouvert, meters visibles, Application Audio Capture quand possible, Compressor et Limiter. Ne pas developper de plugin OBS ou VST tant que cette configuration manuelle n'a pas ete testee.

### Etape J - Microsoft Store Readiness

Pas fait. A preparer apres stabilisation V1 et OBS Stream Safety Setup : package Microsoft Store, assets, privacy, support, validation, et documentation du fait que l'extension navigateur reste separee. Objectif : beta publique avec moins de friction SmartScreen sans acheter immediatement un certificat OV/EV. Ne pas soumettre au Store sans demande explicite.

## Decisions Actuelles

- Le bridge local est implemente, durci et testable.
- Les sites web ne doivent pas etre traites par patchs cibles dans le moteur desktop.
- Les cas non controlables doivent rester visibles.
- L'Auto desktop est volontairement prudent : une correction par source active, puis verrou jusqu'a silence durable ou disparition.
- OBS reste une securite finale guidee manuellement : Application Audio Capture, Compressor et Limiter avant tout plugin ou VST. Le desktop fournit maintenant un guide integre, mais ne lit toujours pas automatiquement les scenes ou meters OBS.
- `Sortie globale` sert de mesure locale du mix final Windows, pas de compresseur global ni de controle master.
- Priorite actuelle : tests reels guides, validation zip propre, stabilisation V1, diagnostic local si necessaire, puis Microsoft Store readiness.
- Pour eviter les couts de certificat au debut, le chemin beta publique prefere est Microsoft Store readiness avant achat OV/EV.

## Maintenance Continue

- Apres chaque implementation, `docs/implementation-prompts.md`, `docs/product-next-plan.md`, les checklists utiles et `CHANGELOG.md` doivent etre recalibres si la suite change.
