# StreamVolume Guard Hub Desktop

Couche Windows de StreamVolume Guard Hub.

Le desktop agit comme un melangeur Windows intelligent : il observe les sessions audio exposees par Windows, affiche les applications disponibles, permet le controle manuel, et applique une calibration automatique ponctuelle quand `Auto actif` est active.

Il affiche aussi `Sortie globale`, une mesure lecture seule du son envoye vers la sortie Windows par defaut : RMS, pic recent, etat `Safe` / `Risky` / `Silent` / `Unknown` et peripherique utilise. Ce monitor ne modifie jamais le volume master Windows. En cas de machine incompatible, il peut etre desactive avec `STREAMVOLUME_GUARD_DISABLE_GLOBAL_OUTPUT=1`.

L'interface desktop choisit automatiquement sa langue au demarrage : francais si la culture Windows commence par `fr`, anglais pour toute autre langue. Les logs restent en format technique stable pour faciliter les rapports de test.

## Role Dans L'Architecture Hybride

- Controle : `WindowsSessionVolume`.
- Origine : `WindowsSession`.
- Limite : si Windows regroupe tous les onglets sous une seule session navigateur, le desktop ne peut pas les separer seul.
- Complement : les sous-sources navigateur arrivent via `apps/browser-extension`, `packages/protocol` et le bridge local `127.0.0.1:47841`.
- Etat courant : `BrowserGainPriority` est le mode par defaut. Si l'extension controle une vraie sous-source navigateur et que `BrowserGain` est verrouille, le desktop evite les corrections automatiques concurrentes ; si la source est `measuring`, `ObserveOnly`, `Unknown`, `skipped`, `no-signal` ou inexploitable, le fallback `WindowsSessionVolume` reste disponible.

## Modes D'Usage

- Desktop seul : controle les sessions audio Windows, gere `Auto actif`, profils, exclusions, Panic et logs locaux. Il affiche `App seule` tant qu'aucune extension n'a ete vue.
- Desktop avec extension : recoit les sous-sources navigateur, expose la cible globale via `GET /global-target`, affiche `Extension connectee`, applique un fallback Windows rapide sur les changements volontaires de cible, et evite ensuite les conflits entre `BrowserGain` stable et `WindowsSessionVolume`.
- Desktop sans source controlable : garde la source visible en `ObserveOnly` ou `Unknown` au lieu de promettre une correction impossible.
- Sortie globale : observe le mix final localement pour verifier si l'ensemble du PC est silencieux, stable ou risque, sans compresser ni corriger le son global.

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

En `Auto actif`, une source Windows active recoit au plus une correction automatique, puis elle est verrouillee pour eviter les mouvements de volume en continu. Les profils pilotent directement le volume du melangeur Windows : `Calme` vise environ 40%, `Standard` environ 70%, et `Fort` environ 100%. Le verrou se rearme apres silence durable, disparition de la session, ou changement de cible globale. Pour un navigateur connecte a l'extension, le changement de cible reste visible rapidement dans Windows si `BrowserGain` n'est pas encore verrouille ou si l'utilisateur vient de changer volontairement de profil.

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
- Reglages et logs locaux, avec `runId` par lancement et `testSessionId` par session de test manuelle.
- `Auto actif` et exclusions persistants en JSON local.
- `Auto actif` limite la correction a une calibration one-shot par source active, avec log `volume.auto_locked` quand une correction supplementaire est ignoree.
- Changement de cible globale : applique un profil en pourcentage du melangeur Windows, rearme une calibration ponctuelle, expose la cible a l'extension via `GET /global-target`, et autorise un fallback Windows immediat pour que l'action utilisateur soit effective rapidement.
- `Sortie globale` est strictement en lecture seule : elle journalise `global_output.*` avec RMS/pic/etat, sans volume master, sans audio brut, sans samples.
- Sessions inconnues ou non controlables affichees honnetement.
- Sous-sources navigateur affichees separement quand elles arrivent de la simulation ou du bridge.
- Anti-conflit actif : quand une vraie source navigateur recente est controlee par `BrowserGain` verrouille, le desktop evite les corrections automatiques concurrentes. Les etats `measuring`, `ObserveOnly`, `Unknown`, `skipped` et `no-signal` gardent le fallback Windows disponible.

## Lancement Depuis Le Script

Le script racine `Lancer StreamVolume Guard Hub Desktop.cmd` arrete d'abord les build servers .NET, compile le projet avec `-nr:false`, puis ouvre l'executable compile. Cela evite les erreurs WPF intermittentes sur `StreamVolumeGuard.App_MarkupCompile.cache` quand un ancien build a laisse un fichier dans `obj/`.

## Couverture Audio

Le desktop est global au niveau des sessions Windows. Il ne remplace pas un driver, un peripherique virtuel ou un compresseur studio.

Les sous-sources navigateur sont representees separement quand elles arrivent de l'extension ou de la simulation. Leur surface de controle doit etre explicite : `BrowserGain`, `ObserveOnly`, `Unknown`, ou une autre valeur supportee par `packages/protocol`.

Quand une sous-source navigateur est `BrowserGain` et controlable, l'extension devient prioritaire seulement apres verrouillage de calibration et le desktop affiche son etat. Tant que la sous-source mesure encore, devient `ObserveOnly`, `Unknown`, silencieuse ou inexploitable, le controle V1 revient au `WindowsSessionVolume` du navigateur, surtout si une seule page web joue. Un changement volontaire de cible peut aussi declencher ce fallback Windows pour donner un effet immediat. Les colonnes `Raison` et `Action` expliquent pourquoi une source n'est pas directement controlable et guident vers rechargement, reprotection, fallback Windows ou OBS.
