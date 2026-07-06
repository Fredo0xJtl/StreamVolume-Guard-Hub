# StreamVolume Guard Hub

Hub audio local Windows pour streamers : mixeur intelligent par application, extension navigateur, bridge local, sans driver, sans compte, sans telemetrie.

StreamVolume Guard Hub regroupe la version desktop Windows et l'extension navigateur dans un seul dossier propre, sans melanger leurs codes.

## Statut

Version actuelle : alpha testable, pas encore V1 stable.

- YouTube peut etre controle via `BrowserGain` quand le navigateur et le site exposent un signal exploitable.
- TikTok, Spotify Web ou Deezer Web peuvent rester en `ObserveOnly`, `Unknown`, `skipped` ou `no-signal` selon le navigateur et le site.
- Quand le controle fin navigateur n'est pas possible, le fallback attendu est le volume Windows global du navigateur via `WindowsSessionVolume`.
- `Sortie globale` observe le mix final Windows en lecture seule, mais ne modifie jamais le volume master.
- OBS reste une securite finale manuelle avec ses meters, `Application Audio Capture`, `Compressor` et `Limiter`.

## Ce Que Ca Fait

- Liste les sessions audio Windows exposees par le systeme.
- Controle le volume Windows par application quand Windows le permet.
- Affiche les sous-sources navigateur quand l'extension peut les observer.
- Applique `BrowserGain` dans l'onglet/source web quand le signal est exploitable.
- Utilise `WindowsSessionVolume` comme fallback pour les sources web non controlables directement.
- Propose les profils `Calme`, `Standard` et `Fort`.
- Limite l'auto-calibration a des corrections ponctuelles pour eviter les mouvements continus du fader.
- Affiche `Sortie globale` avec RMS, pic recent, etat `Safe` / `Risky` / `Silent` / `Unknown` et peripherique de sortie.
- Signale `global_output.unknown_active` si du son sort du PC sans source connue active dans les listes.
- Propose `Stream Safe` pour revenir vite a une configuration prudente : Auto actif + cible Standard.
- Propose un `Mode test guide` et un `Guide OBS` directement dans l'app desktop.
- Fournit Panic, exclusions, mode observation, logs locaux et rapports copiables.

## Ce Que Ca Ne Fait Pas

- Pas de driver audio maison.
- Pas de compresseur studio global.
- Pas de traitement audio sample par sample cote desktop.
- Pas de modification automatique du volume master Windows par `Sortie globale`.
- Pas de compte utilisateur.
- Pas de cloud sync.
- Pas de tracker ou telemetrie.
- Pas d'envoi automatique de logs.
- Pas de promesse de controle sur une source `ObserveOnly` ou `Unknown`.
- Pas de lecture automatique des scenes ou meters OBS dans cette alpha.

## Objectif

Construire une version hybride locale pour streamers :

- `apps/desktop` controle les sessions audio Windows comme un melangeur intelligent et observe la sortie globale Windows en lecture seule ;
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

## Prerequis

Pour utiliser le package testeur :

- Windows 10 ou Windows 11 ;
- un navigateur Chromium conseille pour l'alpha : Chrome, Brave ou Edge ;
- droits utilisateur normaux pour lancer une app locale et charger une extension non empaquetee.

Pour lancer depuis le repo source :

- .NET SDK 8 ;
- Node.js pour les tests extension/protocole ;
- PowerShell ;
- Windows, car le desktop utilise les sessions audio Windows.

## Architecture Hybride

La regle produit est simple : toute source disponible doit etre classee par origine et surface de controle. Windows couvre les applications exposees comme sessions audio ; l'extension couvre les sous-sources navigateur quand elle peut agir dans l'onglet/site. Les sources observees mais non controlables restent visibles.

Voir : `docs/hybrid-architecture.md`.

## Surfaces De Controle

| Surface | Peut modifier le son ? | Exemple |
| --- | --- | --- |
| `WindowsSessionVolume` | Oui | Brave, Firefox, VLC, Discord, Spotify desktop |
| `BrowserGain` | Oui | Onglet YouTube controlable par l'extension |
| `ObserveOnly` | Non | Source visible mais non controlable directement |
| `Unknown` | Non garanti | Source pas encore classee de facon fiable |
| `Sortie globale` | Non | Mesure lecture seule du mix final Windows |

Une source `ObserveOnly` ou `Unknown` n'est pas un echec cache : c'est une limite affichee honnetement pour eviter de promettre un controle impossible.

Le desktop affiche aussi un dashboard `Couverture` : `Direct`, `Fallback Windows`, `Action requise`, `Limite` et `Inconnu`. Ce score ne promet pas un controle magique ; il indique combien de sources sont securisables directement, via fallback Windows, ou apres une action utilisateur comme `Proteger l'onglet actif`.

## App, Extension, Ensemble

**App desktop seule** : voit les sessions audio Windows, affiche les applications qui produisent du son, permet le controle manuel, applique les profils `Calme`/`Standard`/`Fort` sur le melangeur Windows, gere `Auto actif`, exclusions, Panic, logs locaux, snapshots de diagnostic et `Sortie globale` en lecture seule. Elle peut equilibrer Brave, Firefox, VLC, Discord ou Spotify desktop au niveau application, mais elle ne peut pas separer deux onglets dans le meme navigateur sans l'extension.

**Extension seule** : voit les medias web dans le navigateur quand le site et le navigateur le permettent, protege un onglet, mesure le niveau, applique `BrowserGain` si la source est controlable, ou affiche `ObserveOnly`/`Unknown` si elle ne peut pas agir. Elle reste utilisable en `Mode autonome`, sans compte, sans cloud et sans envoyer d'audio brut. Si une source web demande le fallback Windows mais que le desktop est ferme, l'extension doit rester stable en observation, garder le bouton visuellement actif, et le diagnostic doit expliquer que l'app desktop est necessaire pour bouger le volume Windows du navigateur.

**App + extension via bridge local** : le desktop expose la cible et l'etat via `127.0.0.1:47841`, l'extension envoie les sous-sources et logs sanitizes, et les deux evitent de se battre. Si une source navigateur est vraiment controlable par `BrowserGain` et `locked`, l'extension devient prioritaire pour les corrections automatiques fines ; sinon le desktop peut revenir au volume Windows global du navigateur, surtout quand une seule page joue. Un changement volontaire de cible peut aussi appliquer un fallback Windows rapide pour que l'action soit effective tout de suite.

Le dashboard `Couverture` resume l'etat reel : `Direct` pour `WindowsSessionVolume` ou `BrowserGain`, `Fallback Windows` quand le parent navigateur est controlable globalement, `Action requise` quand l'onglet doit etre protege, et `Limite` / `Inconnu` quand le Hub doit rester honnete.

Le bloc `Sortie globale` sert aussi de filet de diagnostic : si le mix Windows est actif mais que les sessions Windows et sous-sources navigateur visibles restent silencieuses, le rapport peut afficher `global_output.unknown_active`. Cela ne modifie pas le volume master ; c'est une alerte pour chercher une application, une capture OBS ou une source systeme non expliquee.

## Source De Verite

- Vision hybride : `docs/hybrid-architecture.md`
- Cahier couche desktop : `docs/desktop-v1-cahier-des-charges.md`
- Checklist testeur : `docs/tester-checklist.md`
- Notes alpha testeur : `docs/release-notes/v0.1.0-alpha.1.md`
- Setup securite OBS : `docs/obs-stream-safety-setup.md`
- Protocole commun : `packages/protocol/README.md`
- GitHub Project direct : https://github.com/users/Fredo0xJtl/projects/1
- GitHub Project docs : `.github/project/README.md`

## Etat Actuel

Testable aujourd'hui :

- protocole `browser_source_observed` ;
- bridge local durci sur `127.0.0.1:47841` ;
- `GET /health`, `GET /global-target`, `POST /browser-source` et `POST /extension-log` ;
- logs locaux groupes par `runId` et `testSessionId` ;
- rapport lisible copiable avec `Copier logs` ;
- validation stricte de `isControllable` ;
- config locale Auto, exclusions, cible globale et token bridge optionnel ;
- UI de controlabilite Windows/navigateur ;
- statut de liaison `App seule` / `Extension connectee` ;
- monitor `Sortie globale` lecture seule ;
- verrou de calibration automatique one-shot ;
- calibration navigateur `BrowserGain` prioritaire quand le signal est exploitable ;
- packaging testeur Windows reproductible.

Points a garder en tete :

- si `BridgeToken` est defini, `/browser-source`, `/extension-log` et `/global-target` exigent `X-StreamVolume-Guard-Token` ;
- `/health` reste ouvert pour le diagnostic local ;
- Chrome, Brave et Edge commencent par `media-html` quand un lecteur web est accessible ;
- `tabCapture` sert d'upgrade generique si `media-html` reste muet alors que l'onglet est audible ;
- une source `ObserveOnly`, `Unknown`, `skipped` ou `no-signal` doit rester honnete dans l'UI ;
- les colonnes `Raison` et `Action` guident vers rechargement, reprotection, fallback Windows ou OBS ;
- `Sortie globale` mesure RMS/pic/etat du mix final Windows, sans modifier le volume master et sans enregistrer d'audio brut.

## GitHub Project

Tableau direct :

```text
https://github.com/users/Fredo0xJtl/projects/1
```

Page Projects du repo :

```text
https://github.com/Fredo0xJtl/StreamVolume-Guard-Hub/projects
```

GitHub Projects v2 garde une URL canonique sous le compte `Fredo0xJtl`,
mais ce tableau est lie au repo `Fredo0xJtl/StreamVolume-Guard-Hub`.

Les fichiers de base pour l'onglet GitHub Projects sont dans :

```text
.github/project/
```

Ils decrivent le board recommande, les labels, le backlog importable et la checklist de pre-release. A chaque changement produit, test reel, packaging ou release, mettre a jour `.github/project/backlog.csv` et `.github/project/release-checklist.md` en meme temps que le `CHANGELOG.md`.

## Installation Rapide

### Option 1 - Package Testeur

1. Recuperer ou generer `StreamVolumeGuardHub-Tester-v0.1.38.zip`.
2. Extraire le zip.
3. Si Windows bloque le zip ou l'executable, faire clic droit, `Proprietes`, puis cocher `Debloquer` si l'option existe.
4. Double-cliquer sur `Lancer StreamVolume Guard Hub Desktop.cmd`.
5. Charger l'extension depuis le dossier `browser-extension` du package.
6. Ouvrir l'app et verifier que `Sources Windows`, `Sources navigateur`, `Sortie globale` et le statut bridge sont visibles.

### Option 2 - Depuis Le Repo

```powershell
cd "D:\Codex\StreamVolume Guard Hybride"
dotnet build "apps\desktop\StreamVolumeGuard.Desktop.sln" -nr:false
dotnet run --project "apps/desktop/src/StreamVolumeGuard.App/StreamVolumeGuard.App.csproj"
```

Puis charger l'extension depuis :

```text
D:\Codex\StreamVolume Guard Hybride\apps\browser-extension
```

Au premier lancement, le desktop demarre en mode observation. Ensuite, l'etat `Auto actif`, la cible voulue et les exclusions sont restaures depuis `%LOCALAPPDATA%\StreamVolumeGuard\config.json`.

La langue de l'app desktop suit la langue systeme au demarrage : interface francaise si Windows est en francais (`fr`, `fr-FR`, `fr-CA`, etc.), interface anglaise pour toutes les autres langues. Les logs techniques restent stables et lisibles pour le debug.

Quand `Auto actif` est active, le desktop applique une correction automatique par source active, puis verrouille cette source pour eviter de bouger le volume en continu pendant la lecture. Les profils pilotent directement le volume du melangeur Windows : `Calme` vise environ 40%, `Standard` environ 70%, et `Fort` environ 100%. Le verrou se rearme apres silence durable, disparition de la session, ou changement de cible globale.

Le slider personnalise peut descendre jusqu'a environ 15% du melangeur Windows. Les corrections Auto, y compris `safety-spike`, ne descendent pas sous la cible active : environ 40% en `Calme`, 70% en `Standard`, 100% en `Fort`, ou 15% au minimum personnalise. `Panic` reste l'action d'urgence separee.

`Sons systeme Windows` est traite comme une source speciale anti-pic : l'app peut le baisser avec Auto/Panic s'il devient trop fort, mais elle ne le remonte pas automatiquement avec `Standard` ou `Fort`. Les notifications et alertes courtes restent donc visibles dans le diagnostic sans etre boostees inutilement.

## Verification Premier Lancement

Apres lancement :

- `Sources Windows` doit etre visible ;
- `Sources navigateur` doit etre visible ;
- `Sortie globale` doit afficher un etat ou une erreur loopback claire ;
- le bridge doit indiquer `127.0.0.1:47841` ou une erreur claire ;
- sans extension connectee, le desktop doit indiquer `App seule` ;
- apres chargement extension et activite navigateur, le desktop peut passer a `Extension connectee`.

Si rien ne s'affiche, lancer une source audio simple comme VLC, YouTube ou Spotify desktop, puis cliquer `Rafraichir`.

## Tests Automatiques

Depuis PowerShell :

```powershell
cd "D:\Codex\StreamVolume Guard Hybride"
$ErrorActionPreference = "Stop"

function Run-Step($cmd, $argsList) {
  & $cmd @argsList
  if ($LASTEXITCODE -ne 0) { throw "$cmd failed with exit code $LASTEXITCODE" }
}

Run-Step node @("packages/protocol/tests/protocol.test.js")
Run-Step node @("apps/browser-extension/tests/unit.test.js")

Run-Step node @("--check", "apps/browser-extension/audio/browser-gain-calibration.js")
Run-Step node @("--check", "apps/browser-extension/audio/normalizer.js")
Run-Step node @("--check", "apps/browser-extension/bridge/client.js")
Run-Step node @("--check", "apps/browser-extension/background.js")
Run-Step node @("--check", "apps/browser-extension/content.js")
Run-Step node @("--check", "apps/browser-extension/offscreen/offscreen.js")
Run-Step node @("--check", "apps/browser-extension/popup/popup.js")
Run-Step node @("--check", "apps/browser-extension/options/options.js")

Run-Step dotnet @("run", "--project", "apps/desktop/tests/StreamVolumeGuard.Tests/StreamVolumeGuard.Tests.csproj")
Run-Step dotnet @("build", "apps/desktop/StreamVolumeGuard.Desktop.sln", "-nr:false")
```

## Package Testeur Windows

Pour generer un dossier testeur sans demander d'ouvrir la solution `.sln` :

```powershell
powershell -ExecutionPolicy Bypass -File "tools\package-tester.ps1"
```

Le package est genere dans :

```text
artifacts\tester\StreamVolumeGuardHub-Tester
```

Une archive locale est aussi generee :

```text
artifacts\tester\StreamVolumeGuardHub-Tester-v0.1.38.zip
```

Un checksum SHA256 est genere a cote :

```text
artifacts\tester\StreamVolumeGuardHub-Tester-v0.1.38.zip.sha256.txt
```

Ce dossier et ce zip contiennent le desktop publie, l'extension navigateur a charger en mode developpeur, un launcher, un raccourci logs, un README court et une checklist courte. `artifacts/` reste un dossier genere ignore par Git.

Le desktop publie est self-contained `win-x64` : le testeur n'a pas besoin d'installer le SDK ou le runtime .NET pour lancer l'app depuis le package. Cette alpha n'est pas encore signee avec un certificat Windows ; SmartScreen peut donc afficher un avertissement tant qu'un certificat de signature n'est pas ajoute.

### Avertissement Windows SmartScreen

Le zip GitHub de l'alpha n'est pas signe avec un certificat public. Windows peut donc afficher `Windows a protege votre ordinateur`, `Editeur inconnu` ou bloquer le fichier parce qu'il vient d'Internet. Ce n'est pas un bug de StreamVolume Guard Hub.

Pour un test local :

1. Clic droit sur le zip telecharge ou sur `StreamVolumeGuard.App.exe`.
2. Ouvrir `Proprietes`.
3. Si l'option existe, cocher `Debloquer`, puis `Appliquer`.
4. Extraire le zip si ce n'est pas deja fait.
5. Lancer `Lancer StreamVolume Guard Hub Desktop.cmd`.
6. Si SmartScreen apparait, cliquer `Informations complementaires`, puis `Executer quand meme`.

Ne pas desactiver SmartScreen globalement. Pour reduire cette friction en beta publique, le chemin prevu est Microsoft Store readiness apres les tests reels et la stabilisation V1. Pour les zips GitHub publics sans Store, il faudra plus tard une signature Windows reconnue.

## Depannage Rapide

- SmartScreen bloque le zip ou l'exe : debloquer le fichier dans `Proprietes`, puis relancer.
- Le desktop ne voit aucune source : lancer une app qui produit du son, verifier le melangeur Windows, puis cliquer `Rafraichir`.
- Le bridge ne demarre pas : verifier qu'aucune autre instance n'utilise `127.0.0.1:47841`.
- L'extension reste en `Mode autonome` : verifier que le desktop est ouvert, puis rouvrir le popup ou cliquer `Copier diagnostic` pour forcer un nouveau health check local.
- L'extension affiche `App connectee` alors que la fenetre desktop est fermee : rouvrir le popup ou cliquer `Copier diagnostic`. Le bridge doit etre coupe quand la fenetre desktop se ferme ; si `127.0.0.1:47841` repond encore, une ancienne instance doit etre fermee depuis le Gestionnaire des taches.
- L'onglet reste `ObserveOnly` ou `no-signal` : ce n'est pas forcement un bug ; utiliser le fallback Windows global ou OBS selon le cas.
- La popup indique `Controle via Windows (standalone)` : l'extension est encore active en observation, mais elle ne peut pas bouger le volume Windows tant que l'app desktop est fermee.
- Les logs sont necessaires : cliquer `Nouveau test`, reproduire le cas, puis `Copier logs`.

## Installer L'Extension Navigateur

Dossier a selectionner depuis le repo source :

```text
D:\Codex\StreamVolume Guard Hybride\apps\browser-extension
```

Dossier a selectionner depuis le package testeur :

```text
browser-extension
```

### Chrome

1. Ouvrir `chrome://extensions`.
2. Activer `Mode developpeur`.
3. Cliquer `Charger l'extension non empaquetee`.
4. Selectionner le dossier `apps\browser-extension` depuis le repo, ou `browser-extension` depuis le package testeur.
5. Ouvrir le popup StreamVolume Guard Hub et verifier `Mode autonome` ou `App connectee`.

### Brave

1. Ouvrir `brave://extensions`.
2. Activer `Mode developpeur`.
3. Cliquer `Charger l'extension non empaquetee`.
4. Selectionner le dossier `apps\browser-extension` depuis le repo, ou `browser-extension` depuis le package testeur.
5. Ouvrir le popup StreamVolume Guard Hub et verifier `Mode autonome` ou `App connectee`.

### Microsoft Edge

1. Ouvrir `edge://extensions`.
2. Activer `Mode developpeur`.
3. Cliquer `Charger l'extension non empaquetee`.
4. Selectionner le dossier `apps\browser-extension` depuis le repo, ou `browser-extension` depuis le package testeur.
5. Ouvrir le popup StreamVolume Guard Hub et verifier `Mode autonome` ou `App connectee`.

### Firefox Desktop

Firefox est un chemin de test temporaire pour cette alpha, pas le navigateur principal valide. Le manifest courant est MV3 et utilise des APIs comme `tabCapture`/`offscreen`, dont le comportement peut differer ou etre refuse.

1. Ouvrir `about:debugging#/runtime/this-firefox`.
2. Cliquer `Charger un module complementaire temporaire`.
3. Selectionner `manifest.json` dans le dossier `apps\browser-extension` depuis le repo, ou `browser-extension\manifest.json` depuis le package testeur.
4. Tester le popup si Firefox accepte le manifest.
5. Si Firefox refuse le chargement ou si la capture audio ne fonctionne pas, utiliser Chrome, Brave ou Edge pour l'alpha.

### Safari Et Firefox Android

Safari et Firefox Android ne sont pas fournis dans le package Hub. Safari demanderait une conversion et un packaging separes sur macOS/Xcode. Firefox Android demandera une validation dediee plus tard. Pour `v0.1.38`, utiliser Chrome, Brave ou Edge pour la validation principale.

## Tests Manuels Prioritaires

Tester une source a la fois avant les combinaisons :

1. YouTube navigateur.
2. TikTok navigateur.
3. Spotify Web ou Deezer Web.
4. VLC ou lecteur local.
5. Discord.
6. Spotify desktop si disponible.
7. OBS avec meters visibles, en observation manuelle.
8. Combinaisons navigateur + app Windows.

Pour chaque source, verifier :

- la source apparait dans le desktop ou la limite est claire ;
- `origin` est visible ;
- `controlSurface` est visible ;
- `status` est comprehensible ;
- `isControllable` correspond a la vraie surface de controle ;
- `Sortie globale` bouge quand du son joue et tend vers `Silent` quand tout est en pause ;
- les logs restent locaux et ne contiennent pas d'audio brut.

Checklist complete : `docs/tester-checklist.md`.

## Logs Et Confidentialite

Logs locaux :

```text
%LOCALAPPDATA%\StreamVolumeGuard\logs
```

Config locale :

```text
%LOCALAPPDATA%\StreamVolumeGuard\config.json
```

Le bouton `Copier logs` copie un rapport lisible de la session de test courante.

Les logs ne doivent pas contenir :

- audio brut ;
- samples ;
- buffers PCM ;
- URL complete ;
- historique de navigation ;
- message Discord ;
- scene OBS ;
- token bridge ;
- donnee de compte utilisateur.

## Limites Connues

En controle Windows global, un navigateur compte comme une seule source audio. Si une musique de fond et une video jouent dans le meme Firefox/Brave/Chrome sans `BrowserGain` exploitable, le slider Windows du navigateur bouge les deux ensemble. Pour garder la musique plus forte ou plus stable qu'une video web, utiliser si possible deux sources Windows separees, par exemple Spotify desktop ou VLC pour la musique et le navigateur pour la video. Une source exclue reste en controle manuel via son slider dans l'app ; les autres sources non exclues peuvent rester gerees par `Auto actif`.

Le controle fin par onglet depend du navigateur et du site. Quand l'extension annonce une source `BrowserGain` avec un niveau exploitable et `Calibration=locked`, elle devient prioritaire pour cette sous-source navigateur. Si la source reste `measuring`, `ObserveOnly`, `Unknown` ou `skipped`, l'app doit l'afficher honnetement avec une raison lisible et revenir au controle Windows global seulement quand c'est acceptable, notamment quand une seule page web joue ou quand l'utilisateur vient de changer la cible. Les nouveaux etats `needs-user-action`, `restricted` et `unsupported` indiquent respectivement qu'il faut cliquer pour proteger l'onglet, que la page bloque la capture, ou que le navigateur ne supporte pas la capture d'onglet. Si le signal navigateur est inexploitable, le Hub ne promet pas `BrowserGain` : il propose de recharger, reproteger, utiliser le fallback Windows ou securiser la source dans OBS.

Limites a surveiller en alpha :

- plusieurs onglets dans le meme navigateur peuvent bouger ensemble ;
- `BrowserGain` depend du navigateur, du site et du signal disponible ;
- une capture `tab-capture` peut etre audible cote navigateur mais rester `no-signal` cote Web Audio ;
- `media-html` peut detecter un media sans pouvoir le controler ;
- `Sortie globale` aide a voir le mix final, mais ne compresse pas le son ;
- OBS n'est pas lu automatiquement ;
- le package Windows n'est pas encore signe.

## OBS Stream Safety Setup

StreamVolume Guard Hub n'est pas un compresseur studio global. Il organise les sources, expose ce qui est controlable, calibre les volumes Windows/navigateur quand c'est possible et garde les limites visibles. Pour securiser le son final du stream contre les pics internes d'une video, d'un jeu ou d'une app, la V1 recommande OBS comme derniere couche de protection.

La procedure conseillee est de capturer les applications separement dans OBS quand c'est possible, puis d'ajouter les filtres natifs OBS : `Compressor` sur les sources a risque et `Limiter` en dernier filtre. Voir `docs/obs-stream-safety-setup.md`.

## Roadmap

Priorites actuelles :

- tests reels YouTube, TikTok, Spotify Web, Deezer Web, Discord, VLC et OBS ;
- validation du package testeur depuis un dossier propre ;
- stabilisation V1 apres retours testeur ;
- enrichissement du diagnostic local si les tests reels montrent encore des zones floues ;
- Microsoft Store readiness plus tard, sans soumission automatique.

## Signaler Un Probleme

Pour un bug ou un retour testeur, fournir autant que possible :

- Windows utilise ;
- navigateur utilise ;
- source testee : YouTube, TikTok, Spotify Web, VLC, Discord, OBS, autre ;
- `origin`, `controlSurface`, `status` et `isControllable` visibles dans l'app ;
- etat `Sortie globale` ;
- action faite : observation, `Auto actif`, changement de profil, Panic, exclusion ;
- rapport copie avec `Copier logs`.

Ne pas coller d'informations sensibles : URL complete privee, token bridge, messages Discord, donnees de compte ou extrait audio.

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

## Licence

MIT. Voir `LICENSE`.
