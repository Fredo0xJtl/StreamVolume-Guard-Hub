# StreamVolume Guard 0.1.2

Version publique de test pour StreamVolume Guard, pensée pour les streamers qui veulent réduire les écarts de volume entre YouTube, Twitch, TikTok, Kick, Spotify web, Deezer web et les autres sites audio/vidéo.

## Points forts

- Extension open source, sans tracker et sans collecte de données.
- Traitement audio local dans le navigateur.
- Normalisation plus stable entre sons faibles, forts et très forts.
- Micro-rampes audio pour réduire les clics lors des changements de niveau.
- Popup streamer avec état Safe / À surveiller / Risque, diagnostics et mode Panic.
- Page Options avec volume moyen voulu, profils, exclusions et diagnostic JSON local.
- Builds prêts à tester pour Chromium, Firefox, Firefox Android et source Safari.

## Fichiers à utiliser

- Projet complet : `streamvolume-guard-project-0.1.2.zip`
- Chrome, Brave, Edge desktop : `streamvolume-guard-chromium-0.1.2.zip`
- Firefox desktop : `streamvolume-guard-firefox-0.1.2.zip`
- Firefox Android : `streamvolume-guard-firefox-android-0.1.2.zip`
- Safari macOS / iOS / iPadOS : `streamvolume-guard-safari-source-0.1.2.zip`

## Installation rapide

Chrome, Brave ou Edge :

1. Télécharger l'archive Chromium.
2. Décompresser le fichier.
3. Ouvrir `chrome://extensions`, `brave://extensions` ou `edge://extensions`.
4. Activer le mode développeur.
5. Cliquer sur `Load unpacked`.
6. Sélectionner le dossier décompressé.

Firefox :

1. Télécharger l'archive Firefox.
2. Décompresser le fichier.
3. Ouvrir `about:debugging#/runtime/this-firefox`.
4. Cliquer sur `Load Temporary Add-on`.
5. Sélectionner `manifest.json`.

Projet complet :

1. Télécharger `streamvolume-guard-project-0.1.2.zip`.
2. Décompresser le fichier.
3. Utiliser le code source, la documentation, la page de test et les dossiers `dist/` inclus.

## Notes importantes

- Le support principal reste Chrome, Brave et Edge desktop.
- Firefox, Firefox Android et Safari source sont fournis pour tests, avec validation réelle à poursuivre.
- Safari nécessite un Mac avec Xcode pour convertir et signer la Web Extension.
- Chrome Android n'est pas supporté officiellement.
- Le diagnostic JSON est généré localement et partagé uniquement si l'utilisateur le décide.

## Vérifications

Cette release a été préparée avec :

- tests unitaires Node ;
- tests de packaging multi-navigateurs ;
- test de cohérence branding ;
- smoke test navigateur réel sur Chromium avec `dist/chromium` ;
- vérification syntaxe JavaScript ;
- vérification des fins de ligne et du diff Git.
