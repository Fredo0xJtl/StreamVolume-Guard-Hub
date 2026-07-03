# Setup GitHub - StreamVolume Guard Hub

## Repository

Nom recommande :

```text
StreamVolume-Guard-Hub
```

Description courte :

```text
Hub audio local Windows pour streamers : mixeur intelligent par application, extension navigateur, bridge local, sans driver, sans compte, sans telemetrie.
```

## Topics

```text
windows
audio
streaming
streamers
volume-mixer
browser-extension
local-first
no-telemetry
dotnet
wpf
manifest-v3
```

## Positionnement

- Desktop : mixeur Windows intelligent par application.
- Extension : detail navigateur, onglets et sites quand le navigateur permet d'agir.
- Bridge local : transport sur `127.0.0.1`, sans cloud.
- Protocole : contrat commun entre desktop, extension et bridge.

## Hygiene De Publication

- Ne pas publier de release ou tag tant qu'une version testeur n'est pas validee.
- Ne pas inclure `bin/`, `obj/`, `dist/`, `build/`, `out/`, `release-assets/`, `release/`, `releases/`, `graphify-out/`, `.graphify/` ou `node_modules/`.
- Garder les sources non controlables visibles comme `ObserveOnly` ou `Unknown`.
- Mettre a jour `CHANGELOG.md` a chaque changement produit, test, doc, GitHub ou packaging.
