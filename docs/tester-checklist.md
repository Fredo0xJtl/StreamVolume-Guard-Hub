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

Prompts / roadmap :
D:\Codex\StreamVolume Guard Hybride\docs\implementation-prompts.md

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

Package testeur attendu plus tard :
D:\Codex\StreamVolume Guard Hybride\artifacts\tester
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

Dans Chrome, Brave ou Edge :

1. Ouvrir `chrome://extensions`, `brave://extensions` ou `edge://extensions`.
2. Activer le mode developpeur.
3. Cliquer `Charger l'extension non empaquetee`.
4. Selectionner `D:\Codex\StreamVolume Guard Hybride\apps\browser-extension`.
5. Garder le desktop ouvert.
6. Ouvrir une seule page audio.
7. Mettre Play.
8. Attendre 10 a 15 secondes.
9. Copier les logs.

Validation attendue :

- [ ] L'extension se charge sans erreur visible.
- [ ] Si le desktop est ferme, l'extension ne crash pas.
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
- [ ] Verifier que `Sons système Windows` reste groupe en une seule ligne.

Validation attendue :

- [ ] Le desktop ressemble au meme produit que l'extension.
- [ ] Le theme clair est confortable pour tester longtemps.
- [ ] Le mode sombre est utilisable sans redemarrage.
- [ ] Les limites de controle restent visibles : `Controle`, `ControlSurface`, `Contrôlable`, `ObserveOnly`, `Unknown`.

---

## 7. Test Source Par Source - Navigateur

Important : mettre Play sur une seule page a la fois.

### YouTube seul

- [ ] Mettre Play sur YouTube seulement.
- [ ] Attendre 10 a 15 secondes.
- [ ] Verifier si le navigateur apparait dans `Sources Windows`.
- [ ] Verifier si une sous-source apparait dans `Sous-sources navigateur`.
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
- [ ] Dans les logs, verifier une ligne `browser.source.received` pour TikTok ou une source `tab-capture`.
- [ ] Si `controlSurface=BrowserGain`, noter que la capture fournit un signal exploitable.
- [ ] Si `controlSurface=ObserveOnly` ou `status=Unknown`, noter que TikTok est visible mais pas controlable proprement par l'extension dans ce test.
- [ ] Copier les logs.
- [ ] Mettre TikTok en pause avant le test suivant.

### Spotify Web ou Deezer Web seul

- [ ] Mettre Play sur Spotify Web ou Deezer Web seulement.
- [ ] Attendre 10 a 15 secondes.
- [ ] Verifier la session Windows.
- [ ] Verifier la sous-source navigateur.
- [ ] Noter `origin`, `controlSurface`, `status`, `isControllable`.
- [ ] Copier les logs.
- [ ] Mettre la page en pause.

Validation globale navigateur :

- [ ] Windows peut regrouper les onglets sous une seule session navigateur.
- [ ] L'extension apporte le detail par site/onglet quand possible.
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
- [ ] Cliquer `Copier logs recents`.
- [ ] Chercher `volume.would_apply`.

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
- [ ] Choisir une source faible.
- [ ] Verifier qu'elle recoit au plus une correction douce si le moteur la classe comme trop faible.
- [ ] Couper ou mettre en pause la source pendant au moins 6 secondes, puis relancer.
- [ ] Verifier qu'une nouvelle correction devient possible apres cette vraie pause.
- [ ] Copier les logs.

Validation attendue :

- [ ] Correction ponctuelle, pas de mouvement continu du fader.
- [ ] Log `volume.auto` visible pour la correction appliquee.
- [ ] Log `volume.auto_locked` visible si la source reste trop forte/faible apres la premiere correction.
- [ ] Pas de gresillement.
- [ ] Pas de mute non demande.
- [ ] Les logs indiquent les corrections reelles.

---

## 10bis. Test Cible Voulue Pendant Lecture

Objectif : verifier que le slider `Cible volume` ne change pas seulement l'affichage, mais reconfigure les sources deja actives.

### Source Windows

- [ ] Cocher `Auto actif`.
- [ ] Lancer une source Windows controlable : VLC, Spotify desktop, Discord ou navigateur visible dans `Sources Windows`.
- [ ] Attendre une premiere decision `volume.auto` ou `volume.auto_locked`.
- [ ] Changer `Cible volume` de `Standard` vers `Calme` ou `Fort`.
- [ ] Attendre 5 a 10 secondes.
- [ ] Verifier que les logs contiennent `target.changed`.
- [ ] Verifier qu'une nouvelle correction Windows peut arriver apres le changement de cible.
- [ ] Si aucun volume ne bouge, verifier d'abord que `Auto actif=True` dans les logs.

### Source Navigateur

- [ ] Garder le desktop et l'extension ouverts.
- [ ] Proteger un onglet YouTube, Spotify Web, Deezer Web ou TikTok.
- [ ] Mettre Play et attendre une ligne `browser.source.received`.
- [ ] Changer `Cible volume` dans le desktop.
- [ ] Attendre 5 a 10 secondes sans cliquer dans l'extension.
- [ ] Verifier que l'onglet continue d'envoyer des statuts live.
- [ ] Verifier que la source reste `BrowserGain` si elle est controlable, ou `ObserveOnly`/`Unknown` si elle ne l'est pas.
- [ ] Copier les logs.

Validation attendue :

- [ ] En mode observation (`Auto actif` decoche), le desktop logge seulement `volume.would_apply`.
- [ ] En `Auto actif`, une source Windows peut etre recalibree une fois apres changement de cible.
- [ ] Pour le navigateur, l'extension lit la cible desktop via le bridge et rafraichit les onglets proteges sans action manuelle.
- [ ] Aucune source `ObserveOnly` ou `Unknown` n'est presentee comme controlable.

---

## 11. Test Controle Manuel, Exclusions Et Panic

### Controle manuel

- [ ] Deplacer un slider dans StreamVolume Guard Hub.
- [ ] Verifier que le volume change dans le melangeur Windows.
- [ ] Verifier que l'auto ne reprend pas immediatement la main contre ton choix.

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

Methode conseillee :

- [ ] Cliquer `Marquer etape` avant chaque source si le bouton existe.
- [ ] Tester une seule source.
- [ ] Attendre 10 a 15 secondes.
- [ ] Cliquer `Copier logs recents` si disponible.
- [ ] Coller les logs dans Codex si analyse necessaire.

Evenements utiles :

```text
bridge.start
browser.source.received
extension.browser.target.synced
extension.tabcapture.status
bridge.message.invalid
volume.would_apply
volume.auto
volume.panic
browser.source.simulated
volume.browser_conflict_skip
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
- [ ] Pas de correction contradictoire entre BrowserGain et WindowsSessionVolume.
- [ ] Sur Brave/Chrome/Edge, une sous-source `BrowserGain` recente peut bloquer la correction Windows du navigateur pour eviter le double controle.

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
- [ ] Un `POST /browser-source` manuel affiche une sous-source navigateur.
- [ ] L'extension peut envoyer au moins une sous-source navigateur reelle.
- [ ] L'extension peut envoyer des evenements utiles dans le journal local via `POST /extension-log`.
- [ ] L'anti-conflit saute une correction Windows quand `BrowserGain` couvre deja la session navigateur.
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
- packaging testeur Windows ;
- meilleure calibration OBS manuelle ;
- token local ou protection equivalente si le bridge doit sortir d'un usage dev/test.

