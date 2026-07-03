# Checklist Courte Testeur

## Avant De Commencer

- [ ] Je suis dans le package testeur, pas dans le repo source.
- [ ] Je n'ai pas ouvert de fichier `.sln`.
- [ ] Le desktop se lance avec `Lancer StreamVolume Guard Hub Desktop.cmd`.
- [ ] L'extension est chargee depuis le dossier `browser-extension`.
- [ ] Les logs locaux sont accessibles dans `%LOCALAPPDATA%\StreamVolumeGuard\logs`.

## Tests Source Par Source

Pour chaque source, tester seule, attendre 10 a 15 secondes, puis mettre pause avant la suivante.

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
- [ ] Si `BrowserGain` est actif, la calibration reste lisible (`measuring`, `locked`, `skipped`), attend environ 12 secondes avant le gain final, et le volume Windows global du navigateur peut servir de fallback pendant `measuring` ou apres un changement volontaire de cible.
- [ ] Une intro calme ne provoque pas de boost avant mesure fiable.
- [ ] Un debut dangereusement fort peut afficher `safety-attenuation`.
- [ ] `Calme` vise environ 40%, `Standard` environ 70%, `Fort` environ 100% dans le melangeur Windows.
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
