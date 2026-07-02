# Installation streamer en 60 secondes

Objectif : tester StreamVolume Guard Hub rapidement avec un navigateur capturé dans OBS.

## 1. Installer l'extension

1. Ouvre `chrome://extensions` ou `brave://extensions`.
2. Active le mode développeur.
3. Clique sur `Load unpacked`.
4. Sélectionne le dossier :

```text
chemin vers StreamVolume Guard Hub\dist\chromium
```

5. Épingle l'extension dans la barre du navigateur.

## 2. Régler le profil

1. Ouvre la popup de l'extension.
2. Choisis le profil `OBS recommandé`.
3. Clique sur `Protéger cet onglet`.

Ce profil garde le navigateur un peu plus calme que le profil Stream pour laisser de la place à la voix, aux alertes et à la musique dans OBS.

## 3. Faire la démo avant / après

1. Lance la page de test:

```powershell
cd "chemin vers StreamVolume Guard Hub"
node tests/start-local-server.js
```

2. Ouvre l'URL affichée, par exemple :

```text
http://127.0.0.1:8787/test-page.html
```

3. Dans le bloc `Démo avant / après`, clique sur `Avant brut`.
4. Clique ensuite sur `Avec extension` pour entendre les mêmes sons traités.

## 4. Vérifier avant live

Dans la popup, vérifie :

- le statut est `Safe` ou au moins pas `Risky`;
- le nombre de médias détectés est correct;
- le pipeline est actif;
- les badges affichent `Local uniquement`, `Open source`, `Sans tracking`.

## 5. Dans OBS

1. Capture le navigateur comme source.
2. Garde la voix comme référence principale.
3. Ajuste le volume de la source navigateur une fois.
4. Laisse StreamVolume Guard Hub absorber les gros écarts entre vidéos, plateformes et pubs.

Si le son semble trop bas, monte légèrement la source navigateur dans OBS avant de modifier les réglages avancés.
