# AGENTS.md - StreamVolume Guard Hub

Guide de travail pour les contributeurs humains et les assistants IA dans ce dossier.

## Methode Produit Obligatoire

Avant toute modification importante, appliquer cette sequence :

1. Brainstorm : explorer plusieurs directions, opportunites, risques et variantes.
2. Map : cartographier objectif, utilisateurs, cas d'usage, contraintes, business et maintenance.
3. Analyze : chercher les problemes avant qu'ils arrivent, y compris cout, complexite, securite et limites produit.
4. Decide : presenter les options, les compromis et la recommandation.

Passer a l'implementation seulement apres validation explicite de l'utilisateur.

Exception : si le message utilisateur commence par `!`, executer directement la demande avec un changement minimal.

## Direction Actuelle

StreamVolume Guard Hub est un produit local pour streamers qui combine :

- `apps/desktop` : mixeur Windows intelligent base sur les sessions audio Windows.
- `apps/browser-extension` : couche fine navigateur pour les medias web quand le navigateur permet d'agir.
- `packages/protocol` : contrat commun entre desktop, extension et bridge local.
- bridge local : transport testable sur `127.0.0.1:47841` uniquement.

## Regle Anti Mauvaise Surprise

Toute source audio affichee doit etre classee explicitement :

- `origin` : `WindowsSession` ou `BrowserExtension`.
- `controlSurface` : `WindowsSessionVolume`, `BrowserGain`, `ObserveOnly` ou `Unknown`.
- `status` : etat lisible pour le testeur.
- `isControllable` : vrai uniquement si une couche peut vraiment agir.

Ne jamais promettre qu'une source est equilibree si elle est seulement observee.

## Contraintes Non Negociables

- Pas de driver audio maison pour la V1.
- Pas de traitement audio sample par sample dans le desktop V1.
- Pas de compte, cloud sync, tracker ou telemetrie automatique.
- Pas de patch moteur cible du type `if TikTok`, `if Chrome`, `if Spotify`.
- Garder desktop, extension et protocole separes.
- Ne pas publier de release GitHub ni tag sans demande explicite de l'utilisateur.
- Ne pas modifier les dossiers generes : `bin/`, `obj/`, `dist/`, `build/`, `out/`, `release-assets/`, `release/`, `releases/`, `graphify-out/`, `.graphify/`, `node_modules/`.

## Graphify

Utiliser Graphify seulement si `graphify-out/` existe et contient au moins un fichier utile :

- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/.graphify_analysis.json`
- `graphify-out/manifest.json`
- `graphify-out/graph.json`

Si Graphify est absent, ne pas bloquer : faire une analyse classique en lisant uniquement les fichiers necessaires.

## Documents Sources

- Vision hybride : `docs/hybrid-architecture.md`
- Plan produit courant : `docs/product-next-plan.md`
- Checklist testeur : `docs/tester-checklist.md`
- Cahier couche desktop : `docs/desktop-v1-cahier-des-charges.md`
- Protocole : `packages/protocol/README.md`
- Extension navigateur : `apps/browser-extension/README.md`

Les fichiers dans `docs/superpowers/plans/` sont des archives de travail, pas la source de verite actuelle.
## Maintenance Continue

Apres chaque implementation, verifier et mettre a jour les artefacts de pilotage concernes :

- `CHANGELOG.md` pour tout changement produit, test, doc, workflow GitHub, packaging ou limite utilisateur.
- `docs/implementation-prompts.md` si l'ordre de suite, les prompts a venir ou l'etat des paquets changent.
- `docs/product-next-plan.md` si le statut fait/pas fait ou les prochaines priorites changent.
- `docs/tester-checklist.md` et `docs/maintainer-checklist.md` si les tests, commandes, logs ou procedures changent.
- README, CONTRIBUTING et `.github/` si le lancement, la contribution, CI, PR ou les rapports d'issues changent.

Ne pas attendre la fin du projet pour corriger ces fichiers : ils doivent rester alignes au fur et a mesure.
