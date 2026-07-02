# StreamVolume Guard Hub Protocol

`packages/protocol` definit le contrat local entre les couches du produit hybride :

- desktop Windows : sessions audio Windows, volume par application quand Windows l'expose ;
- extension navigateur : detail par onglet/site et gain Web Audio quand la page est controlable ;
- bridge local : transport de messages JSON sur `127.0.0.1:47841` ;
- logs communs : debug local lisible, sans envoi automatique.

## Etat Actuel

Le protocole definit la forme des messages. La version testable utilise `browser_source_observed` pour transporter les sous-sources navigateur de l'extension vers le desktop via le bridge local, et `extension_log` pour ajouter certains evenements extension au journal local desktop.

## Regle De Couverture

Chaque source doit annoncer son origine et sa surface de controle. C'est obligatoire pour eviter de decouvrir trop tard qu'une source ne peut pas etre equilibree.

Origines connues :

- `WindowsSession` : source vue par l'app desktop via les sessions audio Windows.
- `BrowserExtension` : sous-source vue par l'extension navigateur.

Surfaces de controle connues :

- `WindowsSessionVolume` : le desktop peut ajuster le volume de session Windows.
- `BrowserGain` : l'extension peut ajuster le gain Web Audio dans l'onglet/site.
- `ObserveOnly` : la source est observee mais pas controlable par cette couche.
- `Unknown` : la couche ne sait pas encore comment agir.

Le champ `isControllable` doit etre explicite dans les messages emis et coherent avec `controlSurface` : `true` pour `BrowserGain` ou `WindowsSessionVolume`, `false` pour `ObserveOnly` ou `Unknown`. Le champ historique `canControl` peut rester accepte par compatibilite interne, mais `isControllable` est le vocabulaire produit.

Une source peut etre disponible mais non controlable. Dans ce cas, l'UI et les logs doivent l'afficher clairement au lieu de promettre une normalisation impossible.

## Message Navigateur Minimal

```json
{
  "type": "browser_source_observed",
  "browserProcess": "Chrome",
  "sourceId": "tab-42:media-1",
  "tabId": 42,
  "siteName": "YouTube",
  "title": "Example local title, optional for display only",
  "currentLevel": 0.72,
  "appliedGain": 0.83,
  "targetRmsDb": -18,
  "targetProfile": "Standard",
  "status": "Risky",
  "lastSeen": "2026-07-01T18:00:00.000Z",
  "origin": "BrowserExtension",
  "controlSurface": "BrowserGain",
  "isControllable": true
}
```

`targetRmsDb` et `targetProfile` sont optionnels. Ils indiquent la cible appliquee par l'extension quand elle est connue, notamment apres synchro avec `GET /global-target`.

## Confidentialite

Le protocole ne transporte pas :

- audio brut ;
- historique de navigation ;
- URL complete ;
- compte utilisateur ;
- telemetrie automatique.

Le champ `title` est optionnel et doit rester un affichage/debug local. Si une version future l'expose dans des logs partageables, elle devra permettre de le masquer.

## Message Log Extension Minimal

```json
{
  "type": "extension_log",
  "eventName": "tabcapture.no_signal",
  "message": "Tab capture status: no-signal",
  "severity": "warn",
  "browserProcess": "Brave",
  "sourceId": "tab-capture:42",
  "tabId": 42,
  "siteName": "TikTok",
  "status": "Unknown",
  "controlSurface": "ObserveOnly",
  "captureSignalState": "no-signal",
  "targetRmsDb": -18,
  "targetProfile": "Standard",
  "lastSeen": "2026-07-02T18:00:00.000Z",
  "origin": "BrowserExtension"
}
```

`extension_log` sert uniquement au debug local unifie. Le message doit rester sanitize : pas d'URL complete, pas de dump console, pas de token et pas de donnees personnelles.

## Verification

```powershell
node "packages/protocol/tests/protocol.test.js"
```
