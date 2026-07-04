# StreamVolume Guard Hub - Package Testeur

Ce dossier sert a tester StreamVolume Guard Hub sans ouvrir la solution Visual Studio.

Version alpha testeur : `v0.1.0-alpha.1`.

Notes detaillees dans le repo source :

```text
docs\release-notes\v0.1.0-alpha.1.md
```

## Lancer L'App

Double-cliquer sur :

```text
Lancer StreamVolume Guard Hub Desktop.cmd
```

Le desktop publie dans ce package est une app Windows locale. Il ne demande pas de compte, ne demarre pas de cloud, ne collecte pas de telemetrie et ne fournit pas de driver audio.

## Charger L'Extension Navigateur

Le dossier a selectionner dans ce package est :

```text
browser-extension
```

### Chrome

1. Ouvrir `chrome://extensions`.
2. Activer le mode developpeur.
3. Cliquer sur `Charger l'extension non empaquetee`.
4. Selectionner le dossier `browser-extension`.
5. Ouvrir le popup StreamVolume Guard Hub et verifier `Mode autonome` ou `App connectee`.

### Brave

1. Ouvrir `brave://extensions`.
2. Activer le mode developpeur.
3. Cliquer sur `Charger l'extension non empaquetee`.
4. Selectionner le dossier `browser-extension`.
5. Ouvrir le popup StreamVolume Guard Hub et verifier `Mode autonome` ou `App connectee`.

### Microsoft Edge

1. Ouvrir `edge://extensions`.
2. Activer le mode developpeur.
3. Cliquer sur `Charger l'extension non empaquetee`.
4. Selectionner le dossier `browser-extension`.
5. Ouvrir le popup StreamVolume Guard Hub et verifier `Mode autonome` ou `App connectee`.

### Firefox Desktop

Firefox est un chemin de test temporaire pour cette alpha. Le manifest courant est MV3 et utilise des APIs qui peuvent differer ou etre refusees selon Firefox.

1. Ouvrir `about:debugging#/runtime/this-firefox`.
2. Cliquer `Charger un module complementaire temporaire`.
3. Selectionner `browser-extension\manifest.json`.
4. Tester le popup si Firefox accepte le manifest.
5. Si Firefox refuse le chargement ou si la capture audio ne fonctionne pas, utiliser Chrome, Brave ou Edge pour l'alpha.

### Safari Et Firefox Android

Safari et Firefox Android ne sont pas fournis dans ce package alpha. Pour cette version, utiliser Chrome, Brave ou Edge pour la validation principale.

L'extension peut detecter des sous-sources web et les envoyer au bridge local `127.0.0.1:47841` quand le desktop est ouvert.

## App, Extension, Ensemble

- Desktop seul : voit les sessions audio Windows, affiche les applications qui produisent du son, applique les profils `Calme`, `Standard`, `Fort`, gere `Auto actif`, exclusions, Panic, snapshots mixer et logs locaux. Il ne peut pas separer deux onglets du meme navigateur si l'extension ne fournit pas de sous-source exploitable.
- Extension seule : detecte les medias web dans le navigateur, indique `Mode autonome` si l'app n'est pas joignable, et peut appliquer `BrowserGain` dans l'onglet/source quand le signal est exploitable. Sinon elle doit afficher `ObserveOnly`, `Unknown`, `skipped` ou un etat de capture lisible.
- Desktop + extension : l'extension envoie les sous-sources et logs au bridge local, le desktop expose la cible globale, et les deux evitent de corriger la meme source en boucle. `BrowserGain` est prioritaire quand il est vraiment controlable et `locked` ; `WindowsSessionVolume` reste le fallback pour les sources non controlables, non verrouillees ou quand l'utilisateur change volontairement de cible.

## Logs Et Config

Logs locaux :

```text
%LOCALAPPDATA%\StreamVolumeGuard\logs
```

Config locale :

```text
%LOCALAPPDATA%\StreamVolumeGuard\config.json
```

Le raccourci `Ouvrir Logs Locaux.cmd` ouvre le dossier de logs si l'app l'a deja cree.

Dans l'app, le bouton `Copier logs` copie un rapport lisible de la session de test courante. Le rapport commence par `# Rapport StreamVolume Guard Hub`, resume la session, les sources, les corrections et les alertes, puis garde les lignes brutes en bas pour debug.

## Limites V1 A Verifier

- `WindowsSessionVolume` : le desktop peut agir sur le volume Windows de l'application.
- `BrowserGain` : l'extension peut analyser environ 12 secondes d'une source web exploitable, ignorer les silences, eviter de booster avant une mesure fiable, attenuer vite un debut dangereux, appliquer un gain dans l'onglet/source, puis verrouiller la calibration pour eviter les corrections en boucle.
- `ObserveOnly` : la source est visible mais l'app ne promet pas de la controler.
- `Unknown` : la source n'est pas encore classee de facon fiable.

En V1 actuelle, plusieurs sons dans le meme navigateur bougent ensemble quand le controle passe par le volume Windows global du navigateur. Ce n'est pas un bug : pour separer musique et video, utiliser deux applications Windows distinctes quand c'est possible, ou verifier si l'extension arrive a exposer une sous-source `BrowserGain` vraiment controlable.

La calibration `BrowserGain` prioritaire est testable : quand une sous-source navigateur est `BrowserGain`, controlable et avec signal exploitable, l'extension doit rester en `measuring` pendant la fenetre robuste, puis passer en `locked`. Pendant `measuring`, `no-signal`, `ObserveOnly`, `Unknown` ou `skipped`, le fallback attendu reste le volume Windows global du navigateur. Apres un changement volontaire de cible, un mouvement Windows ponctuel avec `reason=windows-fast-target` est normal ; ce qui ne doit pas arriver, c'est une boucle de corrections continues.

Le slider personnalise descend jusqu'a environ 15% du melangeur Windows. Les corrections Auto, meme `safety-spike`, ne doivent pas passer sous la cible active : environ 40% en `Calme`, 70% en `Standard`, 100% en `Fort`, ou 15% au minimum personnalise. `Panic` reste l'action d'urgence separee.

OBS reste une verification visuelle manuelle : StreamVolume Guard Hub ne pretend pas lire les scenes ou les meters internes OBS dans cette version.

## Ordre De Test Court

1. Lancer le desktop.
2. Charger l'extension.
3. Tester YouTube seul.
4. Mettre pause.
5. Tester TikTok seul.
6. Mettre pause.
7. Tester Spotify Web ou Deezer Web seul.
8. Tester VLC ou Spotify desktop.
9. Tester Discord.
10. Ouvrir OBS et observer ses meters manuellement.

Pour une campagne complete, lire `CHECKLIST-COMPLETE.md`.
