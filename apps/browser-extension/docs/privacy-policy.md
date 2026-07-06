# Politique De Confidentialite - StreamVolume Guard Hub

Derniere mise a jour : 4 juillet 2026

StreamVolume Guard Hub est une app locale Windows accompagnee d'une extension navigateur. Elle aide les streamers a equilibrer les volumes audio du PC sans compte, sans telemetrie, sans tracker et sans envoi automatique de donnees.

## Resume

- Aucun compte utilisateur.
- Aucun cloud obligatoire.
- Aucun tracker.
- Aucune publicite.
- Aucune telemetrie automatique.
- Aucun envoi automatique de logs.
- Aucun enregistrement audio.
- Aucun upload d'audio.
- Aucun historique de navigation collecte.

## Donnees Traitees Localement

Le desktop peut stocker localement :

- le profil de cible volume ;
- l'etat `Auto actif` ;
- les exclusions d'applications ;
- le token bridge optionnel si l'utilisateur le configure ;
- les logs locaux de diagnostic ;
- les snapshots locaux des sessions audio Windows visibles.

Ces donnees restent dans :

```text
%LOCALAPPDATA%\StreamVolumeGuard
```

L'extension peut stocker localement dans le navigateur :

- le profil actif ;
- le volume moyen voulu ;
- le boost maximum ;
- la reduction maximum ;
- l'etat des options audio ;
- les domaines exclus ;
- les domaines en activation automatique ;
- les profils personnalises par domaine ;
- les preferences locales de l'utilisateur ;
- l'etat de liaison avec l'app desktop.

Ces donnees restent dans le stockage local du navigateur via `chrome.storage.local` ou l'equivalent du navigateur.

## Audio

Le desktop agit sur le volume expose par le melangeur Windows pour les sessions audio disponibles. Il ne lit pas et ne stocke pas les echantillons audio.

L'extension peut analyser localement un niveau audio navigateur avec Web Audio ou une capture d'onglet quand le navigateur le permet. Elle peut appliquer un gain local `BrowserGain` seulement quand la source est controlable.

StreamVolume Guard Hub :

- analyse des niveaux audio localement ;
- applique des corrections localement ;
- affiche des diagnostics locaux ;
- ne sauvegarde pas l'audio ;
- n'envoie pas l'audio a un serveur ;
- ne synchronise pas les reglages dans le cloud.

## Bridge Local

Quand le desktop est ouvert, il expose un bridge local sur :

```text
127.0.0.1:47841
```

L'extension peut envoyer au desktop :

- des sous-sources navigateur observees ;
- des etats de calibration ;
- des logs techniques sanitizes ;
- la lecture de cible globale desktop.

Le bridge est limite au loopback local. Les endpoints de donnees peuvent exiger `X-StreamVolume-Guard-Token` si un `BridgeToken` est configure. Le token n'est pas ecrit dans les logs.

## Diagnostics Et Logs

La popup, les options extension et le desktop peuvent afficher ou copier des diagnostics locaux.

Ce diagnostic peut inclure :

- la version de l'app ou de l'extension ;
- le type de navigateur ;
- le domaine actif, sans URL complete ;
- le processus Windows ou l'application audio visible ;
- la surface de controle (`WindowsSessionVolume`, `BrowserGain`, `ObserveOnly`, `Unknown`) ;
- l'etat `isControllable` ;
- les niveaux gain / RMS / peak ;
- les raisons techniques comme `no-signal`, `skipped` ou `insufficient-signal`.

Le diagnostic n'est jamais envoye automatiquement. L'utilisateur doit l'exporter ou le copier volontairement.

Le diagnostic n'inclut pas :

- l'audio ;
- l'historique de navigation ;
- l'URL complete ;
- le titre de page ;
- un compte utilisateur ;
- un jeton d'acces ;
- une adresse e-mail ;
- le contenu de messages Discord ;
- des scenes OBS ;
- le token bridge.

## Permissions Navigateur

L'extension demande les permissions necessaires au test Chromium :

- `activeTab` pour agir sur l'onglet choisi par l'utilisateur ;
- `scripting` pour injecter les scripts de traitement dans l'onglet actif ;
- `storage` pour sauvegarder les reglages localement ;
- `tabCapture` et `offscreen` pour la capture d'onglet Chromium choisie localement par `Proteger l'onglet actif` ;
- `http://127.0.0.1/*` et `http://localhost/*` pour communiquer avec le bridge local.

`optional_host_permissions` permet de demander des permissions de site seulement quand une fonction en a besoin. Safari et Firefox Android ne sont pas fournis dans le package alpha Hub. Firefox desktop reste un chemin de test temporaire.

## Services Tiers

La V1 ne depend d'aucun service tiers pour fonctionner.

Les plateformes comme YouTube, Twitch, TikTok, Kick, Spotify, Deezer, Discord, VLC ou OBS restent responsables de leurs propres traitements et politiques de confidentialite. StreamVolume Guard Hub ne controle pas ces services.

## Publication Open Source

Le code source est lisible et non obfusque. La licence racine du repo est `MIT`. Les testeurs peuvent inspecter le projet, le package testeur et les fichiers de release.

## Contact Et Retours

Pour signaler un bug, utiliser le depot GitHub et les templates d'issue.

Avant de partager un diagnostic, verifier qu'il ne contient pas d'information privee ajoutee manuellement par erreur.
