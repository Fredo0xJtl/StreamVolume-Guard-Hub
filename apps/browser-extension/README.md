# StreamVolume Guard Hub Browser Extension

Cette extension est la couche navigateur de **StreamVolume Guard Hub** pour streamers : elle aide à réduire les pics audio des sites web, reste open source, sans tracker, sans collecte de données et n'envoie aucune donnée automatiquement.

Elle ne remplace pas l'app desktop. Son rôle est d'identifier les médias web et, quand le navigateur le permet, d'appliquer un gain local dans l'onglet (`BrowserGain`). Les applications Windows, jeux, Discord, VLC, Spotify desktop et le mixeur système restent couverts par `apps/desktop`.

## Rôle Dans Le Repo Hybride

Dans `D:\Codex\StreamVolume Guard Hybride` :

- `apps/desktop` voit et contrôle les sessions audio Windows ;
- `apps/browser-extension` voit les sous-sources web comme YouTube, Twitch, TikTok, Kick, Spotify web et Deezer web ;
- `packages/protocol` définit les messages communs ;
- le bridge local desktop écoute sur `127.0.0.1:47841`.

Quand le desktop est lancé, l'extension peut :

- envoyer `browser_source_observed` vers `POST /browser-source` ;
- envoyer des logs sanitizés vers `POST /extension-log` pour le journal local desktop ;
- lire `GET /global-target` pour reprendre la cible voulue du desktop ;
- annoncer `origin=BrowserExtension`, `controlSurface`, `status` et `isControllable` ;
- rester honnête en `ObserveOnly` ou `Unknown` si une source n'est pas contrôlable.

Aucun audio brut, URL complète, historique de navigation, compte utilisateur ou événement de télémétrie n'est envoyé au bridge.

## Installation Locale Pour Tester

Charge directement ce dossier dans un navigateur Chromium desktop :

```text
D:\Codex\StreamVolume Guard Hybride\apps\browser-extension
```

Chrome :

```text
chrome://extensions
```

Brave :

```text
brave://extensions
```

Edge :

```text
edge://extensions
```

Étapes :

1. Activer le mode développeur.
2. Cliquer sur `Charger l'extension non empaquetée`.
3. Sélectionner `D:\Codex\StreamVolume Guard Hybride\apps\browser-extension`.
4. Lancer le desktop.
5. Ouvrir une seule page audio.
6. Cliquer `Protéger cet onglet`.
7. Vérifier dans le desktop que la source apparaît avec `BrowserExtension`, `BrowserGain`, `ObserveOnly` ou `Unknown`.

Si le navigateur refuse le chargement, vérifier que le dossier sélectionné contient bien `manifest.json`.

## Bridge Local

Endpoints desktop utilisés :

- `GET http://127.0.0.1:47841/health` : diagnostic local ;
- `GET http://127.0.0.1:47841/global-target` : cible globale desktop ;
- `POST http://127.0.0.1:47841/browser-source` : sous-source navigateur observée ;
- `POST http://127.0.0.1:47841/extension-log` : log extension sanitizé.

Par défaut, `BridgeToken` est vide et l'extension fonctionne sans en-tête spécial. Si un token local est configuré côté desktop, les endpoints de données (`/global-target`, `/browser-source` et `/extension-log`) exigent `X-StreamVolume-Guard-Token`. Dans ce cas, il faut prévoir un passage de token côté extension avant d'utiliser cette protection en test réel.

Les logs extension envoyés au desktop restent volontairement limités : synchro de cible, états `tabCapture` utiles, source/site générique, statut, surface de contrôle et niveau cible. Ils ne doivent pas contenir d'URL complète, d'audio brut, d'historique navigateur ou de dump console.

## Limites Actuelles

- Les onglets ne sont pas toujours séparables par Windows ; l'extension apporte le détail navigateur quand elle peut.
- `BrowserGain` est possible quand Web Audio ou `tabCapture` donne un signal exploitable.
- TikTok et certains lecteurs dynamiques peuvent devenir `ObserveOnly` si la capture ne fournit pas de signal utilisable.
- Les builds Firefox, Firefox Android et Safari sont hérités de l'ancien projet extension ; ils ne sont pas la priorité de la V1 hybride Windows.
- OBS reste une vérification visuelle manuelle dans la V1 hybride.

## Tests Utiles

Depuis la racine du repo hybride :

```powershell
node "apps/browser-extension/tests/unit.test.js"
node --check "apps/browser-extension/bridge/client.js"
node --check "apps/browser-extension/background.js"
node --check "apps/browser-extension/content.js"
```

Depuis ce dossier :

```powershell
node tests/unit.test.js
node tests/browser-smoke.js
node --check background.js
node --check content.js
node --check popup/popup.js
node --check options/options.js
```

Le smoke navigateur réel reste utile, mais il ne remplace pas les tests manuels YouTube, TikTok, Spotify web, Deezer web, Discord, VLC et OBS.

## Page De Test Locale

Pour tester l'extension sur une page audio locale, utiliser le petit serveur intégré plutôt que `file://` :

```powershell
node tests/start-local-server.js
```

Puis ouvrir l'URL affichée, par exemple :

```text
http://127.0.0.1:8787/test-page.html
```

Garder le terminal ouvert pendant le test.

Sur la page de test, commencer par `Avant brut` pour entendre les écarts réels, puis utiliser `Avec extension` pour vérifier que le traitement réduit les écarts sans changer de source audio.

## Documents Extension Encore Utiles

- `docs/privacy-policy.md` : promesse locale et données non collectées.
- `docs/real-platform-test-plan.md` : plan de validation plateformes web.
- `docs/maintenance-checklist.md` : contrat technique du pipeline navigateur.
- `docs/cross-browser-deployment.md` : notes multi-navigateurs héritées de l'extension.
- `docs/future-implementation-roadmap.md` : idées extension, non source de vérité hybride.

La source de vérité produit pour la suite hybride est dans :

```text
D:\Codex\StreamVolume Guard Hybride\docs\product-next-plan.md
```

## Packaging Extension

Les scripts historiques existent encore pour préparer des builds extension :

```powershell
node tools/build-targets.js
node tools/package-release.js
```

Ils génèrent `dist/` et `release-assets/`. Ces dossiers sont générés et ne doivent pas devenir la source de vérité du repo hybride. Pour la V1 actuelle, la priorité reste le packaging testeur Windows du desktop + extension locale, pas une release publique multi-navigateurs.

Les notes de release historiques restent dans `store/` pour archive. L'ancien README public extension est conservé dans `README.legacy.md`.
