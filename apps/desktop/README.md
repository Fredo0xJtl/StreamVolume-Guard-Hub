# StreamVolume Guard Hub Desktop

Couche Windows de StreamVolume Guard Hub.

Le desktop agit comme un melangeur Windows intelligent : il observe les sessions audio exposees par Windows, affiche les applications disponibles, permet le controle manuel, et applique une calibration automatique ponctuelle quand `Auto actif` est active.

## Role Dans L'Architecture Hybride

- Controle : `WindowsSessionVolume`.
- Origine : `WindowsSession`.
- Limite : si Windows regroupe tous les onglets sous une seule session navigateur, le desktop ne peut pas les separer seul.
- Complement : les sous-sources navigateur arrivent via `apps/browser-extension`, `packages/protocol` et le bridge local `127.0.0.1:47841`.

## Commandes Locales

Depuis la racine du repo hybride :

```powershell
node "packages/protocol/tests/protocol.test.js"
dotnet build "apps/desktop/StreamVolumeGuard.Desktop.sln" -nr:false
dotnet run --project "apps/desktop/tests/StreamVolumeGuard.Tests/StreamVolumeGuard.Tests.csproj"
dotnet run --project "apps/desktop/src/StreamVolumeGuard.App/StreamVolumeGuard.App.csproj"
```

Chemin local absolu :

```powershell
node "D:\Codex\StreamVolume Guard Hybride\packages\protocol\tests\protocol.test.js"
dotnet build "D:\Codex\StreamVolume Guard Hybride\apps\desktop\StreamVolumeGuard.Desktop.sln" -nr:false
dotnet run --project "D:\Codex\StreamVolume Guard Hybride\apps\desktop\tests\StreamVolumeGuard.Tests\StreamVolumeGuard.Tests.csproj"
dotnet run --project "D:\Codex\StreamVolume Guard Hybride\apps\desktop\src\StreamVolumeGuard.App\StreamVolumeGuard.App.csproj"
```


## Bridge Local Navigateur

Quand l'app desktop est lancee, elle demarre un bridge local sur :

```text
http://127.0.0.1:47841
```

Endpoints testables :

- `GET /health` pour verifier que le bridge repond ;
- `POST /browser-source` pour recevoir un message `browser_source_observed` depuis l'extension ;
- `POST /extension-log` pour recevoir un log extension sanitise dans le journal local desktop ;
- `GET /global-target` pour exposer la cible voulue du desktop aux onglets deja proteges.

Le bridge accepte uniquement des messages JSON du protocole. Un message `browser_source_observed` doit inclure `origin`, `controlSurface`, `status` et `isControllable`. Les messages invalides ou incoherents sont refuses et journalises localement avec `bridge.message.invalid`.

Garde-fous actuels :

- lecture du corps HTTP en octets pour garder les titres Unicode corrects ;
- limite de taille de requete pour eviter les payloads anormaux ;
- Origines autorisees : extension navigateur, `127.0.0.1`, `localhost` ou absence d'Origin pour les outils locaux ;
- token local optionnel via l'en-tete `X-StreamVolume-Guard-Token` pour `/browser-source`, `/extension-log` et `/global-target`.

## Config Locale

Les reglages essentiels restent locaux dans :

```text
%LOCALAPPDATA%\StreamVolumeGuard\config.json
```

La version actuelle restaure `Auto actif`, les exclusions de sessions et le token optionnel du bridge local. Les volumes par application restent geres par Windows et le controle manuel de l'app.

En `Auto actif`, une source Windows active recoit au plus une correction automatique, puis elle est verrouillee pour eviter les mouvements de volume en continu. Le verrou se rearme apres silence durable, disparition de la session, ou changement de cible globale.

Champ optionnel :

```json
{
  "BridgeToken": "secret-local"
}
```

Si `BridgeToken` est vide ou absent, les tests locaux et l'extension fonctionnent sans en-tete supplementaire. Si un token est defini, les requetes `POST /browser-source`, `POST /extension-log` et `GET /global-target` doivent envoyer `X-StreamVolume-Guard-Token` avec la meme valeur. `GET /health` reste ouvert pour verifier que le bridge repond.

## Garde-Fous Produit

- Pas de patch specifique par application dans le moteur.
- Enumeration dynamique des peripheriques de sortie et sessions Windows.
- Reglages et logs locaux.
- `Auto actif` et exclusions persistants en JSON local.
- `Auto actif` limite la correction a une calibration one-shot par source active, avec log `volume.auto_locked` quand une correction supplementaire est ignoree.
- Changement de cible globale : rearme une calibration Windows ponctuelle et expose la cible a l'extension via `GET /global-target`.
- Sessions inconnues ou non controlables affichees honnetement.
- Sous-sources navigateur affichees separement quand elles arrivent de la simulation ou du bridge.
- Anti-conflit : une sous-source recente en `BrowserGain` bloque la correction automatique de la session Windows navigateur correspondante.

## Couverture Audio

Le desktop est global au niveau des sessions Windows. Il ne remplace pas un driver, un peripherique virtuel ou un compresseur studio.

Les sous-sources navigateur sont representees separement quand elles arrivent de l'extension ou de la simulation. Leur surface de controle doit etre explicite : `BrowserGain`, `ObserveOnly`, `Unknown`, ou une autre valeur supportee par `packages/protocol`.
