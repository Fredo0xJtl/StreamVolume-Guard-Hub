# StreamVolume Guard Hub - Package Testeur

Ce dossier sert a tester StreamVolume Guard Hub sans ouvrir la solution Visual Studio.

Version alpha testeur : `v0.1.0-alpha.1`.

Version interne du manifest navigateur dans cette alpha : `0.1.27`.

Notes detaillees dans le repo source :

```text
docs\release-notes\v0.1.0-alpha.1.md
```

## Installation Rapide

1. Lancer l'app avec `Lancer StreamVolume Guard Hub Desktop.cmd`.
2. Charger l'extension depuis le dossier `browser-extension`.
3. Ouvrir une source audio simple : YouTube, Spotify desktop, VLC ou Discord.
4. Verifier que `Sources Windows`, `Sources navigateur`, `Sortie globale` et le statut bridge sont visibles.
5. Cliquer `Nouveau test`, reproduire le scenario, puis `Copier logs` si un retour est necessaire.

## Lancer L'App

Double-cliquer sur :

```text
Lancer StreamVolume Guard Hub Desktop.cmd
```

Le desktop publie dans ce package est une app Windows locale. Il ne demande pas de compte, ne demarre pas de cloud, ne collecte pas de telemetrie et ne fournit pas de driver audio.

Le desktop est publie en self-contained `win-x64` : il doit se lancer sans installer le SDK ou le runtime .NET. Cette alpha n'est pas encore signee avec un certificat Windows ; SmartScreen peut afficher un avertissement sur certaines machines.

### Avertissement Windows SmartScreen

Le zip alpha n'est pas signe avec un certificat public. Windows peut donc afficher `Windows a protege votre ordinateur`, `Editeur inconnu` ou bloquer le fichier parce qu'il vient d'Internet. Ce n'est pas un bug de StreamVolume Guard Hub.

Pour tester :

1. Clic droit sur le zip telecharge ou sur `desktop\StreamVolumeGuard.App.exe`.
2. Ouvrir `Proprietes`.
3. Si l'option existe, cocher `Debloquer`, puis `Appliquer`.
4. Lancer `Lancer StreamVolume Guard Hub Desktop.cmd`.
5. Si SmartScreen apparait, cliquer `Informations complementaires`, puis `Executer quand meme`.

Ne pas desactiver SmartScreen globalement. Pour reduire cette friction en beta publique, le chemin prevu est Microsoft Store apres les tests reels et la stabilisation V1.

Si le zip est partage, verifier le fichier SHA256 fourni a cote du zip :

```text
StreamVolumeGuardHub-Tester-v0.1.0-alpha.1.zip.sha256.txt
```

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

- Desktop seul : voit les sessions audio Windows, affiche les applications qui produisent du son, applique les profils `Calme`, `Standard`, `Fort`, gere `Auto actif`, exclusions, Panic, snapshots mixer, `Sortie globale` lecture seule et logs locaux. Il ne peut pas separer deux onglets du meme navigateur si l'extension ne fournit pas de sous-source exploitable.
- Extension seule : detecte les medias web dans le navigateur, indique `Mode autonome` si l'app n'est pas joignable, et peut appliquer `BrowserGain` dans l'onglet/source quand le signal est exploitable. Sinon elle doit afficher `ObserveOnly`, `Unknown`, `skipped` ou un etat de capture lisible avec une raison standalone, sans annoncer le fallback Windows tant que le desktop est ferme.
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

Le bloc `Sortie globale` observe le mix final envoye au peripherique Windows par defaut. Il affiche RMS, pic recent, etat `Silent` / `Safe` / `Risky` / `Unknown` et peripherique. Il ne modifie pas le volume master Windows et n'ecrit jamais d'audio brut dans les logs. Si le mix est actif sans source Windows/navigateur connue active, le rapport peut afficher `global_output.unknown_active`.

## Limites V1 A Verifier

- `WindowsSessionVolume` : le desktop peut agir sur le volume Windows de l'application.
- `BrowserGain` : sur Chrome, Brave et Edge, l'extension commence par `media-html` pour retrouver le comportement stable de l'ancienne extension sur les lecteurs web accessibles. Si `media-html` reste muet ou introuvable alors que l'onglet est audible, elle peut tenter une bascule generique vers `tabCapture` meme sans app desktop. Si cette capture fournit un signal, la cible dB doit agir ; sinon l'extension reste honnete en `ObserveOnly` / `no-signal`. Quand la source web est exploitable, l'extension analyse environ 18 secondes avec l'app desktop connectee ; en mode autonome, elle applique le gain direct sans calibration longue. Elle ignore les silences, evite de booster avant une mesure fiable, attenue vite un debut dangereux, applique un gain dans l'onglet/source, puis verrouille la calibration pour eviter les corrections en boucle.
- `ObserveOnly` : la source est visible mais l'app ne promet pas de la controler.
- `Unknown` : la source n'est pas encore classee de facon fiable.
- `Sortie globale` : mesure lecture seule du mix final Windows, utile pour verifier si l'ensemble du PC reste trop fort, silencieux ou stable.
- `Stream Safe` : raccourci prudent qui active Auto et revient a la cible Standard.
- `Mode test guide` : boutons `Demarrer guide` et `Etape suivante` pour journaliser les tests source par source.

En V1 actuelle, plusieurs sons dans le meme navigateur bougent ensemble quand le controle passe par le volume Windows global du navigateur. Ce n'est pas un bug : pour separer musique et video, utiliser deux applications Windows distinctes quand c'est possible, ou verifier si l'extension arrive a exposer une sous-source `BrowserGain` vraiment controlable.

La calibration `BrowserGain` prioritaire est testable : quand une sous-source navigateur est `BrowserGain`, controlable et avec signal exploitable, l'extension doit rester en `measuring` pendant la fenetre de son mode, puis passer en `locked`. La fenetre attendue est longue avec desktop connecte, courte en mode autonome. Pendant `measuring`, `no-signal`, `ObserveOnly`, `Unknown` ou `skipped`, le fallback attendu reste le volume Windows global du navigateur uniquement quand le desktop est ouvert. L'app doit afficher une `Raison` et une `Action` pour expliquer le chemin suivant : recharger, reproteger, laisser le fallback Windows agir ou securiser dans OBS. Si l'etat est `needs-user-action`, cliquer `Proteger l'onglet actif`. Si l'etat est `restricted` ou `unsupported`, ne pas attendre `BrowserGain` et utiliser le fallback Windows/OBS. Si une capture d'onglet audible reste muette cote Web Audio avec desktop connecte, l'export diagnostic doit afficher `fallbackRecommended=true` et `fallbackReason=tab-capture-no-signal`. En mode autonome, une limite HTML doit plutot apparaitre dans `mediaHtmlFallbackReason` avec `fallbackRecommended=false`. Si le fallback HTML affiche `mediaDetected>0`, `mediaProcessed>0`, mais aucun RMS exploitable, il doit finir en `fallbackReason=media-html-no-usable-signal` cote source. Dans ces cas, le bouton extension peut rester actif en observation/fallback meme si `BrowserGain` n'est pas controlable directement. Apres un changement volontaire de cible, un mouvement Windows ponctuel avec `reason=windows-fast-target` est normal ; ce qui ne doit pas arriver, c'est une boucle de corrections continues.

Le slider personnalise descend jusqu'a environ 15% du melangeur Windows. Les corrections Auto, meme `safety-spike`, ne doivent pas passer sous la cible active : environ 40% en `Calme`, 70% en `Standard`, 100% en `Fort`, ou 15% au minimum personnalise. `Panic` reste l'action d'urgence separee.

OBS reste une verification visuelle manuelle : StreamVolume Guard Hub ne pretend pas lire les scenes ou les meters internes OBS dans cette version.

## Ordre De Test Court

1. Lancer le desktop.
2. Charger l'extension.
3. Verifier que `Sortie globale` affiche un etat ou une erreur claire.
4. Cliquer `Demarrer guide` pour une campagne complete.
5. Tester YouTube seul.
6. Mettre pause.
7. Cliquer `Etape suivante`.
8. Tester TikTok seul.
9. Refaire pareil avec Spotify Web ou Deezer Web, VLC/Spotify desktop, Discord, puis OBS.
10. Tester `Stream Safe` : Auto doit etre actif et la cible doit revenir a Standard.
11. Ouvrir `Guide OBS` et observer les meters OBS manuellement.

Pour une campagne complete, lire `CHECKLIST-COMPLETE.md`.
