# StreamVolume Guard Hub - Déploiement Multi-Navigateurs

Ce document explique comment préparer StreamVolume Guard Hub pour plusieurs navigateurs sans dupliquer le coeur audio.

Le principe : le code commun reste dans le projet, puis `tools/build-targets.js` génère des dossiers propres dans `dist/` avec un manifest adapté à chaque plateforme.

## Générer Les Builds

Depuis le dossier du projet :

```powershell
node tools/build-targets.js
```

Le script génère :

```text
dist/chromium
dist/firefox
dist/firefox-android
dist/safari-source
```

Ces dossiers sont générés automatiquement. Ils sont volontairement commités sur GitHub pour que les testeurs puissent installer l'extension sans lancer Node.js.

## Matrice De Support

| Plateforme | Statut | Dossier généré | Notes |
| --- | --- | --- | --- |
| Chrome desktop | Support principal | `dist/chromium` | Cible MVP actuelle, avec capture d'onglet via `Protéger cet onglet`. |
| Brave desktop | Support principal | `dist/chromium` | Basé Chromium, même package, avec capture d'onglet à tester. |
| Edge desktop | Compatible à tester | `dist/chromium` | Peut être publié via Edge Add-ons ou installé en test, avec capture d'onglet à valider. |
| Firefox desktop | Déployable à tester | `dist/firefox` | Manifest avec `browser_specific_settings.gecko`. |
| Firefox Android | Déployable à tester | `dist/firefox-android` | Manifest avec `gecko_android`; vérifier sur vrai appareil. |
| Safari macOS | Source prête | `dist/safari-source` | Nécessite conversion et packaging avec Xcode sur Mac. |
| Safari iOS/iPadOS | Source prête | `dist/safari-source` | Nécessite app wrapper Safari Web Extension et publication App Store. |
| Chrome Android | Non supporté officiellement | Aucun | Chrome Android ne doit pas être présenté comme une cible officielle. |


## Fallback Capture Onglet

La source capture d'onglet est livrée seulement dans `dist/chromium` pour Chrome, Brave et Edge desktop.

Il utilise les permissions Chromium `tabCapture` et `offscreen` pour capturer l'audio de l'onglet actif quand la détection HTML `video` / `audio` ne suffit pas. Le traitement audio reste local et réutilise la même chaîne de normalisation.

Les builds Firefox, Firefox Android et Safari source retirent ces permissions pendant la génération, afin de ne pas promettre une API qui n'est pas supportée de la même manière dans cette V1.
## Firefox Desktop

Le build Firefox ajoute :

- `browser_specific_settings.gecko.id` ;
- `browser_specific_settings.gecko.strict_min_version` ;
- `browser_specific_settings.gecko.data_collection_permissions.required = ["none"]`.
- `background.scripts` en plus de `background.service_worker`, car Firefox utilise un contexte background de type event page pour Manifest V3.

Vérification recommandée :

```powershell
web-ext lint --source-dir dist/firefox
```

Puis tester l'extension dans `about:debugging` avec `Load Temporary Add-on`.

## Firefox Android

Le build Firefox Android ajoute aussi :

- `browser_specific_settings.gecko_android.strict_min_version`.
- le même fallback `background.scripts` que Firefox desktop.

Vérification recommandée :

```powershell
web-ext lint --source-dir dist/firefox-android
```

À tester ensuite sur un vrai téléphone Android avec Firefox, car la popup, les permissions et l'injection de scripts peuvent se comporter différemment du desktop.

## Safari macOS

Le dossier `dist/safari-source` prépare une source WebExtension compatible Safari, mais ce n'est pas encore un package final.

Le manifest Safari source conserve `background.service_worker` et ajoute `background.scripts`, afin de laisser Safari choisir le contexte background compatible pendant la conversion.

Étapes côté Mac :

1. Installer Xcode.
2. Convertir la WebExtension avec l'outil Safari Web Extension d'Apple.
3. Ouvrir le projet généré dans Xcode.
4. Tester dans Safari macOS.
5. Signer et distribuer via le Mac App Store ou un flux Apple compatible.

Point important : cette étape ne peut pas être finalisée proprement depuis Windows.

## Safari iOS/iPadOS

Safari iOS/iPadOS utilise aussi les Safari Web Extensions, mais avec une app wrapper iOS/iPadOS.

Étapes côté Mac :

1. Reprendre `dist/safari-source`.
2. Créer ou convertir une app wrapper avec Xcode.
3. Tester sur simulateur puis vrai iPhone/iPad.
4. Vérifier l'ergonomie mobile de la popup et de la page Options.
5. Publier via App Store Connect si la version est destinée au public.

Limite business : la distribution publique demande généralement un compte développeur Apple.

## Chrome Android

Chrome Android ne doit pas être listé comme supporté officiellement pour cette V1.

Certains navigateurs Android alternatifs peuvent charger des extensions Chromium, mais ce n'est pas une cible fiable pour StreamVolume Guard Hub. Pour éviter les mauvaises attentes, la documentation publique doit rester claire :

```text
Chrome Android : non supporté officiellement.
```

## Checklist Avant Publication Multi-Navigateurs

- [ ] Lancer `node tools/build-targets.js`.
- [ ] Vérifier `dist/chromium/manifest.json`.
- [ ] Vérifier que `dist/chromium` contient `offscreen/` et les permissions `tabCapture` / `offscreen`.
- [ ] Vérifier `dist/firefox/manifest.json`.
- [ ] Vérifier que Firefox, Firefox Android et Safari source ne contiennent pas les permissions `tabCapture` / `offscreen`.
- [ ] Vérifier `dist/firefox-android/manifest.json`.
- [ ] Vérifier `dist/safari-source/manifest.json`.
- [ ] Lancer `web-ext lint --source-dir dist/firefox` si `web-ext` est installé.
- [ ] Lancer `web-ext lint --source-dir dist/firefox-android` si `web-ext` est installé.
- [ ] Tester Chrome ou Brave desktop.
- [ ] Tester Firefox desktop.
- [ ] Tester Firefox Android sur vrai appareil avant de promettre le support mobile.
- [ ] Tester Safari macOS et iOS/iPadOS uniquement depuis un Mac avec Xcode.
- [ ] Garder la promesse privacy : aucune télémétrie automatique et collecte déclarée `none` côté Firefox.

## Sources Utiles

- MDN WebExtensions : https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions
- `browser_specific_settings` Firefox : https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings
- Firefox Android extensions : https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/
- Safari Web Extensions : https://developer.apple.com/documentation/safariservices/safari-web-extensions
