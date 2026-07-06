# Architecture Hybride - StreamVolume Guard Hub

StreamVolume Guard Hub vise a equilibrer toutes les sources audio disponibles sans cacher les limites techniques.

La strategie n'est pas de promettre un controle magique de tout le son physique du PC. La strategie est de couvrir deux surfaces complementaires et de rendre visible ce qui reste non controlable.

## Couches

### Desktop Windows

Role : couche globale PC.

- Detecte les peripheriques de sortie et sessions audio Windows.
- Affiche les applications exposees par Windows : navigateur, Spotify desktop, Discord, VLC, jeux, etc.
- Controle le volume de session Windows quand l'API le permet.
- Marque les sessions inconnues ou non controlables au lieu de les masquer.
- Heberge le bridge local `127.0.0.1:47841` quand l'app est lancee.
- Reste utilisable seule et affiche clairement quand aucune extension n'a ete vue recemment.

Surface de controle : `WindowsSessionVolume`.

### Extension Navigateur

Role : couche fine web.

- Detecte les medias dans les onglets/sites quand le navigateur le permet.
- Identifie des sous-sources comme YouTube, TikTok, Twitch, Spotify Web ou Deezer Web.
- Peut appliquer un gain Web Audio sur une source web controlable.
- Annonce ce qu'elle voit au desktop via `packages/protocol` et le bridge local quand le desktop est lance.
- Reste utilisable seule et affiche `Mode autonome` si le desktop ne repond pas au health check local.

Surface de controle : `BrowserGain` quand Web Audio ou capture d'onglet permet d'agir, sinon `ObserveOnly`.

### Protocol

Role : contrat commun.

- Definit les messages JSON locaux entre extension, desktop et bridge.
- Force chaque source a declarer son origine et sa surface de controle.
- Ne transporte pas d'audio brut, d'historique ou de telemetrie.

Dossier : `packages/protocol`.

### Bridge Local

Role : transport local.

- Ecoute uniquement sur `127.0.0.1:47841` dans la version testable.
- Recoit des evenements extension lisibles sur `POST /browser-source`.
- Recoit des logs extension sanitizes sur `POST /extension-log` pour alimenter le journal local desktop.
- Expose `GET /health` pour verifier que le desktop ecoute.
- Expose `GET /global-target` pour partager la cible voulue du desktop avec l'extension.
- Refuse les messages invalides et journalise les erreurs.
- Ne casse pas le desktop quand aucune extension n'est connectee.
- Ne casse pas l'extension quand le desktop est ferme : le popup detecte simplement que l'app est absente et continue en mode autonome.
- Lit le corps HTTP en octets, borne la taille des requetes et refuse les payloads invalides.
- Accepte seulement les origines extension, `127.0.0.1`, `localhost` ou les outils locaux sans en-tete `Origin`.
- Peut exiger un token local optionnel via `X-StreamVolume-Guard-Token` si `BridgeToken` est defini dans la config locale : `/browser-source`, `/extension-log` et `/global-target` sont proteges, `/health` reste ouvert pour le diagnostic local.

## Etat Actuel

La base actuelle contient le contrat protocole, le modele desktop de sous-source navigateur, une simulation UI, un bridge local `127.0.0.1:47841` durci, un envoi extension `browser_source_observed` testable, un journal unifie local via `extension_log`, une segmentation de logs par `runId` et `testSessionId`, une cible globale desktop lisible par l'extension via `GET /global-target`, un statut de liaison visible des deux cotes, et une calibration `BrowserGain` prioritaire quand une vraie source navigateur est controlable.

Le comportement attendu est donc : afficher les sessions Windows reelles, afficher les sous-sources navigateur simulees quand aucune extension n'est connectee, recevoir les sous-sources navigateur reelles quand l'extension envoie ses evenements, synchroniser la cible voulue vers les onglets deja proteges, afficher `App seule` ou `Extension connectee` cote desktop, afficher `Mode autonome` ou `App connectee` cote extension, et garder les sources non controlables explicites.

Le protocole transporte les informations necessaires a une calibration navigateur fine : `currentLevel`, `appliedGain`, `targetRmsDb`, `targetProfile`, `controlSurface`, `isControllable`, `calibrationState`, `measuredRmsDb`, `appliedGainDb`, `calibrationReason` et `captureSignalState`. Quand une source navigateur est `BrowserGain` avec un signal exploitable, l'extension peut mesurer, appliquer un gain une fois, verrouiller, puis rearmer proprement. Sur Chromium, la protection d'un onglet commence par `media-html` quand un lecteur web est accessible, puis peut tenter `tabCapture` generiquement si le media HTML reste muet alors que l'onglet est audible. Le desktop evite alors les corrections automatiques concurrentes du volume Windows global du meme navigateur, sauf changement volontaire de cible ou fallback necessaire avant verrouillage.

## Fonctionnement Seul Ou Ensemble

### Desktop seul

- Fonctionne sans extension.
- Observe les sessions audio Windows et controle `WindowsSessionVolume`.
- Gere `Auto actif`, profils de cible, exclusions, Panic, logs et snapshots locaux.
- Regroupe les sons systeme Windows en source speciale : protection contre les pics, sans boost automatique.
- Affiche `App seule` tant qu'aucune source ou log extension recent n'a ete recu.
- Limite : si plusieurs onglets jouent dans le meme navigateur, Windows expose surtout une seule session navigateur.

### Extension seule

- Fonctionne sans desktop et affiche `Mode autonome`.
- Detecte et protege les medias web quand le navigateur le permet.
- Peut appliquer `BrowserGain` dans l'onglet/site si la source est controlable.
- Classe honnetement en `ObserveOnly` ou `Unknown` quand elle ne peut pas agir, avec `needs-user-action`, `restricted`, `unsupported`, `no-signal` ou `skipped` quand c'est la vraie raison.
- N'envoie pas d'audio brut, d'URL complete, d'historique navigateur ou de telemetrie.

### Desktop + extension

- Le desktop heberge le bridge local `127.0.0.1:47841`.
- L'extension lit `GET /health` et `GET /global-target`.
- L'extension envoie `browser_source_observed` et `extension_log` au desktop.
- Le desktop affiche `Extension connectee` apres reception recente.
- Si `BrowserGain` est exploitable et `locked`, l'extension est prioritaire pour la sous-source navigateur.
- Si la source web est encore `measuring`, `ObserveOnly`, `Unknown`, `skipped`, silencieuse ou inexploitable, le desktop peut utiliser le fallback `WindowsSessionVolume` du navigateur quand c'est coherent.

## Regle Anti Mauvaise Surprise

Chaque source affichee doit etre classee avec :

- `origin` : `WindowsSession` ou `BrowserExtension` ;
- `controlSurface` : `WindowsSessionVolume`, `BrowserGain`, `ObserveOnly` ou `Unknown` ;
- `status` : `Safe`, `Risky`, `Low`, `Muted`, `Excluded` ou `Unknown` ;
- `isControllable` : vrai uniquement si une couche peut reellement agir.

Si TikTok, YouTube et Spotify Web sont regroupes dans Chrome par Windows, le desktop doit l'indiquer comme une session Chrome. L'extension apporte le detail par onglet/site quand elle est connectee. Si l'extension ne peut pas controler un site, la source doit rester visible en `ObserveOnly`.

## Anti-Conflit

- `BrowserGain` est prioritaire quand une source navigateur est controlable, fournit un signal exploitable et a atteint `calibrationState=locked`.
- Le fallback `WindowsSessionVolume` reste disponible quand une seule page web joue, quand l'extension ne peut pas agir proprement, ou quand la cible vient d'etre changee volontairement et doit etre effective rapidement.
- Le mode observation reste le premier outil de test pour voir les decisions avant de changer les volumes.
- Les actions manuelles utilisateur gardent la priorite.
- Les sons systeme Windows peuvent etre baisses pour proteger le live, mais ne sont pas remontes automatiquement comme une source musicale ou video.
- Un changement de cible globale rearme une calibration Windows ponctuelle, puis rafraichit les onglets navigateur deja proteges. Cote desktop, ce changement peut appliquer immediatement un fallback `WindowsSessionVolume` visible. Cote navigateur, une source `BrowserGain` deja verrouillee recalcule immediatement son gain depuis la mesure fiable existante ; une source encore en mesure ou non fiable garde la fenetre robuste avant tout boost.
- Panic reste une action explicite de securite live.

Mode implemente : `BrowserGainPriority` bloque la correction automatique de la session Windows navigateur correspondante uniquement quand une sous-source recente est controlable par l'extension et `calibrationState=locked`. Les logs utilisent `volume.browser_conflict_skip` pour ce blocage. Si la source est encore `measuring`, repasse `ObserveOnly`, `Unknown`, disparait ou ne fournit plus de niveau exploitable, le fallback Windows global peut reprendre. Un changement volontaire de cible utilise le reason `windows-fast-target` pour rendre l'action visible rapidement.

## Ordre De Livraison

Le detail testable public est dans `docs/tester-checklist.md` et l'etat de livraison reste resume dans `README.md` et `CHANGELOG.md`.

1. Modele et protocole communs.
2. Simulation locale de sous-source navigateur dans le desktop.
3. Bridge local minimal sur `127.0.0.1:47841`.
4. Envoi d'evenements depuis l'extension.
5. Anti-conflit entre gain navigateur et volume Windows.
6. Tests reels multi-sources.
7. Packaging testeur Windows.
8. Calibration OBS plus fine.
