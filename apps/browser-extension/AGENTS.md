# AGENTS.md - StreamVolume Guard Hub Browser Extension

Guide local pour travailler dans `apps/browser-extension`.

## Role Dans Le Hub

Cette extension est la couche fine navigateur de StreamVolume Guard Hub.

- Elle observe les medias web quand le navigateur le permet.
- Elle applique `BrowserGain` seulement quand elle controle vraiment la source.
- Elle envoie les sous-sources et logs utiles au desktop via le bridge local `127.0.0.1:47841`.
- Elle reste utilisable seule en `Mode autonome` quand le desktop est ferme.

## Regles Produit

- Ne pas ajouter de patch moteur cible du type `if TikTok`, `if YouTube`, `if Spotify`.
- Garder les sources non controlables visibles en `ObserveOnly`, `Unknown` ou `skipped`.
- Ne jamais promettre un controle par onglet si le signal n'est pas exploitable.
- Ne pas envoyer d'audio brut, d'URL complete, d'historique navigateur, de token ou de donnees personnelles.
- Garder la compatibilite avec le desktop via `packages/protocol`.

## Regles Techniques

- Garder la logique audio dans `audio/`.
- Garder le transport local dans `bridge/`.
- Garder la coordination navigateur dans `background.js` et `content.js` sans fusionner avec le desktop.
- Preferer des modules petits et testables avant d'ajouter de la logique a `background.js` ou `tests/unit.test.js`.
- Garder l'extension fonctionnelle sans desktop : le health check local doit seulement indiquer `Mode autonome`.

## BrowserGain

La calibration prioritaire doit rester prudente :

- mesurer sur une fenetre robuste avant de booster ;
- attenuer vite un debut dangereux si necessaire ;
- appliquer un gain une fois puis verrouiller ;
- rearmer seulement sur silence durable, changement source/media, changement de cible ou niveau durablement different ;
- laisser le fallback `WindowsSessionVolume` au desktop quand la source est `measuring`, `ObserveOnly`, `Unknown`, `skipped` ou `no-signal`.

## Validation

Depuis la racine du repo :

```powershell
node "apps/browser-extension/tests/unit.test.js"
node --check "apps/browser-extension/audio/browser-gain-calibration.js"
node --check "apps/browser-extension/audio/normalizer.js"
node --check "apps/browser-extension/bridge/client.js"
node --check "apps/browser-extension/background.js"
node --check "apps/browser-extension/content.js"
```

Mettre a jour `CHANGELOG.md`, `apps/browser-extension/README.md`, `docs/tester-checklist.md` ou `.docs/implementation-prompts.md` quand le comportement testeur change.
