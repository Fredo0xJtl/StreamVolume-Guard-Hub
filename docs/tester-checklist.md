# Checklist De Test - StreamVolume Guard Hub V1

Objectif : tester la V1 hybride comme un vrai utilisateur, sans melanger les commandes techniques et les tests manuels.

Cette checklist verifie :
- desktop Windows : sessions audio Windows, controle manuel, observation, Auto, exclusions, Panic, logs ;
- sortie globale Windows : mesure lecture seule RMS/pic/etat du mix final, sans controle du volume master ;
- bridge local : reception sur `127.0.0.1:47841` ;
- extension navigateur : envoi local `browser_source_observed` quand une source web est observee ;
- protocole : classification obligatoire par `origin`, `controlSurface`, `status` et `isControllable` ;
- OBS : securite finale manuelle avec Application Audio Capture, Compressor et Limiter ; pas encore lecture automatique des meters.

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
node --check "apps/browser-extension/audio/browser-gain-calibration.js"
node --check "apps/browser-extension/audio/normalizer.js"
node --check "apps/browser-extension/bridge/client.js"
node --check "apps/browser-extension/background.js"
node --check "apps/browser-extension/content.js"
node --check "apps/browser-extension/offscreen/offscreen.js"
node --check "apps/browser-extension/popup/popup.js"
node --check "apps/browser-extension/options/options.js"
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
D:\Codex\StreamVolume Guard Hybride\artifacts\tester\StreamVolumeGuardHub-Tester-v0.1.38.zip
```

Checksum attendu :

```text
D:\Codex\StreamVolume Guard Hybride\artifacts\tester\StreamVolumeGuardHub-Tester-v0.1.38.zip.sha256.txt
```

Checklist :

- [ ] Le dossier package existe.
- [ ] Le zip package existe.
- [ ] Le checksum SHA256 existe.
- [ ] Le package contient `Lancer StreamVolume Guard Hub Desktop.cmd`.
- [ ] Le package contient `browser-extension\manifest.json`.
- [ ] Dans Chrome/Brave/Edge, la carte extension affiche la version `0.1.38`.
- [ ] Le package contient `README.md`, `CHECKLIST.md`, `CHECKLIST-COMPLETE.md` et `LICENSE`.
- [ ] Le desktop package se lance sans installer le runtime .NET.
- [ ] Le testeur n'a pas besoin d'ouvrir `StreamVolumeGuard.Desktop.sln`.
- [ ] Si Windows SmartScreen affiche un avertissement, il est note comme limite alpha non signee.

---

## 4. Lancement Desktop

Depuis PowerShell :

```powershell
cd "D:\Codex\StreamVolume Guard Hybride"
dotnet run --project "apps/desktop/src/StreamVolumeGuard.App/StreamVolumeGuard.App.csproj"
```

Validation attendue :

- [ ] La fenetre `StreamVolume Guard Hub Desktop` s'ouvre.
- [ ] La langue de l'app suit Windows au demarrage : francais si la langue systeme commence par `fr`, anglais pour toute autre langue.
- [ ] Au premier lancement, `Auto actif` est decoche. Si la config existe deja, son etat peut etre restaure.
- [ ] `Sources Windows` est visible.
- [ ] `Sous-sources navigateur` est visible.
- [ ] Le bloc `Sortie globale` est visible avec etat, RMS, pic recent et peripherique de sortie.
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

### Fermeture propre du desktop

Fermer la fenetre desktop, puis lancer :

```powershell
try {
  Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:47841/health" -TimeoutSec 2 | Select-Object -ExpandProperty Content
} catch {
  "OK: bridge local arrete"
}
```

Attendu :

- [ ] Le health check ne repond plus apres fermeture de la fenetre.
- [ ] En rouvrant le popup extension, le statut revient en `Mode autonome`.
- [ ] Relancer le desktop ne cree pas plusieurs instances concurrentes sur `127.0.0.1:47841`.

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
12. Avec le desktop ouvert, attendre 18 a 20 secondes si la source peut etre `BrowserGain`. En mode extension seule, une source HTML controlable doit reagir directement a la cible dB apres detection ; si elle n'est pas controlable, attendre 2 a 3 secondes pour obtenir `ObserveOnly` ou une raison claire. Sinon 10 a 15 secondes suffisent pour une simple observation Windows.
13. Copier les logs.

### Firefox Desktop Temporaire

Firefox n'est pas le chemin principal de validation alpha. Le manifest MV3 courant peut etre refuse ou se comporter differemment pour `tabCapture`/`offscreen`.

1. Ouvrir `about:debugging#/runtime/this-firefox`.
2. Cliquer `Charger un module complementaire temporaire`.
3. Selectionner `D:\Codex\StreamVolume Guard Hybride\apps\browser-extension\manifest.json`.
4. Si Firefox accepte le chargement, tester le popup puis une source seule.
5. Si Firefox refuse ou si la capture audio ne fonctionne pas, noter la limite et repasser sur Chrome, Brave ou Edge.

### Safari Et Firefox Android

Safari et Firefox Android ne sont pas fournis dans le package Hub. Ne pas les bloquer pour `v0.1.38`.

Validation attendue :

- [ ] L'extension se charge sans erreur visible.
- [ ] Si le desktop est ferme, l'extension ne crash pas.
- [ ] Si le desktop est ferme, le popup indique `Mode autonome`.
- [ ] Si le desktop est ferme et qu'une source web reste non controlable directement, le popup reste stable en observation au lieu de boucler actif/inactif.
- [ ] Dans ce cas, l'export diagnostic Options contient `desktopBridge.connected=false`, `fallbackRecommended=false` et `diagnosticQuality.reason=standalone-media-html-unavailable` si le lecteur web n'est pas controlable directement.
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
- [ ] Les limites de controle restent visibles : `Controle`, `ControlSurface`, `Contrôlable`, `Couverture`, `Action couverture`, `Raison`, `Action`, `ObserveOnly`, `Unknown`.
- [ ] La carte `Couverture` affiche un score et des buckets lisibles : `Direct`, `Fallback Windows`, `Action requise`, `Limite`, `Inconnu`.
- [ ] Une source navigateur non controlable directement n'est pas presentee comme `Direct` si elle depend seulement du fallback Windows global.

---

## 6ter. Test Sortie Globale

Objectif : verifier que le desktop observe le mix final Windows sans agir sur le volume master.

Actions :

- [ ] Lancer l'app desktop.
- [ ] Verifier que le bloc `Sortie globale` affiche un peripherique de sortie ou une erreur claire.
- [ ] Verifier que l'etat initial est `Silent`, `Safe`, `Risky` ou `Unknown`.
- [ ] Mettre toutes les sources en pause pendant 5 a 10 secondes.
- [ ] Verifier que l'etat tend vers `Silent` si Windows fournit la capture loopback.
- [ ] Lancer YouTube, TikTok, Spotify Web, VLC ou Discord seul.
- [ ] Verifier que `RMS` et `Pic recent` bougent dans le bloc `Sortie globale`.
- [ ] Si le son est tres fort, verifier que l'etat peut passer `Risky`.
- [ ] Si `Sortie globale` bouge mais que les lignes Windows/navigateur visibles restent silencieuses, verifier que l'app affiche une alerte de source inconnue active.
- [ ] Changer `Calme`, `Standard`, puis `Fort` dans l'app.
- [ ] Verifier que la sortie globale reflue ou remonte apres le mouvement des sources controlees.
- [ ] Ouvrir le melangeur Windows et verifier que le volume master Windows n'est pas modifie par ce bloc.
- [ ] Cliquer `Copier logs`.

Validation attendue :

- [ ] Le monitor est lecture seule : aucun volume master Windows ne bouge a cause de lui.
- [ ] Les logs contiennent `global_output.monitor.started`.
- [ ] Les logs contiennent `global_output.level` sans spam continu excessif.
- [ ] Si le mix est fort, les logs peuvent contenir `global_output.risky`.
- [ ] Si le mix est actif sans source connue active, les logs peuvent contenir `global_output.unknown_active`.
- [ ] Si tout est en pause, les logs peuvent contenir `global_output.silent`.
- [ ] Si la capture loopback est indisponible, l'app continue de fonctionner et les logs contiennent `global_output.error`.
- [ ] Le rapport lisible contient une section `Sortie globale`.
- [ ] Aucun audio brut, sample, buffer PCM ou fichier son n'est ecrit dans les logs.

---

## 6quater. Test Stream Safe Et Mode Test Guide

Objectif : verifier que les raccourcis de test aident sans masquer les limites.

Actions :

- [ ] Lancer l'app desktop.
- [ ] Cocher `Stream Safe`.
- [ ] Verifier que `Auto actif` est coche.
- [ ] Verifier que la cible revient a `Standard`.
- [ ] Verifier que les volumes ne bougent pas en boucle apres la correction ponctuelle.
- [ ] Cliquer `Demarrer guide`.
- [ ] Verifier que le statut de guide affiche la premiere etape.
- [ ] Cliquer `Etape suivante` plusieurs fois.
- [ ] Verifier que chaque clic change l'etape sans changer le volume tout seul.
- [ ] Cliquer `Guide OBS`.
- [ ] Verifier que la fenetre explique Application Audio Capture, Compressor et Limiter.
- [ ] Cliquer `Copier logs`.

Validation attendue :

- [ ] Les logs contiennent `stream_safe.enabled`.
- [ ] Les logs contiennent `guided_test.started`.
- [ ] Les logs contiennent `guided_test.step`.
- [ ] Les logs peuvent contenir `guided_test.completed` si toutes les etapes sont passees.
- [ ] Les logs contiennent `obs.guide.opened` apres ouverture du guide OBS.
- [ ] Le mode guide aide a tester, mais ne pretend pas lire automatiquement OBS.

---

## 7. Test Source Par Source - Navigateur

Important : pour le premier passage, mettre Play sur une seule page a la fois. Si la source est `BrowserGain`, controlable et `locked`, l'extension doit la calibrer en priorite. Si elle est encore `measuring`, `ObserveOnly`, `Unknown`, `skipped` ou sans signal exploitable, le desktop peut retomber sur le volume Windows global du navigateur.

Etat BrowserGain : le chemin prioritaire redevient `media-html`, comme dans l'ancien projet qui appliquait mieux la cible dB sur YouTube/Spotify quand un lecteur HTML etait accessible. Si `media-html` reste muet ou introuvable alors que l'onglet est audible, l'extension peut tenter l'upgrade generique `tab-capture` meme en mode extension seule ; si la capture donne `signal`, la cible dB doit agir, sinon la source reste en observation claire au lieu de promettre un controle direct fictif. Avec le desktop connecte, une sous-source `BrowserGain` passe par la calibration robuste : `measuring` pendant environ 18 secondes, environ 8 secondes de signal utile hors silence, puis `locked` avec un `appliedGainDb`. En mode autonome extension seule, il n'y a plus de calibration longue : si `mediaDetected>0` et `mediaProcessed>0`, la cible dB doit agir par gain direct ; sinon la source reste `ObserveOnly`, `Unknown` ou `skipped` avec une raison claire. Avec le desktop connecte, le fallback Windows du navigateur peut bouger pendant `measuring` ou `no-signal` pour que le changement de cible soit effectif rapidement. Ensuite, un changement Calme/Standard/Fort doit recalculer le gain navigateur rapidement depuis la mesure fiable existante, et peut aussi appliquer un fallback Windows ponctuel avec `reason=windows-fast-target`. Une source non exploitable doit rester `ObserveOnly`, `Unknown` ou `skipped`, sans fausse promesse de controle. Dans ce cas, lire `browserState`, `reason`, `recommendedAction` et les colonnes `Raison` / `Action` avant de conclure : elles doivent indiquer pourquoi le controle direct manque et proposer rechargement, reprotection, fallback Windows ou OBS selon le mode.

Avant chaque source web :

- [ ] Mettre les autres pages web en pause.
- [ ] Attendre quelques secondes que la session navigateur retombe au silence si une source vient d'etre testee.
- [ ] Garder `Auto actif` selon le scenario teste.

### YouTube seul

- [ ] Mettre Play sur YouTube seulement.
- [ ] Attendre 18 a 20 secondes si `BrowserGain` est possible avec le desktop connecte. En mode extension seule, verifier que la cible dB agit directement si `mediaProcessed>0`, ou que la source passe en `ObserveOnly` avec une raison lisible si aucun media controlable n'est trouve.
- [ ] Verifier si le navigateur apparait dans `Sources Windows`.
- [ ] Verifier si une sous-source apparait dans `Sous-sources navigateur`.
- [ ] Si `controlSurface=BrowserGain` avec desktop connecte, verifier que la calibration reste en `measuring` pendant la fenetre robuste, passe vers `locked`, et que le fallback Windows peut bouger pendant `measuring` ou lors d'un changement volontaire de cible. En mode extension seule, verifier plutot que la cible dB modifie rapidement le gain sans attendre `locked`.
- [ ] Sur Chrome, Brave ou Edge, verifier que la premiere sous-source apres `Proteger l'onglet actif` est `media-html` quand un lecteur HTML est accessible.
- [ ] Si `media-html` reste muet ou introuvable alors que l'onglet est audible, verifier qu'une bascule generique vers `tab-capture` peut apparaitre meme en mode extension seule, sans patch cible par site. Si `captureSignalState=signal`, la cible dB doit agir.
- [ ] Si l'intro est calme, verifier que l'extension ne booste pas avant la fin de la fenetre fiable.
- [ ] Si le debut est tres fort, verifier que les logs peuvent indiquer `safety-attenuation` sans attendre la fin de la fenetre.
- [ ] Si `controlSurface=ObserveOnly`, `Unknown` ou `skipped`, verifier que les colonnes `Raison` et `Action` expliquent le probleme et que le fallback Windows global reste comprehensible.
- [ ] Verifier que le diagnostic exporte un `browserState` coherent : `media-html-starting`, `media-html-signal`, `media-html-no-signal`, `tab-capture-starting`, `tab-capture-signal`, `tab-capture-no-signal`, `observe-only` ou `desktop-fallback-available`.
- [ ] Si `browserState=tab-capture-no-signal`, verifier que `captureFallbackReason=tab-capture-no-signal` et que `mediaHtmlFallbackReason` reste une limite HTML separee (`no-controllable-media-detected` ou `no-media-element-detected`), pas `tab-capture-no-signal`.
- [ ] Noter `origin`.
- [ ] Noter `controlSurface`.
- [ ] Noter `isControllable`.
- [ ] Copier les logs.
- [ ] Mettre YouTube en pause avant le test suivant.

### TikTok seul

- [ ] Mettre Play sur TikTok seulement.
- [ ] Attendre 18 a 20 secondes pour laisser la calibration robuste se terminer si un signal est exploitable.
- [ ] Verifier la session Windows.
- [ ] Verifier la sous-source navigateur.
- [ ] Si TikTok est `BrowserGain`, verifier `Calibration=locked` ou un etat de calibration lisible.
- [ ] Si TikTok est `ObserveOnly`, `Unknown`, `skipped` ou `no-signal`, verifier que `Raison` et `Action` expliquent le chemin suivant, et que le fallback Windows global reste possible si c'est la seule page qui joue.
- [ ] Si le diagnostic extension affiche `captureSignalState=no-signal` avec le desktop connecte, verifier aussi `fallbackRecommended=true` et `fallbackReason=tab-capture-no-signal`.
- [ ] Apres `tab-capture-no-signal`, le diagnostic ne doit pas rester en `sourceType=tab-capture` avec `captureTrackState=live` et `audioTrackCount=1` : la capture inutilisable doit etre arretee puis stabilisee en observation/fallback.
- [ ] Dans ce cas, la popup extension doit afficher `Controle via Windows` comme etat principal si l'app desktop est connectee. `Capture active, mais aucun signal audio detecte` peut rester visible seulement comme detail diagnostic.
- [ ] `Source incompatible` ne doit apparaitre comme etat principal que si aucun controle direct et aucun fallback Windows exploitable ne sont disponibles.
- [ ] Si le diagnostic affiche `captureSignalState=needs-user-action`, cliquer `Proteger l'onglet actif`.
- [ ] Si le diagnostic affiche `captureSignalState=restricted` ou `unsupported`, ne pas attendre `BrowserGain` : utiliser le fallback Windows global ou OBS.
- [ ] Si le bouton de la popup reste actif avec `tab-capture-no-signal`, c'est attendu : l'extension garde la source visible et laisse le desktop corriger le volume Windows du navigateur quand il est ouvert.
- [ ] Si le diagnostic revient en `sourceType=media-html` avec `mediaDetected=1` mais `mediaProcessed=0`, ce n'est pas un vrai controle navigateur : avec desktop connecte, le fallback Windows peut rester actif ; en mode extension seule, le diagnostic doit rester en observation.
- [ ] Dans ce cas, verifier `skippedAlreadyProcessed` dans le diagnostic. La valeur expose les medias HTML ignores comme deja traites ; apres les corrections `0.1.23` / `0.1.25`, elle ne doit pas augmenter en continu sur une page rechargee proprement.
- [ ] Juste apres activation, `sourceType=media-html`, `mediaDetected=0` et `mediaProcessed=0` ne doit pas declencher immediatement `Controle via Windows` : attendre la courte phase de detection ou relancer Play. Apres expiration, en mode autonome, la raison doit rester dans `mediaHtmlFallbackReason` avec `fallbackRecommended=false`; avec le desktop connecte, le fallback Windows peut etre propose.
- [ ] Si `captureSignalState=starting` reste visible apres 5 secondes avec `tabAudible=true`, copier le diagnostic extension : ce n'est pas l'etat attendu.
- [ ] Dans les logs, verifier une ligne `browser.source.received` pour TikTok ou une source `tab-capture`.
- [ ] Si `controlSurface=BrowserGain`, noter `calibrationState`, `measuredRmsDb` et `appliedGainDb` quand ils sont visibles dans les logs.
- [ ] Si `controlSurface=ObserveOnly`, `status=Unknown` ou `calibrationState=skipped`, noter que TikTok est visible mais pas controlable proprement par l'extension ; le controle attendu reste alors le fallback Windows global.
- [ ] Copier les logs.
- [ ] Mettre TikTok en pause avant le test suivant.

### Spotify Web ou Deezer Web seul

- [ ] Mettre Play sur Spotify Web ou Deezer Web seulement.
- [ ] Attendre 18 a 20 secondes si `BrowserGain` est possible avec le desktop connecte. En mode extension seule, verifier que la cible dB agit directement si `mediaProcessed>0`, ou que la source passe en `ObserveOnly` avec une raison lisible si aucun media controlable n'est trouve.
- [ ] Verifier la session Windows.
- [ ] Verifier la sous-source navigateur.
- [ ] Si Spotify Web/Deezer Web est `BrowserGain` avec desktop connecte, verifier la calibration extension. En mode extension seule, verifier surtout que la cible dB change le gain directement si le lecteur HTML est controlable. Le volume Windows global peut bouger pendant `measuring` ou apres un clic volontaire de cible ; il doit surtout eviter de boucler en continu une fois `BrowserGain` verrouille.
- [ ] Le bouton ne doit pas repasser inactif juste apres `tab-capture-no-signal`, `no-media-element-detected` ou un statut temporaire `active-tab-empty`, meme si le desktop est ferme ; si cela arrive encore, copier le diagnostic popup avant de recharger la page web.
- [ ] Apres `Proteger l'onglet actif`, changer la cible dB puis copier le diagnostic : sauf Stop utilisateur ou exclusion, `enabled` ne doit pas repasser a `false`.
- [ ] Si le diagnostic affiche encore `site=""` / `sourceType=unknown`, verifier aussi `globalEnabled`, `visualEnabled`, `popupTabIdKnown`, `statusRoute`, `diagnosticReason` et `statusError` pour savoir si le probleme vient de l'onglet actif, de l'injection ou du content script.
- [ ] Le diagnostic popup ne doit plus afficher `statusOk=true` avec `site=""`, `sourceType=unknown`, `statusRoute=""` et `statusError=""`. Si le background ne repond pas, l'etat attendu est `statusOk=false` avec `diagnosticReason=runtime-empty-response`.
- [ ] Avec le desktop ouvert, verifier que le fallback Windows global reste coherent si c'est la seule page qui joue. En mode extension seule, verifier seulement que l'etat reste actif/observable et que `mediaHtmlFallbackReason` explique la limite.
- [ ] Noter `origin`, `controlSurface`, `status`, `isControllable`.
- [ ] Si la source commence en `media-html` avec `level=0%` alors que l'onglet est audible, attendre quelques secondes de plus.
- [ ] Verifier si les logs contiennent `extension.browser.media_html_silent_upgrade`.
- [ ] Verifier si une source `tab-capture` apparait ensuite pour le meme onglet.
- [ ] Si `tab-capture` devient `BrowserGain`, noter que l'onglet est controlable par l'extension et verifier `Calibration`.
- [ ] Si `tab-capture` reste `ObserveOnly`, `no-signal`, `waiting-for-audio` ou `skipped`, noter que l'onglet est visible mais pas controlable par l'extension.
- [ ] Si `no-signal` apparait avec le desktop connecte, verifier `fallbackRecommended=true` et `fallbackReason=tab-capture-no-signal` dans l'export diagnostic extension.
- [ ] Apres `tab-capture-no-signal`, le son ne doit pas gresiller et le diagnostic ne doit pas conserver une capture live stale (`sourceType=tab-capture`, `captureTrackState=live`, `audioTrackCount=1`).
- [ ] Le bouton de protection ne doit pas repasser gris apres `tab-capture-no-signal`; s'il reste actif, verifier ensuite que la surface de controle affiche `ObserveOnly` et que le fallback Windows reste possible.
- [ ] Si le diagnostic affiche `sourceType=media-html`, `mediaDetected>0`, `mediaProcessed=0`, noter que le fallback HTML est inutilisable ; avec desktop connecte, le desktop reste la surface de controle, sinon l'extension doit rester en observation.
- [ ] Si le diagnostic affiche `sourceType=media-html`, `mediaDetected>0`, `mediaProcessed=0`, verifier aussi `skippedAlreadyProcessed`. Il doit rester a `0` apres rechargement de l'extension ; s'il augmente, le lecteur web garde un marqueur `processed` orphelin.
- [ ] En mode extension seule, ce cas peut declencher `tab-capture` si l'onglet est audible. Si `tabCapture` ne fournit pas de signal, l'etat attendu reste lisible (`tab-capture-no-signal`, `ObserveOnly` ou erreur HTML explicite) sans annoncer un fallback Windows ferme.
- [ ] Si le diagnostic affiche `sourceType=media-html`, `mediaDetected>0`, `mediaProcessed>0`, mais `rmsDb=-120` / `outputRmsDb=-120`, il doit finir par afficher `fallbackReason=media-html-no-usable-signal` au lieu d'annoncer un faux controle `BrowserGain`.
- [ ] Juste apres activation, `sourceType=media-html`, `mediaDetected=0`, `mediaProcessed=0` peut rester en observation sans raison ; apres la phase de detection, s'il n'y a toujours aucun lecteur exploitable, noter `mediaHtmlFallbackReason=no-media-element-detected`, `tabAudible`, `tabActive`, puis verifier si une bascule generique `tab-capture` apparait quand l'onglet est audible.
- [ ] Si une bascule generique `tab-capture` echoue ou reste muette, le fallback `media-html` ne doit pas rester coupe : le prochain diagnostic doit rester actif ou expliquer clairement le fallback Windows.
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
- [ ] Dans Options extension, changer la cible dB puis cliquer `Appliquer les reglages` avec plusieurs onglets ouverts, dont un onglet interne/options si besoin : le bouton ne doit pas rester `Non applique` seulement parce qu'un onglet ne peut pas recevoir les reglages.

### Source Navigateur

- [ ] Garder le desktop et l'extension ouverts.
- [ ] Proteger un onglet YouTube, Spotify Web, Deezer Web ou TikTok.
- [ ] Mettre Play et attendre une ligne `browser.source.received`.
- [ ] Changer `Cible volume` dans le desktop.
- [ ] Attendre 5 a 10 secondes sans cliquer dans l'extension.
- [ ] Verifier que l'onglet continue d'envoyer des statuts live.
- [ ] Si la source reste `BrowserGain` avec desktop connecte et que `Calibration=locked`, verifier que la cible applique vite un nouveau gain (`browser.gain.rearmed`, `browser.gain.applied`, puis `browser.gain.locked`) sans attendre une nouvelle fenetre complete. En mode extension seule, verifier que la cible dB agit directement sans attendre ces evenements.
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

## 12. Test OBS Stream Safety Setup

OBS ne fournit pas encore de donnees automatiques a StreamVolume Guard Hub. Pour cette V1, OBS sert de securite finale manuelle du stream avec ses outils natifs.

Doc de reference du projet :

```text
D:\Codex\StreamVolume Guard Hybride\docs\obs-stream-safety-setup.md
```

Actions :

- [ ] Ouvrir OBS avec les meters visibles.
- [ ] Ajouter une source `Application Audio Capture` pour le navigateur principal quand OBS le permet.
- [ ] Ajouter une source `Application Audio Capture` pour Discord, Spotify desktop, VLC ou le jeu quand OBS le permet.
- [ ] Si les apps sont capturees separement, desactiver `Desktop Audio` global dans OBS pour eviter les doublons/echo.
- [ ] Ajouter un filtre `Compressor` sur les sources a risque.
- [ ] Ajouter un filtre `Limiter` en dernier filtre de chaque source ou de la chaine pertinente.
- [ ] Lancer YouTube seul, puis TikTok seul, puis Spotify Web seul.
- [ ] Lancer ensuite Discord puis VLC/jeu si disponible.
- [ ] Observer les meters OBS pendant les corrections Windows et navigateur.
- [ ] Verifier que le niveau ne clippe pas et que le Limiter reste la derniere protection.
- [ ] Copier les logs desktop.

Validation attendue :

- [ ] OBS sert de controle visuel et de securite finale manuelle.
- [ ] StreamVolume Guard Hub ne pretend pas lire les scenes OBS.
- [ ] StreamVolume Guard Hub ne pretend pas lire les meters internes OBS.
- [ ] Le Hub ne promet pas de compresser seul les pics internes d'une source.
- [ ] Le rapport note si OBS capture avant ou apres les corrections selon la config utilisateur.
- [ ] Si Application Audio Capture ne capture pas une app, la limite est notee honnetement et un cable audio virtuel reste une piste manuelle future.

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

- [ ] Si tu fais la campagne complete, cliquer `Demarrer guide`, puis `Etape suivante` pour passer YouTube -> TikTok -> Spotify/Deezer -> Discord -> VLC/lecteur -> jeu/app -> OBS.
- [ ] Cliquer `Nouveau test` au debut d'un scenario ou avant une nouvelle serie propre.
- [ ] Verifier que `Nouveau test` ne bouge pas les volumes : il cree une nouvelle session de logs et capture un snapshot du melangeur Windows pour le diagnostic.
- [ ] Cliquer `Marquer etape` avant chaque source.
- [ ] Tester une seule source.
- [ ] Attendre 18 a 20 secondes si `BrowserGain` calibre avec le desktop connecte. En mode extension seule, verifier le gain direct si `mediaProcessed>0`; sinon 10 a 15 secondes suffisent pour valider le fallback Windows ou l'observation.
- [ ] Cliquer `Copier logs` pour copier le rapport lisible de la session de test courante.
- [ ] Coller le rapport dans Codex si analyse necessaire.
- [ ] Verifier que le texte colle commence par `# Rapport StreamVolume Guard Hub`.
- [ ] Verifier qu'il contient `Session`, `Sources`, `Couverture`, `Sortie globale`, `Corrections appliquees`, `Alertes`, puis `Logs bruts`.
- [ ] Verifier que la section `Session` affiche `Auto actif`, `Profil`, `Sources navigateur visibles` et `Sessions Windows visibles` avec les valeurs du test, pas `inconnu` si `tester.session.start` ou `tester.mark` les contient.
- [ ] Verifier que la section `Couverture` affiche le score, les compteurs `Direct/Fallback/Action/Limite/Inconnu` et une ligne par source classee.
- [ ] Si aucun evenement `coverage.*` n'est encore present mais que des sources sont visibles, verifier que la section `Couverture` affiche `Couverture non journalisee` avec les sources deduites au lieu de `Aucune couverture calculee`.
- [ ] Verifier qu'une source navigateur avec `targetProfile=stream` ou un evenement `volume.auto_locked` ne remplace pas le profil global affiche dans l'en-tete du rapport.

Evenements utiles :

```text
tester.session.start
tester.references.captured
startup.references.captured
tester.mark
global_output.monitor.started
global_output.level
global_output.risky
global_output.silent
global_output.unknown_active
global_output.unknown_active.resolved
global_output.error
stream_safe.enabled
guided_test.started
guided_test.step
guided_test.completed
obs.guide.opened
bridge.start
browser.source.received
coverage.summary.updated
coverage.source.classified
coverage.source.action_required
coverage.source.fallback_available
coverage.source.limited
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
Sortie globale observee : Silent / Safe / Risky / Unknown
Sortie globale RMS/pic visibles : oui/non
global_output.risky visible si mix fort : oui/non
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
- [ ] Apres fermeture de la fenetre desktop, le bridge ne repond plus sur `127.0.0.1:47841`.
- [ ] L'extension affiche `Mode autonome` sans desktop et `App connectee` quand le desktop repond a `/health`.
- [ ] Le popup force un check `/health` court a l'ouverture et apres `Proteger l'onglet actif`, mais `Copier diagnostic` copie immediatement l'etat deja affiche sans attendre le bridge desktop.
- [ ] Le desktop affiche `App seule` avant reception extension et `Extension connectee` apres reception d'une source ou d'un log extension.
- [ ] Le desktop affiche `Sortie globale` avec etat, RMS/pic recent et peripherique, ou une erreur loopback claire.
- [ ] La sortie globale reste une mesure lecture seule et ne modifie pas le volume master Windows.
- [ ] Les logs `global_output.*` ne contiennent ni audio brut, ni samples, ni buffers PCM.
- [ ] Un `POST /browser-source` manuel affiche une sous-source navigateur.
- [ ] L'extension peut envoyer au moins une sous-source navigateur reelle.
- [ ] L'extension peut envoyer des evenements utiles dans le journal local via `POST /extension-log`.
- [ ] Une source navigateur `media-html` muette ou introuvable alors que l'onglet est audible peut tenter une bascule generique vers `tab-capture` meme en mode extension seule, sans patch cible par site.
- [ ] Une capture `tab-capture` audible mais muette cote Web Audio doit sortir de `starting`, indiquer `tab-capture-no-signal`, puis laisser le desktop controler le volume Windows global du navigateur seulement si le bridge est connecte.
- [ ] Dans ce cas, le bouton extension peut rester actif meme si `BrowserGain` n'est pas controlable : l'etat attendu est observation/fallback, pas extinction silencieuse.
- [ ] Un fallback HTML qui detecte un media mais n'en controle aucun (`mediaProcessed=0`) doit etre traite comme non controlable ; avec desktop connecte il peut rester lie au fallback Windows global, sinon il reste en observation.
- [ ] Une page web audio sans element media detecte doit rester visible avec `mediaHtmlFallbackReason=no-media-element-detected`, puis tenter `tabCapture` si l'onglet est audible. Si `tabCapture` reste sans signal, elle doit redevenir lisible en `ObserveOnly`; avec desktop connecte, elle peut aussi utiliser le volume Windows global du navigateur.
- [ ] La session Windows du navigateur peut etre corrigee globalement quand une seule page web joue.
- [ ] Les sessions Windows visibles dans le melangeur apparaissent quand Windows les expose.
- [ ] Chaque source affiche clairement son origine et sa surface de controle.
- [ ] Les sources non controlables sont `ObserveOnly` ou `Unknown`.
- [ ] `Auto actif` est necessaire avant toute correction Windows reelle.
- [ ] `Auto actif` et les exclusions persistent dans `%LOCALAPPDATA%\StreamVolumeGuard\config.json`.
- [ ] Les corrections Auto sont ponctuelles par source active et ne bougent pas le fader en continu.
- [ ] Le controle manuel, les exclusions et Panic sont respectes.
- [ ] Les logs sont locaux, utiles et non sensibles.
- [ ] OBS est traite comme securite finale manuelle via Application Audio Capture, Compressor et Limiter.
- [ ] Aucune action courante ne provoque mute, gresillement ou crash.

---

## 18. Prochaines Validations Apres Cette Version

Apres cette version testable, la suite logique est :

- campagne reelle YouTube, TikTok, Spotify Web, Deezer Web, Discord, VLC et OBS ;
- stabilisation V1 apres retours du package testeur ;
- meilleure calibration OBS manuelle ;
- token local ou protection equivalente si le bridge doit sortir d'un usage dev/test.
