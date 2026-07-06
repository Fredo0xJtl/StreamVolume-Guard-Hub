# Checklist Courte Testeur

Version alpha testeur : `v0.1.0-alpha.1`.

## Avant De Commencer

- [ ] Je suis dans le package testeur, pas dans le repo source.
- [ ] Je n'ai pas ouvert de fichier `.sln`.
- [ ] Le package contient `LICENSE`.
- [ ] Le fichier SHA256 du zip a ete conserve si le package a ete partage.
- [ ] Le desktop se lance avec `Lancer StreamVolume Guard Hub Desktop.cmd`.
- [ ] Le desktop se lance sans installer .NET.
- [ ] Le bloc `Sortie globale` est visible avec etat, RMS/pic ou une erreur claire.
- [ ] Les boutons `Demarrer guide`, `Etape suivante`, `Stream Safe` et `Guide OBS` sont visibles.
- [ ] Si SmartScreen affiche un avertissement, je le note comme limite alpha non signee.
- [ ] L'extension est chargee depuis le dossier `browser-extension`.
- [ ] Dans `brave://extensions`, la version de l'extension est `0.1.27`.
- [ ] Les logs locaux sont accessibles dans `%LOCALAPPDATA%\StreamVolumeGuard\logs`.

## Tests Source Par Source

Pour chaque source web, tester seule, puis mettre pause avant la suivante. Avec l'app desktop connectee, attendre 18 a 20 secondes si `BrowserGain` calibre. En mode extension seule, il n'y a plus de calibration longue : si `mediaProcessed>0`, la cible dB doit agir directement ; sinon le diagnostic doit rester en `ObserveOnly` avec une raison claire. Pour une app Windows seule, 10 a 15 secondes suffisent.

- [ ] YouTube navigateur.
- [ ] TikTok navigateur.
- [ ] Spotify Web ou Deezer Web.
- [ ] VLC ou lecteur local.
- [ ] Discord.
- [ ] Spotify desktop si disponible.
- [ ] OBS avec meters visibles, en observation manuelle.

## Points A Noter

- [ ] La source apparait dans StreamVolume Guard Hub.
- [ ] Le statut est lisible : Safe, Risky, Muted, Excluded, ObserveOnly ou Unknown.
- [ ] La surface de controle est honnete : WindowsSessionVolume, BrowserGain, ObserveOnly ou Unknown.
- [ ] Sur Chrome, Brave ou Edge, `Proteger l'onglet actif` commence par `media-html` quand un lecteur HTML est accessible.
- [ ] `tab-capture` n'apparait ensuite que comme upgrade generique si `media-html` reste muet ou introuvable alors que l'onglet est audible.
- [ ] Si `BrowserGain` est actif avec l'app desktop connectee, la calibration reste lisible (`measuring`, `locked`, `skipped`), attend environ 18 secondes avant le gain final et demande environ 8 secondes de signal utile ; en mode autonome, la source HTML controlable doit appliquer la cible dB par gain direct sans attendre `locked`.
- [ ] Si `sourceType=media-html`, `mediaDetected>0`, `mediaProcessed>0` mais que le signal reste muet, le diagnostic doit finir par indiquer `fallbackReason=media-html-no-usable-signal` au lieu de laisser croire que la cible dB est appliquee.
- [ ] Si la source reste `ObserveOnly`, `Unknown`, `skipped` ou `no-signal`, les colonnes `Raison` et `Action` expliquent pourquoi et proposent rechargement, reprotection, fallback Windows ou OBS.
- [ ] Si `captureSignalState=needs-user-action`, l'action indique de cliquer `Proteger l'onglet actif`.
- [ ] Si `captureSignalState=restricted` ou `unsupported`, l'action indique fallback Windows, OBS ou navigateur Chromium compatible.
- [ ] Si une capture navigateur audible reste muette cote Web Audio avec desktop connecte, le diagnostic sort de `starting` et affiche `fallbackReason=tab-capture-no-signal`.
- [ ] Apres `tab-capture-no-signal`, le son ne gresille pas et le diagnostic ne garde pas une capture live stale (`sourceType=tab-capture`, `captureTrackState=live`, `audioTrackCount=1`).
- [ ] Dans ce cas, le bouton extension peut rester actif en observation/fallback ; si le desktop est ferme, le diagnostic ne doit pas annoncer un fallback Windows.
- [ ] Si l'export affiche encore `site=""` / `sourceType=unknown`, relever `globalEnabled`, `visualEnabled`, `popupTabIdKnown`, `statusRoute`, `diagnosticReason` et `statusError`.
- [ ] Si le background ne repond pas, le diagnostic doit afficher `statusOk=false` et `diagnosticReason=runtime-empty-response`, pas un faux succes vide.
- [ ] Si le diagnostic affiche `sourceType=media-html`, `mediaDetected>0`, `mediaProcessed=0`, le fallback HTML est non controlable ; avec desktop connecte, le desktop reste le controle attendu, sinon l'extension reste en observation.
- [ ] Si le diagnostic affiche `sourceType=media-html`, `mediaDetected=0`, `mediaProcessed=0`, l'extension doit exposer `mediaHtmlFallbackReason=no-media-element-detected`, puis tenter `tab-capture` si l'onglet est audible ; le fallback desktop ne doit etre annonce que quand l'app est connectee.
- [ ] Si l'onglet est audible dans ce cas, le diagnostic doit aussi garder `tabAudible=true`. L'upgrade generique `tab-capture` peut partir meme sans app desktop ; si `captureSignalState=signal`, la cible dB doit agir.
- [ ] Apres changement de cible dB ou tentative d'upgrade `tab-capture`, le diagnostic ne doit pas revenir a `enabled=false` tant que l'utilisateur n'a pas clique Stop et que la source n'est pas exclue.
- [ ] Une intro calme ne provoque pas de boost avant mesure fiable.
- [ ] Un debut dangereusement fort peut afficher `safety-attenuation`.
- [ ] `Calme` vise environ 40%, `Standard` environ 70%, `Fort` environ 100% dans le melangeur Windows.
- [ ] `Sortie globale` bouge quand une source joue, peut passer `Silent` quand tout est en pause, et ne modifie jamais le volume master Windows.
- [ ] Si `Sortie globale` bouge sans source visible active, le rapport peut afficher `global_output.unknown_active`.
- [ ] `Stream Safe` active Auto et revient a la cible Standard.
- [ ] `Demarrer guide` et `Etape suivante` changent les etapes sans modifier le volume a eux seuls.
- [ ] `Guide OBS` explique Application Audio Capture, Compressor et Limiter, sans promettre de lire les meters OBS.
- [ ] Les logs `global_output.*` ne contiennent pas d'audio brut, samples ou buffers PCM.
- [ ] Le profil actif reste un vrai plancher : Auto et `safety-spike` ne descendent pas sous environ 40% en `Calme`, 70% en `Standard`, 100% en `Fort`, ou 15% au minimum personnalise.
- [ ] Le volume ne bouge pas en boucle pendant la meme lecture.
- [ ] Plusieurs sons dans le meme navigateur bougent ensemble seulement si aucune sous-source `BrowserGain` exploitable ne peut les separer.
- [ ] Panic baisse les sources surveillees sans couper le son.
- [ ] Les exclusions empechent l'app d'agir sur la source exclue.
- [ ] Apres `Copier logs`, le texte colle commence par `# Rapport StreamVolume Guard Hub` et contient `Logs bruts` en bas.

## Rapport Minimum

```text
Date :
Windows :
Navigateur :
Desktop lance : oui/non
Extension connectee : oui/non
OBS ouvert : oui/non

Sources testees :
- YouTube :
- TikTok :
- Spotify/Deezer Web :
- VLC :
- Discord :
- Spotify desktop :
- OBS :

Problemes :
Logs copies : oui/non
```
