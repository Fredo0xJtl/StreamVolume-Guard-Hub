# StreamVolume Guard Hub

Hub audio local Windows pour streamers : mixeur intelligent par application, extension navigateur, bridge local, sans driver, sans compte, sans telemetrie.

StreamVolume Guard Hub regroupe la version desktop Windows et l'extension navigateur dans un seul dossier propre, sans melanger leurs codes.

## Objectif

Construire une version hybride locale pour streamers :

- `apps/desktop` controle les sessions audio Windows comme un melangeur intelligent ;
- `apps/browser-extension` sert de base pour identifier et equilibrer les sous-sources web comme YouTube, TikTok ou Spotify Web quand le navigateur le permet ;
- `packages/protocol` definit le contrat entre desktop, extension et bridge local ;
- `docs` garde les decisions produit, checklists et specs ;
- `tools` contient les scripts utiles de lancement, build et packaging local.

## Structure

```text
apps/
  desktop/              App Windows .NET/WPF
  browser-extension/    Extension navigateur MV3 reprise de l'ancien projet
packages/
  protocol/             Contrat desktop <-> extension <-> bridge local
docs/                   Specs, plans, checklists
tools/                  Scripts utiles
.github/                CI, templates GitHub, source du project board
```

## Architecture Hybride

La regle produit est simple : toute source disponible doit etre classee par origine et surface de controle. Windows couvre les applications exposees comme sessions audio ; l'extension couvre les sous-sources navigateur quand elle peut agir dans l'onglet/site. Les sources observees mais non controlables restent visibles.

Voir : `docs/hybrid-architecture.md`.

## App, Extension, Ensemble

**App desktop seule** : voit les sessions audio Windows, affiche les applications qui produisent du son, permet le controle manuel, applique les profils `Calme`/`Standard`/`Fort` sur le melangeur Windows, gere `Auto actif`, exclusions, Panic, logs locaux et snapshots de diagnostic. Elle peut equilibrer Brave, Firefox, VLC, Discord ou Spotify desktop au niveau application, mais elle ne peut pas separer deux onglets dans le meme navigateur sans l'extension.

**Extension seule** : voit les medias web dans le navigateur quand le site et le navigateur le permettent, protege un onglet, mesure le niveau, applique `BrowserGain` si la source est controlable, ou affiche `ObserveOnly`/`Unknown` si elle ne peut pas agir. Elle reste utilisable en `Mode autonome`, sans compte, sans cloud et sans envoyer d'audio brut.

**App + extension via bridge local** : le desktop expose la cible et l'etat via `127.0.0.1:47841`, l'extension envoie les sous-sources et logs sanitizes, et les deux evitent de se battre. Si une source navigateur est vraiment controlable par `BrowserGain` et `locked`, l'extension devient prioritaire pour les corrections automatiques fines ; sinon le desktop peut revenir au volume Windows global du navigateur, surtout quand une seule page joue. Un changement volontaire de cible peut aussi appliquer un fallback Windows rapide pour que l'action soit effective tout de suite.

## Source De Verite

- Vision hybride : `docs/hybrid-architecture.md`
- Cahier couche desktop : `docs/desktop-v1-cahier-des-charges.md`
- Checklist testeur : `docs/tester-checklist.md`
- Protocole commun : `packages/protocol/README.md`
- GitHub Project : `.github/project/README.md`

Etat actuel : le protocole, la simulation navigateur, le bridge local durci `127.0.0.1:47841`, l'envoi reel depuis l'extension, la lecture `GET /global-target`, le journal unifie local via `POST /extension-log`, les logs groupes par `runId` et `testSessionId`, le rapport lisible copiable depuis `Copier logs`, la validation stricte `isControllable`, la config locale Auto/exclusions/cible/token bridge optionnel, l'affichage de la controlabilite, le statut de liaison app-extension, le verrou de calibration automatique one-shot, la calibration navigateur `BrowserGain` prioritaire et le packaging testeur Windows reproductible sont testables. Si `BridgeToken` est defini, les endpoints de donnees `/browser-source`, `/extension-log` et `/global-target` exigent `X-StreamVolume-Guard-Token`, tandis que `/health` reste ouvert pour le diagnostic local et le mode autonome de l'extension. Le protocole transporte `currentLevel`, `appliedGain`, `targetRmsDb`, `targetProfile`, `controlSurface`, `isControllable`, `calibrationState`, `measuredRmsDb` et `appliedGainDb`. Quand une source navigateur est vraiment controlable, l'extension analyse environ 12 secondes, demande assez de signal utile hors silence, evite de booster avant mesure fiable, peut attenuer vite un debut dangereux, applique ensuite un gain une fois et verrouille la source. Le desktop evite alors les corrections automatiques concurrentes du volume Windows global, mais garde un fallback immediat pour les changements volontaires de cible ou les etats `measuring`, `ObserveOnly`, `Unknown`, silencieux ou inexploitable.

## GitHub Project

Les fichiers de base pour l'onglet GitHub Projects sont dans :

```text
.github/project/
```

Ils decrivent le board recommande, les labels, le backlog importable et la checklist de pre-release. A chaque changement produit, test reel, packaging ou release, mettre a jour `.github/project/backlog.csv` et `.github/project/release-checklist.md` en meme temps que le `CHANGELOG.md`.

## Lancer Le Desktop

Double-cliquer sur :

```text
Lancer StreamVolume Guard Hub Desktop.cmd
```

Ou compiler puis lancer en PowerShell :

```powershell
dotnet build "apps\desktop\src\StreamVolumeGuard.App\StreamVolumeGuard.App.csproj" -nr:false
& "apps\desktop\src\StreamVolumeGuard.App\bin\Debug\net8.0-windows\StreamVolumeGuard.App.exe"
```

Au premier lancement, le desktop demarre en mode observation. Ensuite, l'etat `Auto actif`, la cible voulue et les exclusions sont restaures depuis `%LOCALAPPDATA%\StreamVolumeGuard\config.json`.

Quand `Auto actif` est active, le desktop applique une correction automatique par source active, puis verrouille cette source pour eviter de bouger le volume en continu pendant la lecture. Les profils pilotent directement le volume du melangeur Windows : `Calme` vise environ 40%, `Standard` environ 70%, et `Fort` environ 100%. Le verrou se rearme apres silence durable, disparition de la session, ou changement de cible globale.

Le slider personnalise peut descendre jusqu'a environ 15% du melangeur Windows. Les corrections Auto, y compris `safety-spike`, ne descendent pas sous la cible active : environ 40% en `Calme`, 70% en `Standard`, 100% en `Fort`, ou 15% au minimum personnalise. `Panic` reste l'action d'urgence separee.

`Sons systeme Windows` est traite comme une source speciale anti-pic : l'app peut le baisser avec Auto/Panic s'il devient trop fort, mais elle ne le remonte pas automatiquement avec `Standard` ou `Fort`. Les notifications et alertes courtes restent donc visibles dans le diagnostic sans etre boostees inutilement.

## Package Testeur Windows

Pour generer un dossier testeur sans demander d'ouvrir la solution `.sln` :

```powershell
powershell -ExecutionPolicy Bypass -File "tools\package-tester.ps1"
```

Le package est genere dans :

```text
artifacts\tester\StreamVolumeGuardHub-Tester
```

Ce dossier contient le desktop publie, l'extension navigateur a charger en mode developpeur, un launcher, un raccourci logs, un README court et une checklist courte. `artifacts/` reste un dossier genere ignore par Git.

## Limite V1 Navigateur

En controle Windows global, un navigateur compte comme une seule source audio. Si une musique de fond et une video jouent dans le meme Firefox/Brave/Chrome sans `BrowserGain` exploitable, le slider Windows du navigateur bouge les deux ensemble. Pour garder la musique plus forte ou plus stable qu'une video web, utiliser si possible deux sources Windows separees, par exemple Spotify desktop ou VLC pour la musique et le navigateur pour la video. Une source exclue reste en controle manuel via son slider dans l'app ; les autres sources non exclues peuvent rester gerees par `Auto actif`.

Le controle fin par onglet depend du navigateur et du site. Quand l'extension annonce une source `BrowserGain` avec un niveau exploitable et `Calibration=locked`, elle devient prioritaire pour cette sous-source navigateur. Si la source reste `measuring`, `ObserveOnly` ou `Unknown`, l'app doit l'afficher honnetement et revenir au controle Windows global seulement quand c'est acceptable, notamment quand une seule page web joue ou quand l'utilisateur vient de changer la cible.

## Regle Importante

Ne pas recoller desktop et extension dans le meme code. La bonne architecture est hybride, pas fusionnee : chaque app garde son role, et le partage passe par `packages/protocol`.

## Maintenabilite

Le projet doit pouvoir etre repris sans connaitre l'historique des conversations. Avant d'ajouter une grosse fonction, verifier que le changement garde des responsabilites separees, des tests localisables et des documents publics a jour.

## Fichiers Generes Non Sources

Ne pas remettre dans ce repo propre :

- `bin/`
- `obj/`
- `dist/`
- `build/`
- `out/`
- `release-assets/`
- `release/`
- `releases/`
- `graphify-out/`
- `.graphify/`
- `node_modules/`





