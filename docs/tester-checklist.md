# Checklist De Test - StreamVolume Guard Hub V1

Objectif : tester la V1 hybride comme un vrai utilisateur, sans melanger les commandes techniques et les tests manuels.

Cette checklist verifie :
- desktop Windows : sessions audio Windows, controle manuel, observation, Auto, exclusions, Panic, logs ;
- bridge local : reception sur `127.0.0.1:47841` ;
- extension navigateur : envoi local `browser_source_observed` quand une source web est observee ;
- protocole : classification obligatoire par `origin`, `controlSurface`, `status` et `isControllable` ;
- OBS : verification visuelle manuelle, pas encore lecture automatique des meters.

Regle produit : aucune source ne doit etre presentee comme controlable si elle ne l'est pas vraiment.

---

## 0. Chemins Absolus A Connaitre

```text
Racine projet :
D:\Codex\StreamVolume Guard Hybride

Checklist testeur :
D:\Codex\StreamVolume Guard Hybride\docs\tester-checklist.md

Architecture publique :
D:\Codex\StreamVolume Guard Hybride\docs\hybrid-architecture.md

Protocole :
D:\Codex\StreamVolume Guard Hybride\packages\protocol

Test protocole :
D:\Codex\StreamVolume Guard Hybride\packages\protocol\tests\protocol.test.js

Desktop :
D:\Codex\StreamVolume Guard Hybride\apps\desktop

Projet app desktop :
D:\Codex\StreamVolume Guard Hybride\apps\desktop\src\StreamVolumeGuard.App\StreamVolumeGuard.App.csproj

Solution desktop :
D:\Codex\StreamVolume Guard Hybride\apps\desktop\StreamVolumeGuard.Desktop.sln

Tests desktop :
D:\Codex\StreamVolume Guard Hybride\apps\desktop\tests\StreamVolumeGuard.Tests\StreamVolumeGuard.Tests.csproj

Extension navigateur :
D:\Codex\StreamVolume Guard Hybride\apps\browser-extension

Tests extension :
D:\Codex\StreamVolume Guard Hybride\apps\browser-extension\tests\unit.test.js

Client bridge extension :
D:\Codex\StreamVolume Guard Hybride\apps\browser-extension\bridge\client.js

Logs locaux :
%LOCALAPPDATA%\StreamVolumeGuard\logs

Config locale :
%LOCALAPPDATA%\StreamVolumeGuard\config.json

Package testeur genere :
D:\Codex\StreamVolume Guard Hybride\artifacts\tester

Notes alpha testeur :
D:\Codex\StreamVolume Guard Hybride\docs\release-notes\v0.1.0-alpha.1.md
```

Si un chemin n'existe pas, le noter dans le rapport de test au lieu d'improviser.

---

## 1. Difference Entre Les Deux Types De Tests

### Commandes automatiques

Elles se lancent dans PowerShell depuis la racine :

```powershell
cd "D:\Codex\StreamVolume Guard Hybride"
```

Elles servent a verifier que le code tient : protocole, extension, desktop, build.

### Tests manuels

Ils se font avec l'app ouverte et les vraies sources audio :

- YouTube ;
- TikTok ;
- Spotify Web ou Deezer Web ;
- Discord ;
- VLC ;
- Spotify desktop si disponible ;
- OBS.

Ces tests ne sont pas remplaces par les commandes automatiques. Une build verte ne prouve pas que TikTok, OBS ou le navigateur se comportent bien.

---

## 2. Preparation Avant De Tester

A faire avant les commandes et tests manuels :

- [ ] Fermer les anciennes fenetres `StreamVolume Guard Hub Desktop`.
- [ ] Ouvrir le melangeur de volume Windows pour comparer.
- [ ] Preparer YouTube, TikTok et Spotify Web, mais les laisser en pause.
- [ ] Si `Proteger l'onglet actif` repasse immediatement inactif, lire le message de la popup : l'activation doit maintenant afficher une erreur explicite au lieu d'un retour silencieux.
- [ ] Preparer une app separee : VLC, Discord, jeu, Spotify desktop ou Deezer desktop.
- [ ] Ouvrir OBS seulement si tu testes le scenario stream.
- [ ] Tester les pages une par une au debut.
- [ ] Ne pas tout mettre en Play en meme temps au premier passage.

---

## 3. Commandes Automatiques De Validation

Depuis PowerShell :

```powershell
cd "D:\Codex\StreamVolume Guard Hybride"
```

Lancer ensuite :

```powershell
node "packages/protocol/tests/protocol.test.js"
node "apps/browser-extension/tests/unit.test.js"
node --check "apps/browser-extension/bridge/client.js"
node --check "apps/browser-extension/background.js"
node --check "apps/browser-extension/content.js"
dotnet run --project "apps/desktop/tests/StreamVolumeGuard.Tests/StreamVolumeGuard.Tests.csproj"
dotnet build "apps/desktop/StreamVolumeGuard.Desktop.sln" -nr:false
```

Checklist :

- [ ] Je suis bien dans `D:\Codex\StreamVolume Guard Hybride`.
- [ ] Le test protocole passe.
- [ ] Les tests extension passent.
- [ ] Les checks JS extension passent.
- [ ] Les tests desktop passent.
- [ ] La build desktop passe.
- [ ] Si une commande echoue, j'ai copie l'erreur exacte.

---

## 3bis. Generer Le Package Testeur

Depuis PowerShell :

```powershell
cd "D:\Codex\StreamVolume Guard Hybride"
powershell -ExecutionPolicy Bypass -File "tools\package-tester.ps1"
```

Package attendu :

```text
D:\Codex\StreamVolume Guard Hybride\artifacts\tester\StreamVolumeGuardHub-Tester
```

Zip attendu :

```text
D:\Codex\StreamVolume Guard Hybride\artifacts\tester\StreamVolumeGuardHub-Tester-v0.1.0-alpha.1.zip
```

Checklist :

- [ ] Le dossier package existe.
- [ ] Le zip package existe.
- [ ] Le package contient `Lancer StreamVolume Guard Hub Desktop.cmd`.
- [ ] Le package contient `browser-extension\manifest.json`.
- [ ] Le package contient `README.md`, `CHECKLIST.md` et `CHECKLIST-COMPLETE.md`.
- [ ] Le testeur n'a pas besoin d'ouvrir `StreamVolumeGuard.Desktop.sln`.

---

## 4. Lancement Desktop

Depuis PowerShell :

```powershell
cd "D:\Codex\StreamVolume Guard Hybride"
dotnet run --project "apps/desktop/src/StreamVolumeGuard.App/StreamVolumeGuard.App.csproj"
```

Validation attendue :

- [ ] La fenetre `StreamVolume Guard Hub Desktop` s'ouvre.
- [ ] Au premier lancement, `Auto actif` est decoche. Si la config existe deja, son etat peut etre restaure.
- [ ] `Sources Windows` est visible.
- [ ] `Sous-sources navigateur` est visible.
- [ ] Le statut bridge indique `127.0.0.1:47841` ou une erreur claire.
- [ ] Le resume desktop indique `App seule` tant qu'aucun evenement extension recent n'a ete recu.
- [ ] Le bouton de simulation navigateur reste disponible si l'extension n'est pas encore testee.

---

## 5. Test Bridge Sans Extension

Garder le desktop ouvert.

### Health check

```powershell
Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:47841/health" | Select-Object -ExpandProperty Content
```

Attendu :

- [ ] Reponse JSON avec `ok`.
- [ ] Le nom du bridge est visible.
- [ ] Pas de crash desktop.

### POST manuel valide

Par defaut, `BridgeToken` est vide et aucun en-tete token n'est necessaire. Si un token local a ete defini dans `%LOCALAPPDATA%\StreamVolumeGuard\config.json`, les endpoints de donnees `/browser-source`, `/extension-log` et `/global-target` exigent le meme token. Ajouter :

```powershell
$headers = @{ "X-StreamVolume-Guard-Token" = "secret-local" }
```

Puis ajouter `-Headers $headers` a la commande `Invoke-WebRequest`.

```powershell
$body = @{
  type = "browser_source_observed"
  browserProcess = "Chrome"
  sourceId = "manual-test:youtube"
  tabId = 1
  siteName = "YouTube"
  title = "Manual bridge test"
  currentLevel = 0.82
  appliedGain = 0.72
  status = "Risky"
  origin = "BrowserExtension"
  controlSurface = "BrowserGain"
  isControllable = $true
  lastSeen = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json

Invoke-WebRequest -UseBasicParsing -Method Post -Uri "http://127.0.0.1:47841/browser-source" -ContentType "application/json" -Body $body
```

Attendu :

- [ ] Une ligne apparait dans `Sous-sources navigateur`.
- [ ] `origin` affiche `BrowserExtension`.
- [ ] `controlSurface` affiche `BrowserGain`.
- [ ] `isControllable` / `Contrôlable` indique `Oui` ou `true`.
- [ ] Les logs contiennent `browser.source.received`.
- [ ] Si un token est configure, un POST sans `X-StreamVolume-Guard-Token` est refuse avec `401`.
- [ ] Si un token est configure, `GET /global-target` sans `X-StreamVolume-Guard-Token` est refuse avec `401`.
- [ ] Si un token est configure, `POST /extension-log` sans `X-StreamVolume-Guard-Token` est refuse avec `401`.
- [ ] `GET /health` reste accessible sans token pour le diagnostic local.

### POST invalide

```powershell
try {
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri "http://127.0.0.1:47841/browser-source" -ContentType "application/json" -Body '{"type":"bad"}'
} catch {
  $_.Exception.Response.StatusCode.value__
}
```

Attendu :

- [ ] Le bridge refuse avec `400`.
- [ ] Le desktop ne crash pas.
- [ ] Les logs contiennent `bridge.message.invalid` ou une erreur equivalente.

---

## 6. Test Extension Connectee Au Bridge

Dossier extension a charger :

```text
D:\Codex\StreamVolume Guard Hybride\apps\browser-extension
```

Navigateurs recommandes pour cette alpha : Chrome, Brave ou Edge.

### Chrome, Brave Ou Edge

1. Ouvrir `chrome://extensions`, `brave://extensions` ou `edge://extensions`.
2. Activer le mode developpeur.
3. Cliquer `Charger l'extension non empaquetee`.
4. Selectionner `D:\Codex\StreamVolume Guard Hybride\apps\browser-extension`.
5. Fermer temporairement le desktop ou le laisser ferme si ce test n'a pas encore commence.
6. Ouvrir le popup de l'extension.
7. Verifier que le popup indique `Mode autonome`.
8. Relancer ou garder ouvert le desktop.
9. Rouvrir le popup de l'extension et verifier qu'il indique `App connectee` apres 1 a 3 secondes.
10. Ouvrir une seule page audio.
11. Mettre Play.
12. Attendre 10 a 15 secondes.
13. Copier les logs.

### Firefox Desktop Temporaire

Firefox n'est pas le chemin principal de validation alpha. Le manifest MV3 courant peut etre refuse ou se comporter differemment pour `tabCapture`/`offscreen`.

1. Ouvrir `about:debugging#/runtime/this-firefox`.
2. Cliquer `Charger un module complementaire temporaire`.
3. Selectionner `D:\Codex\StreamVolume Guard Hybride\apps\browser-extension\manifest.json`.
4. Si Firefox accepte le chargement, tester le popup puis une source seule.
5. Si Firefox refuse ou si la capture audio ne fonctionne pas, noter la limite et repasser sur Chrome, Brave ou Edge.

### Safari Et Firefox Android

Safari et Firefox Android ne sont pas fournis dans le package alpha Hub. Ne pas les bloquer pour `v0.1.0-alpha.1`.

Validation attendue :

- [ ] L'extension se charge sans erreur visible.
- [ ] Si le desktop est ferme, l'extension ne crash pas.
- [ ] Si le desktop est ferme, le popup indique `Mode autonome`.
- [ ] Si le desktop est ouvert, le popup indique `App connectee`.
- [ ] Cote desktop, le resume passe de `App seule` a `Extension connectee` apres un log ou une source extension.
- [ ] Avec le desktop ouvert, au moins une source navigateur peut etre envoyee.
- [ ] Le desktop recoit une ligne `BrowserExtension`.
- [ ] `controlSurface` est `BrowserGain`, `ObserveOnly` ou `Unknown`, mais jamais invente.
- [ ] `isControllable` est visible et coherent avec `controlSurface`.
- [ ] Aucune URL complete, audio brut ou donnee personnelle n'apparait dans les logs.

---

## 6bis. Test Design Desktop

Objectif : verifier que l'app desktop colle visuellement a l'extension navigateur.

Actions :

- [ ] Lancer l'app desktop.
- [ ] Verifier que le theme clair est actif par defaut.
- [ ] Comparer visuellement avec l'extension : header bleu nuit, fond clair, cartes blanches, bordures fines.
- [ ] Verifier que les badges `Local`, `Open source`, `Zero tracking` et `Sans compte` sont visibles.
- [ ] Cliquer sur `Mode sombre`.
- [ ] Verifier que le theme sombre est lisible.
- [ ] Fermer l'app desktop.
- [ ] Relancer l'app desktop.
- [ ] Verifier que le theme sombre est toujours actif.
- [ ] Cliquer sur `Mode clair`.
- [ ] Verifier que le retour en clair est immediat.
- [ ] Fermer puis relancer l'app desktop.
- [ ] Verifier que le theme clair est toujours actif.
- [ ] Verifier que `Panic` reste tres visible dans le header.
- [ ] Verifier que `Auto actif` reste facile a trouver.
- [ ] Verifier que les boutons logs/debug sont en bas et ne dominent pas l'ecran.
- [ ] Verifier que les tableaux `Applications Windows` et `Sources navigateur` restent lisibles.
- [ ] Verifier que la ligne `Sons systeme Windows`, si visible, reste une source speciale anti-pic : elle peut descendre mais ne doit pas etre boostee automatiquement.
- [ ] Verifier que `Sons système Windows` reste groupe en une seule ligne.

Validation attendue :

- [ ] Le desktop ressemble au meme produit que l'extension.
- [ ] Le theme clair est confortable pour tester longtemps.
- [ ] Le mode sombre est utilisable sans redemarrage.
- [ ] Les limites de controle restent visibles : `Controle`, `ControlSurface`, `Contrôlable`, `ObserveOnly`, `Unknown`.

---

## 7. Test Source Par Source - Navigateur

Important : pour le premier passage, mettre Play sur une seule page a la fois. Si la source est `BrowserGain`, controlable et `locked`, l'extension doit la calibrer en priorite. Si elle est encore `measuring`, `ObserveOnly`, `Unknown`, `skipped` ou sans signal exploitable, le desktop peut retomber sur le volume Windows global du navigateur.

Etat BrowserGain : si une sous-source affiche `controlSurface=BrowserGain`, verifier aussi `Calibration`. Le premier chemin attendu est `measuring` pendant environ 12 secondes, puis `locked` avec un `appliedGainDb`. Pendant `measuring` ou `no-signal`, le fallback Windows du navigateur peut bouger pour que le changement de cible soit effectif rapidement. Ensuite, un changement Calme/Standard/Fort doit recalculer le gain navigateur rapidement depuis la mesure fiable existante, et peut aussi appliquer un fallback Windows ponctuel avec `reason=windows-fast-target`. Une source non exploitable doit rester `ObserveOnly`, `Unknown` ou `skipped`, sans fausse promesse de controle.

Avant chaque source web :

- [ ] Mettre les autres pages web en pause.
- [ ] Attendre quelques secondes que la session navigateur retombe au silence si une source vient d'etre testee.
- [ ] Garder `Auto actif` selon le scenario teste.

### YouTube seul

- [ ] Mettre Play sur YouTube seulement.
- [ ] Attendre 10 a 15 secondes.
- [ ] Verifier si le navigateur apparait dans `Sources Windows`.
- [ ] Verifier si une sous-source apparait dans `Sous-sources navigateur`.
- [ ] Si `controlSurface=BrowserGain`, verifier que la calibration reste en `measuring` pendant la fenetre robuste, passe vers `locked`, et que le fallback Windows peut bouger pendant `measuring` ou lors d'un changement volontaire de cible.
- [ ] Si l'intro est calme, verifier que l'extension ne booste pas avant la fin de la fenetre fiable.
- [ ] Si le debut est tres fort, verifier que les logs peuvent indiquer `safety-attenuation` sans attendre la fin de la fenetre.
- [ ] Si `controlSurface=ObserveOnly`, `Unknown` ou `skipped`, verifier que le fallback Windows global reste comprehensible.
- [ ] Noter `origin`.
- [ ] Noter `controlSurface`.
- [ ] Noter `isControllable`.
- [ ] Copier les logs.
- [ ] Mettre YouTube en pause avant le test suivant.

### TikTok seul

- [ ] Mettre Play sur TikTok seulement.
- [ ] Attendre 10 a 15 secondes.
- [ ] Verifier la session Windows.
- [ ] Verifier la sous-source navigateur.
- [ ] Si TikTok est `BrowserGain`, verifier `Calibration=locked` ou un etat de calibration lisible.
- [ ] Si TikTok est `ObserveOnly`, `Unknown`, `skipped` ou `no-signal`, verifier que le fallback Windows global reste possible si c'est la seule page qui joue.
- [ ] Dans les logs, verifier une ligne `browser.source.received` pour TikTok ou une source `tab-capture`.
- [ ] Si `controlSurface=BrowserGain`, noter `calibrationState`, `measuredRmsDb` et `appliedGainDb` quand ils sont visibles dans les logs.
- [ ] Si `controlSurface=ObserveOnly`, `status=Unknown` ou `calibrationState=skipped`, noter que TikTok est visible mais pas controlable proprement par l'extension ; le controle attendu reste alors le fallback Windows global.
- [ ] Copier les logs.
- [ ] Mettre TikTok en pause avant le test suivant.

### Spotify Web ou Deezer Web seul

- [ ] Mettre Play sur Spotify Web ou Deezer Web seulement.
- [ ] Attendre 10 a 15 secondes.
- [ ] Verifier la session Windows.
- [ ] Verifier la sous-source navigateur.
- [ ] Si Spotify Web/Deezer Web est `BrowserGain`, verifier la calibration extension. Le volume Windows global peut bouger pendant `measuring` ou apres un clic volontaire de cible ; il doit surtout eviter de boucler en continu une fois `BrowserGain` verrouille.
- [ ] Si le bouton repasse inactif juste apres le clic, recharger la page web puis l'extension ; si le message `Activation impossible sur cet onglet` apparait, copier le diagnostic popup.
- [ ] Sinon, verifier que le fallback Windows global reste coherent si c'est la seule page qui joue.
- [ ] Noter `origin`, `controlSurface`, `status`, `isControllable`.
- [ ] Si la source commence en `media-html` avec `level=0%` alors que l'onglet est audible, attendre quelques secondes de plus.
- [ ] Verifier si les logs contiennent `extension.browser.media_html_silent_upgrade`.
- [ ] Verifier si une source `tab-capture` apparait ensuite pour le meme onglet.
- [ ] Si `tab-capture` devient `BrowserGain`, noter que l'onglet est controlable par l'extension et verifier `Calibration`.
- [ ] Si `tab-capture` reste `ObserveOnly`, `no-signal`, `waiting-for-audio` ou `skipped`, noter que l'onglet est visible mais pas controlable par l'extension.
- [ ] Copier les logs.
- [ ] Mettre la page en pause.

Validation globale navigateur :

- [ ] Windows peut regrouper les onglets sous une seule session navigateur.
- [ ] Quand une source `BrowserGain` est controlable, l'extension est le controle principal de cette sous-source.
- [ ] Quand la source navigateur n'est pas controlable, la session Windows du navigateur reste le fallback principal.
- [ ] L'extension apporte le detail par site/onglet quand possible.
- [ ] `BrowserGain` est valide uniquement si la calibration et l'anti-conflit sont visibles.
- [ ] Une source non controlable reste visible en `ObserveOnly` ou `Unknown`.
- [ ] L'UI explique clairement ce qui est controlable ou non.

---

## 8. Test Applications Windows Separees

Tester une app a la fois.

Apps conseillees :
- VLC ;
- Discord ;
- Spotify desktop ;
- Deezer desktop ;
- jeu ou application audio Windows.

Pour chaque app :

- [ ] Lancer l'app.
- [ ] Produire du son.
- [ ] Attendre 10 a 15 secondes.
- [ ] Verifier si elle apparait dans le melangeur Windows.
- [ ] Verifier si elle apparait dans StreamVolume Guard Hub.
- [ ] Verifier `controlSurface = WindowsSessionVolume` si elle est controlable.
- [ ] Copier les logs.
- [ ] Mettre pause ou fermer avant de passer a l'app suivante.

Note : si une app est absente du melangeur Windows, elle peut aussi etre absente de StreamVolume Guard Hub.


---

## Note UI - Sons Systeme Windows

Si Windows expose plusieurs lignes identiques du type `@%SystemRoot%\System32\AudioSrv.Dll,-202`, l'app ne doit pas les afficher une par une.

Attendu :

- [ ] Une seule entree visible : `Sons système Windows`.
- [ ] Les details peuvent rester dans les logs pour debug.
- [ ] Les doublons `AudioSrv.Dll,-202` ne polluent pas la liste principale.
- [ ] Le controle manuel sur cette entree agit comme un groupe quand Windows permet le controle.
- [ ] Les tests automatiques desktop couvrent cette regle de regroupement.

---

## 9. Test Observation Avant Auto

Avant d'activer `Auto actif`, rester en observation.

Actions :

- [ ] Verifier que `Auto actif` est decoche.
- [ ] Lancer une source forte.
- [ ] Attendre 20 a 30 secondes.
- [ ] Cliquer `Copier logs` pour copier le rapport lisible de la session de test courante.
- [ ] Chercher `volume.would_apply`, surtout dans la section `Logs bruts`.

Validation attendue :

- [ ] L'app indique ce qu'elle ferait.
- [ ] Les volumes Windows ne changent pas encore.
- [ ] Le testeur comprend la decision avant de donner la main a l'automatique.

---

## 10. Test Normalisation Auto

A faire seulement apres le mode observation.

Actions :

- [ ] Cocher `Auto actif`.
- [ ] Choisir une source forte.
- [ ] Laisser jouer 20 a 30 secondes.
- [ ] Verifier qu'elle recoit une seule correction automatique au debut du test.
- [ ] Verifier que le volume ne continue pas a descendre toutes les secondes pendant la meme lecture.
- [ ] Si la meme source devient soudainement tres forte apres quelques secondes, verifier qu'une seule correction de securite peut passer avec `reason=safety-spike`.
- [ ] Verifier que `safety-spike` ne descend pas sous la cible active : environ 40% en `Calme`, 70% en `Standard`, 100% en `Fort`, ou 15% au minimum personnalise. `Panic` reste le cas d'urgence separe.
- [ ] Choisir une source faible.
- [ ] Verifier qu'elle recoit au plus une correction douce si le moteur la classe comme trop faible.
- [ ] Couper ou mettre en pause la source pendant au moins 6 secondes, puis relancer.
- [ ] Verifier qu'une nouvelle correction devient possible apres cette vraie pause.
- [ ] Copier les logs.

Validation attendue :

- [ ] Correction ponctuelle, pas de mouvement continu du fader.
- [ ] Log `volume.auto` visible pour la correction appliquee.
- [ ] Log `volume.auto_locked` visible si la source reste trop forte/faible apres la premiere correction.
- [ ] Le cas `safety-spike` ne boucle pas : apres cette correction de securite, les corrections suivantes restent verrouillees jusqu'a silence durable, disparition, ou changement de cible.
- [ ] Le cas `safety-spike` respecte le profil actif et le plancher 15% quand le slider est au minimum.
- [ ] Pas de gresillement.
- [ ] Pas de mute non demande.
- [ ] Les logs indiquent les corrections reelles.

---

## 10bis. Test Cible Voulue Pendant Lecture

Objectif : verifier que le slider `Cible volume` ne change pas seulement l'affichage, mais reconfigure les sources deja actives de facon lisible.

Principe attendu : les profils pilotent directement le volume du melangeur Windows. `Calme` vise environ 40%, `Standard` environ 70%, et `Fort` environ 100%.

Les boutons `Calme`, `Standard` et `Fort` doivent afficher le profil actif en vert. Le slider personnalise doit pouvoir descendre jusqu'a environ 15% du melangeur Windows.

Exception attendue : `Sons systeme Windows` est une source speciale anti-pic. L'app peut le baisser si c'est trop fort, et `Panic` peut le baisser, mais `Standard` ou `Fort` ne doivent pas le remonter automatiquement comme une musique ou une video.

### Source Windows

- [ ] Avant de lancer l'app, mettre une source deja visible dans le melangeur Windows a 100%.
- [ ] Lancer StreamVolume Guard Hub.
- [ ] Verifier que l'app se cale en `Fort`, que le bouton `Fort` est vert, et que le volume ne descend pas au demarrage.
- [ ] Verifier que les logs contiennent `startup.references.captured` et, si une source controlable etait visible, `trigger=startup-windows-volume`.
- [ ] Cocher `Auto actif`.
- [ ] Lancer une source Windows controlable : VLC, Spotify desktop, Discord ou navigateur visible dans `Sources Windows`.
- [ ] Noter son volume Windows actuel pour comparer le mouvement du fader.
- [ ] Attendre une premiere decision `volume.auto` ou `volume.auto_locked`.
- [ ] Changer `Cible volume` vers `Calme`.
- [ ] Attendre 5 a 10 secondes.
- [ ] Verifier que le volume Windows descend vers environ 40%.
- [ ] Attendre encore 5 secondes et verifier qu'il ne descend pas ensuite vers 32%.
- [ ] Changer `Cible volume` vers `Standard`.
- [ ] Attendre 5 a 10 secondes.
- [ ] Verifier que le volume Windows remonte vers environ 70%.
- [ ] Attendre encore 5 secondes et verifier qu'il ne redescend pas ensuite vers 62%.
- [ ] Changer `Cible volume` vers `Fort`.
- [ ] Attendre 5 a 10 secondes.
- [ ] Verifier que le volume Windows remonte vers environ 100%.
- [ ] Attendre encore 5 secondes et verifier qu'il ne redescend pas ensuite vers 92%.
- [ ] Verifier que les logs contiennent `target.changed`.
- [ ] Verifier que les logs contiennent `volume.auto` avec `reason=profile-target`.
- [ ] Recliqueter le meme profil 3 a 5 fois.
- [ ] Verifier que le volume ne bouge plus et qu'aucun nouveau `target.changed` n'est ajoute pour ces clics identiques.
- [ ] Si `Sons systeme Windows` est visible a un volume bas, changer vers `Fort` et verifier qu'il ne remonte pas automatiquement.
- [ ] Si `Sons systeme Windows` est visible a un volume haut, changer vers `Calme` ou utiliser `Panic` et verifier qu'il peut descendre.
- [ ] Monter manuellement la meme source a 100% dans le melangeur Windows.
- [ ] Cliquer `Nouveau test`.
- [ ] Verifier que le volume reste a 100%.
- [ ] Mettre Play avec `Auto actif`.
- [ ] Verifier que l'app passe en `Fort` si elle detecte le saut manuel Windows vers 100%.
- [ ] Verifier que le volume ne redescend pas automatiquement vers `Calme`.
- [ ] Verifier que le bouton `Fort` devient vert.
- [ ] Deplacer le slider de cible tout a gauche.
- [ ] Verifier que la cible personnalisee peut descendre vers environ 15%.
- [ ] Avec le slider au minimum, verifier qu'une source deja a ce plancher ne descend pas plus bas avec `safety-spike`.
- [ ] Si aucun volume ne bouge, verifier d'abord que `Auto actif=True` dans les logs.

### Source Navigateur

- [ ] Garder le desktop et l'extension ouverts.
- [ ] Proteger un onglet YouTube, Spotify Web, Deezer Web ou TikTok.
- [ ] Mettre Play et attendre une ligne `browser.source.received`.
- [ ] Changer `Cible volume` dans le desktop.
- [ ] Attendre 5 a 10 secondes sans cliquer dans l'extension.
- [ ] Verifier que l'onglet continue d'envoyer des statuts live.
- [ ] Si la source reste `BrowserGain` et que `Calibration=locked`, verifier que la cible applique vite un nouveau gain (`browser.gain.rearmed`, `browser.gain.applied`, puis `browser.gain.locked`) sans attendre une nouvelle fenetre complete.
- [ ] Verifier que le changement volontaire de cible peut aussi produire une correction Windows rapide avec `reason=windows-fast-target`, puis que le volume ne boucle pas en continu.
- [ ] Si la source devient `measuring`, `ObserveOnly`, `Unknown`, `no-signal` ou `skipped`, verifier que le fallback Windows global est clairement visible dans les logs/UI.
- [ ] Copier les logs.

Validation attendue :

- [ ] En mode observation (`Auto actif` decoche), le desktop logge seulement `volume.would_apply`.
- [ ] En `Auto actif`, une source Windows peut descendre avec `Calme` vers 40% puis remonter avec `Fort` vers 100%.
- [ ] `Sons systeme Windows` est affiche mais reste protect-only : il peut descendre, il ne remonte pas automatiquement.
- [ ] Apres application du profil, le verrou one-shot evite les mouvements continus du fader.
- [ ] Recliqueter le profil deja actif ne rearme pas la correction et ne change pas le volume.
- [ ] Un saut manuel Windows vers 100% passe la cible en `Fort` sans baisser immediatement la source.
- [ ] Pour le navigateur, l'extension lit la cible desktop via le bridge et rafraichit les onglets proteges sans action manuelle.
- [ ] Aucune source `ObserveOnly` ou `Unknown` n'est presentee comme controlable.

---

## 11. Test Controle Manuel, Exclusions Et Panic

### Controle manuel

- [ ] Deplacer un slider dans StreamVolume Guard Hub.
- [ ] Verifier que le volume change dans le melangeur Windows.
- [ ] Verifier que l'auto ne reprend pas immediatement la main contre ton choix.
- [ ] Verifier que ton reglage manuel est respecte pendant le cooldown manuel ; ensuite, un vrai changement de profil peut reprendre la main si `Auto actif` est coche.

### Exclusions

- [ ] Cocher l'exclusion sur Discord, OBS ou navigateur.
- [ ] Laisser cette source produire du son.
- [ ] Verifier qu'elle n'est plus corrigee automatiquement.
- [ ] Appuyer sur Panic.
- [ ] Verifier que la source exclue ne baisse pas a cause de Panic, si c'est la regle retenue.

### Panic

- [ ] Lancer plusieurs sources audio.
- [ ] Appuyer sur Panic.
- [ ] Verifier que les sources surveillees baissent rapidement.
- [ ] Verifier qu'aucune source n'est mutee definitivement.
- [ ] Copier les logs.

---

## 12. Test OBS Manuel

OBS ne fournit pas encore de donnees automatiques a StreamVolume Guard Hub.

Actions :

- [ ] Ouvrir OBS avec les meters visibles.
- [ ] Lancer une source forte dans le navigateur.
- [ ] Lancer une autre source dans une app separee.
- [ ] Observer les meters OBS pendant les corrections Windows et navigateur.
- [ ] Noter si les gros ecarts semblent reduits.
- [ ] Copier les logs desktop.

Validation attendue :

- [ ] OBS sert de controle visuel manuel.
- [ ] StreamVolume Guard Hub ne pretend pas lire les scenes OBS.
- [ ] StreamVolume Guard Hub ne pretend pas lire les meters internes OBS.
- [ ] Le rapport note si OBS capture avant ou apres les corrections selon la config utilisateur.

---

## 13. Logs A Copier Pendant Les Tests

Dossier attendu :

```text
%LOCALAPPDATA%\StreamVolumeGuard\logs
```

Les fichiers restent journaliers, mais chaque ligne contient maintenant :

- `runId` : change a chaque lancement de l'app ;
- `testSessionId` : change quand on clique `Nouveau test`.

Methode conseillee :

- [ ] Cliquer `Nouveau test` au debut d'un scenario ou avant une nouvelle serie propre.
- [ ] Verifier que `Nouveau test` ne bouge pas les volumes : il cree une nouvelle session de logs et capture un snapshot du melangeur Windows pour le diagnostic.
- [ ] Cliquer `Marquer etape` avant chaque source.
- [ ] Tester une seule source.
- [ ] Attendre 10 a 15 secondes.
- [ ] Cliquer `Copier logs` pour copier le rapport lisible de la session de test courante.
- [ ] Coller le rapport dans Codex si analyse necessaire.
- [ ] Verifier que le texte colle commence par `# Rapport StreamVolume Guard Hub`.
- [ ] Verifier qu'il contient `Session`, `Sources`, `Corrections appliquees`, `Alertes`, puis `Logs bruts`.
- [ ] Verifier que la section `Session` affiche `Auto actif`, `Profil`, `Sources navigateur visibles` et `Sessions Windows visibles` avec les valeurs du test, pas `inconnu` si `tester.session.start` ou `tester.mark` les contient.
- [ ] Verifier qu'une source navigateur avec `targetProfile=stream` ou un evenement `volume.auto_locked` ne remplace pas le profil global affiche dans l'en-tete du rapport.

Evenements utiles :

```text
tester.session.start
tester.references.captured
startup.references.captured
tester.mark
bridge.start
browser.source.received
extension.browser.target.synced
extension.browser.media_html_silent_upgrade
extension.browser.media_html_silent_upgrade_failed
extension.tabcapture.status
bridge.message.invalid
volume.would_apply
volume.auto
target.changed avec trigger=startup-windows-volume
target.changed avec trigger=windows-manual-volume
profile-target (reason dans `volume.auto`)
volume.panic
browser.source.simulated
safety-spike (reason dans `volume.auto`)
browser.calibration.started
browser.calibration.measured
browser.gain.applied
browser.gain.locked
browser.gain.skipped
browser.gain.rearmed
volume.browser_conflict_skip
stable-window-complete (reason de calibration)
insufficient-signal (reason de skip)
safety-attenuation (reason d'attenuation temporaire)
durable-level-shift (reason de rearm)
```

Les logs ne doivent pas contenir :

- [ ] audio brut ;
- [ ] message Discord ;
- [ ] scene OBS ;
- [ ] historique de navigation ;
- [ ] URL complete ;
- [ ] compte utilisateur.
- [ ] token bridge.

---

## 14. Tests Combines Apres Les Tests Unitaires Manuels

A faire seulement apres avoir teste chaque source seule.

Limite importante a verifier et expliquer au testeur :

- Si musique et video jouent dans le meme navigateur sans sous-source `BrowserGain` exploitable pour les separer, le mode Windows global ne peut pas les separer : le slider Windows du navigateur bouge les deux ensemble.
- Pour garder une musique de fond plus forte ou plus stable qu'une video web, utiliser deux sources Windows separees quand c'est possible, par exemple Spotify desktop/VLC pour la musique et Firefox/Brave pour la video.
- Une source exclue reste en controle manuel : son slider dans l'app peut etre regle par l'utilisateur, tandis que les autres sources non exclues restent gerees par Auto.
- Le controle fin par onglet depend de l'extension et du site ; une sous-source `ObserveOnly` ou `Unknown` ne doit pas etre presentee comme controlable.

- [ ] YouTube + TikTok dans le meme navigateur.
- [ ] YouTube + Spotify Web dans le meme navigateur.
- [ ] Navigateur + VLC.
- [ ] Navigateur + Discord.
- [ ] Navigateur + Spotify desktop.
- [ ] Navigateur + OBS ouvert.
- [ ] Deux apps Windows separees en meme temps.
- [ ] Auto actif pendant un test combine.
- [ ] Auto inactif pendant un test combine.
- [ ] Logs copies pour chaque combinaison importante.

Validation attendue :

- [ ] Les sources restent lisibles.
- [ ] Les onglets ne sont pas presentes comme controlables s'ils ne le sont pas.
- [ ] Le navigateur entier reste visible comme session Windows.
- [ ] Les sous-sources navigateur restent visibles quand l'extension les envoie.
- [ ] Avec une seule page web active, `BrowserGain` est prioritaire si la sous-source est controlable et `locked` ; sinon la correction Windows globale du navigateur reste le fallback.
- [ ] Avec plusieurs onglets actifs en meme temps, noter que le controle Windows global bouge tout le navigateur si l'extension ne peut pas exposer et calibrer chaque sous-source. Les priorites utilisateur multi-onglets restent un chantier futur.
- [ ] Aucune correction en boucle ne doit apparaitre entre `BrowserGain` verrouille et `WindowsSessionVolume` pour le meme navigateur. Un mouvement Windows ponctuel apres changement volontaire de cible est attendu.

---

## 15. Cas A Signaler

Signaler comme limite ou bug possible :

- [ ] Source visible dans le melangeur Windows mais absente de StreamVolume Guard Hub.
- [ ] Source visible mais non controlable.
- [ ] Source marquee `Unknown` sans explication lisible.
- [ ] Sous-source navigateur absente alors que l'extension est active.
- [ ] Tous les onglets navigateur regroupes sans explication dans l'UI.
- [ ] App qui change de session apres pause/reprise.
- [ ] Jeu ou app en mode audio exclusif qui ignore le volume Windows.
- [ ] Volume qui oscille trop souvent.
- [ ] Coupure, mute, gresillement, latence ou crash.
- [ ] Logs trop bavards ou contenant une donnee sensible.

---

## 16. Format De Rapport Testeur

```text
Windows :
Peripherique audio de sortie :
Version / commit teste si connu :
Navigateur utilise :
Extension chargee : oui/non
Onglets web testes : YouTube / TikTok / Spotify Web / autre
Apps separees testees :
OBS ouvert : oui/non
Auto actif au debut : oui/non

Commandes lancees depuis : D:\Codex\StreamVolume Guard Hybride
Test protocole : OK / KO / non lance
Tests extension : OK / KO / non lance
Checks JS extension : OK / KO / non lance
Tests desktop : OK / KO / non lance
Build desktop : OK / KO / non lance

Bridge health OK : oui/non
POST manuel bridge OK : oui/non
Extension -> desktop OK : oui/non
Statut popup extension : Mode autonome / App connectee / autre
Statut desktop liaison extension : App seule / Extension connectee / autre
Sources vues dans StreamVolume Guard Hub :
Sources vues dans le melangeur Windows :
Sous-sources navigateur reelles visibles : oui/non
Sous-sources navigateur simulees visibles : oui/non
Origine BrowserExtension visible : oui/non
Controle BrowserGain / ObserveOnly visible : oui/non
Les onglets navigateur sont separes ou regroupes :
Mode observation garde les volumes intacts : oui/non
volume.would_apply visible dans les logs : oui/non
Normalisation source forte -> correction one-shot puis verrou : oui/non
Normalisation source faible -> correction douce one-shot : oui/non
volume.auto_locked visible si la source reste active : oui/non
Controle manuel respecte : oui/non
Exclusion respectee : oui/non
Panic respecte : oui/non
OBS observe manuellement : oui/non
Logs copies apres chaque source : oui/non
Sources ObserveOnly ou Unknown vues :
Problemes observes :
Conclusion : valide / a corriger / bloque
```

---

## 17. Critere De Validation Actuel

La base actuelle est valide pour test local si :

- [ ] Les tests protocole, extension et desktop passent.
- [ ] Le build desktop passe.
- [ ] L'app se lance en mode observation.
- [ ] Le bridge repond sur `127.0.0.1:47841`.
- [ ] L'extension affiche `Mode autonome` sans desktop et `App connectee` quand le desktop repond a `/health`.
- [ ] Le desktop affiche `App seule` avant reception extension et `Extension connectee` apres reception d'une source ou d'un log extension.
- [ ] Un `POST /browser-source` manuel affiche une sous-source navigateur.
- [ ] L'extension peut envoyer au moins une sous-source navigateur reelle.
- [ ] L'extension peut envoyer des evenements utiles dans le journal local via `POST /extension-log`.
- [ ] Une source navigateur `media-html` muette alors que l'onglet est audible peut tenter une bascule generique vers `tab-capture`, sans patch cible par site, mais ce n'est pas bloquant pour le mode navigateur global.
- [ ] La session Windows du navigateur peut etre corrigee globalement quand une seule page web joue.
- [ ] Les sessions Windows visibles dans le melangeur apparaissent quand Windows les expose.
- [ ] Chaque source affiche clairement son origine et sa surface de controle.
- [ ] Les sources non controlables sont `ObserveOnly` ou `Unknown`.
- [ ] `Auto actif` est necessaire avant toute correction Windows reelle.
- [ ] `Auto actif` et les exclusions persistent dans `%LOCALAPPDATA%\StreamVolumeGuard\config.json`.
- [ ] Les corrections Auto sont ponctuelles par source active et ne bougent pas le fader en continu.
- [ ] Le controle manuel, les exclusions et Panic sont respectes.
- [ ] Les logs sont locaux, utiles et non sensibles.
- [ ] OBS est traite comme verification visuelle manuelle.
- [ ] Aucune action courante ne provoque mute, gresillement ou crash.

---

## 18. Prochaines Validations Apres Cette Version

Apres cette version testable, la suite logique est :

- campagne reelle YouTube, TikTok, Spotify Web, Deezer Web, Discord, VLC et OBS ;
- stabilisation V1 apres retours du package testeur ;
- meilleure calibration OBS manuelle ;
- token local ou protection equivalente si le bridge doit sortir d'un usage dev/test.

