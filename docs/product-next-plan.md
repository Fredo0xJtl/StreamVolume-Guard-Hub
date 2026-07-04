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
- envoi extension generique `media-html` et `tab-capture` vers le bridge local sans URL complete ni audio brut ;
- anti-conflit minimal entre `BrowserGain` et `WindowsSessionVolume` pour les sessions navigateur correspondantes ;
- validation stricte du champ `isControllable` dans le protocole, l'extension et le parser desktop ;
- affichage de la controlabilite dans les listes Windows et navigateur ;
- config locale JSON pour restaurer `Auto actif`, les exclusions et le token optionnel du bridge ;
- cible globale persistante exposee par `GET /global-target`, avec synchro extension pour les onglets deja proteges et controle token si `BridgeToken` est defini ;
- logs extension sanitizes pour la synchro de cible et les etats `tabCapture` utiles, sans URL complete ni dump console.

Pas encore fait :

- campagne de tests reels multi-sources ;
- validation manuelle du package testeur Windows depuis un dossier propre ;
- lecture automatique des scenes ou meters OBS.

## Ordre De Suite

### Etape A - Source De Verite Documentaire

Fait : les documents actifs decrivent la strategie hybride actuelle. Les anciens plans restent archives.

### Etape B - Bridge Local Durci

Fait en version testable : le desktop ecoute `127.0.0.1:47841`, accepte `POST /browser-source`, accepte `POST /extension-log`, expose `GET /health`, expose `GET /global-target`, refuse les messages invalides, exige un `isControllable` coherent avec `controlSurface`, lit le corps HTTP en octets, borne les payloads, filtre les origines et peut exiger un token local optionnel sur `/browser-source`, `/extension-log` et `/global-target`.

### Etape C - Extension Envoie `browser_source_observed`

Fait en version testable : l'extension annonce les medias detectes en `media-html` et les captures d'onglet en `tab-capture` avec `origin=BrowserExtension`, `controlSurface`, `isControllable`, niveau approximatif, statut et identifiant stable, sans envoyer d'URL complete ni d'audio brut.

### Etape D - Desktop Affiche Les Vraies Sous-Sources Navigateur

Fait en version testable : le desktop ajoute ou met a jour les sous-sources navigateur recues du bridge, affiche leur controlabilite, sans casser le mode simulation quand aucune extension n'est connectee.

### Etape E - Anti-Conflit

Fait en version testable : si une sous-source navigateur recente est controlee par `BrowserGain`, le desktop saute la correction automatique `WindowsSessionVolume` de la session Windows correspondante et logge `volume.browser_conflict_skip`. Les alias de navigateurs Chromium comme Brave, Chrome et Edge sont couverts pour eviter le double controle quand l'extension annonce un process generique.

### Etape E2 - Stabilisation Auto Desktop

Fait en version testable : `Auto actif` applique une correction Windows ponctuelle par source active, puis verrouille cette source pour eviter les mouvements continus de volume pendant la lecture. Le verrou se rearme apres silence durable, disparition de session, ou changement de cible globale. Les skips sont visibles avec `volume.auto_locked`.

### Etape F - Tests Reels

Tester dans cet ordre : YouTube, TikTok, Spotify Web, Discord, VLC, OBS visible, puis combinaison simultanee. Verifier que les sources observees mais non controlables restent honnetes, et que les sessions Windows ne bougent plus en boucle apres la premiere correction Auto.

### Etape G - Packaging Testeur Windows

Fait en version alpha locale : `tools/package-tester.ps1` publie le desktop, copie l'extension, ajoute README/checklists/launcher/logs shortcut et genere `artifacts\tester\StreamVolumeGuardHub-Tester-v0.1.0-alpha.1.zip`. Reste a valider manuellement ce package depuis un dossier propre.

## Decisions Actuelles

- Le bridge local est implemente, durci et testable.
- Les sites web ne doivent pas etre traites par patchs cibles dans le moteur desktop.
- Les cas non controlables doivent rester visibles.
- L'Auto desktop est volontairement prudent : une correction par source active, puis verrou jusqu'a silence durable ou disparition.
- OBS reste d'abord une verification visuelle manuelle, pas une integration automatique.

## Maintenance Continue

- Apres chaque implementation, `docs/implementation-prompts.md`, `docs/product-next-plan.md`, les checklists utiles et `CHANGELOG.md` doivent etre recalibres si la suite change.
