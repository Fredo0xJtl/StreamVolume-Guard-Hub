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

Surface de controle : `WindowsSessionVolume`.

### Extension Navigateur

Role : couche fine web.

- Detecte les medias dans les onglets/sites quand le navigateur le permet.
- Identifie des sous-sources comme YouTube, TikTok, Twitch, Spotify Web ou Deezer Web.
- Peut appliquer un gain Web Audio sur une source web controlable.
- Annonce ce qu'elle voit au desktop via `packages/protocol` et le bridge local quand le desktop est lance.

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
- Lit le corps HTTP en octets, borne la taille des requetes et refuse les payloads invalides.
- Accepte seulement les origines extension, `127.0.0.1`, `localhost` ou les outils locaux sans en-tete `Origin`.
- Peut exiger un token local optionnel via `X-StreamVolume-Guard-Token` si `BridgeToken` est defini dans la config locale : `/browser-source`, `/extension-log` et `/global-target` sont proteges, `/health` reste ouvert pour le diagnostic local.

## Etat Actuel

La base actuelle contient le contrat protocole, le modele desktop de sous-source navigateur, une simulation UI, un bridge local `127.0.0.1:47841` durci, un envoi extension `browser_source_observed` testable, un journal unifie local via `extension_log`, et une cible globale desktop lisible par l'extension via `GET /global-target`.

Le comportement attendu est donc : afficher les sessions Windows reelles, afficher les sous-sources navigateur simulees quand aucune extension n'est connectee, recevoir les sous-sources navigateur reelles quand l'extension envoie ses evenements, synchroniser la cible voulue vers les onglets deja proteges, et garder les sources non controlables explicites.

## Regle Anti Mauvaise Surprise

Chaque source affichee doit etre classee avec :

- `origin` : `WindowsSession` ou `BrowserExtension` ;
- `controlSurface` : `WindowsSessionVolume`, `BrowserGain`, `ObserveOnly` ou `Unknown` ;
- `status` : `Safe`, `Risky`, `Low`, `Muted`, `Excluded` ou `Unknown` ;
- `isControllable` : vrai uniquement si une couche peut reellement agir.

Si TikTok, YouTube et Spotify Web sont regroupes dans Chrome par Windows, le desktop doit l'indiquer comme une session Chrome. L'extension apporte le detail par onglet/site quand elle est connectee. Si l'extension ne peut pas controler un site, la source doit rester visible en `ObserveOnly`.

## Anti-Conflit

- L'extension corrige les sous-sources web quand elle a `BrowserGain`.
- Le desktop corrige le volume Windows global seulement quand c'est necessaire.
- Le mode observation reste le premier outil de test pour voir les decisions avant de changer les volumes.
- Les actions manuelles utilisateur gardent la priorite.
- Un changement de cible globale rearme une calibration Windows ponctuelle et rafraichit les onglets navigateur deja proteges.
- Panic reste une action explicite de securite live.

Anti-conflit minimal implemente : quand une sous-source navigateur recente annonce `BrowserGain` et correspond a une session Windows navigateur, le desktop ne corrige pas cette session via `WindowsSessionVolume` pendant cette fenetre. Les logs utilisent `volume.browser_conflict_skip`.

## Ordre De Livraison

Le detail operationnel courant est dans `docs/product-next-plan.md`.

1. Modele et protocole communs.
2. Simulation locale de sous-source navigateur dans le desktop.
3. Bridge local minimal sur `127.0.0.1:47841`.
4. Envoi d'evenements depuis l'extension.
5. Anti-conflit entre gain navigateur et volume Windows.
6. Tests reels multi-sources.
7. Packaging testeur Windows.
8. Calibration OBS plus fine.
