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
.github/                CI/templates GitHub
```

## Architecture Hybride

La regle produit est simple : toute source disponible doit etre classee par origine et surface de controle. Windows couvre les applications exposees comme sessions audio ; l'extension couvre les sous-sources navigateur quand elle peut agir dans l'onglet/site. Les sources observees mais non controlables restent visibles.

Voir : `docs/hybrid-architecture.md`.

## Source De Verite

- Vision hybride : `docs/hybrid-architecture.md`
- Plan de suite : `docs/product-next-plan.md`
- Review documentaire : `docs/review-2026-07-01.md`
- Checklist testeur : `docs/tester-checklist.md`
- Setup GitHub : `docs/github-repo-setup.md`

Etat actuel : le protocole, la simulation navigateur, le bridge local durci `127.0.0.1:47841`, l'envoi reel depuis l'extension, la lecture `GET /global-target`, le journal unifie local via `POST /extension-log`, la validation stricte `isControllable`, la config locale Auto/exclusions/cible/token bridge optionnel, l'affichage de la controlabilite, l'anti-conflit minimal `BrowserGain` / `WindowsSessionVolume` et le verrou de calibration automatique one-shot sont testables. Si `BridgeToken` est defini, les endpoints de donnees `/browser-source`, `/extension-log` et `/global-target` exigent `X-StreamVolume-Guard-Token`, tandis que `/health` reste ouvert pour le diagnostic local. Les prochaines etapes sont les tests reels multi-sources et le packaging testeur Windows.

## Lancer Le Desktop

Double-cliquer sur :

```text
Lancer StreamVolume Guard Hub Desktop.cmd
```

Ou lancer en PowerShell :

```powershell
dotnet run --project "apps\desktop\src\StreamVolumeGuard.App\StreamVolumeGuard.App.csproj"
```

Au premier lancement, le desktop demarre en mode observation. Ensuite, l'etat `Auto actif`, la cible voulue et les exclusions sont restaures depuis `%LOCALAPPDATA%\StreamVolumeGuard\config.json`.

Quand `Auto actif` est active, le desktop applique une correction automatique par source active, puis verrouille cette source pour eviter de bouger le volume en continu pendant la lecture. Le verrou se rearme apres silence durable, disparition de la session, ou changement de cible globale.

## Regle Importante

Ne pas recoller desktop et extension dans le meme code. La bonne architecture est hybride, pas fusionnee : chaque app garde son role, et le partage passe par `packages/protocol`.

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





