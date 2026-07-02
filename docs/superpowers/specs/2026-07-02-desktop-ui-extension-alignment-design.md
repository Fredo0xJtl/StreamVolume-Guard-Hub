# Design - Desktop UI Alignée Extension

Date : 2026-07-02
Projet : StreamVolume Guard Hub
Surface : `apps/desktop`
Decision : theme clair par defaut, mode sombre activable.

## Objectif

Refondre l'interface desktop pour qu'elle colle visuellement a l'extension navigateur, tout en restant efficace comme melangeur de volume Windows intelligent.

La V1 desktop doit paraitre comme la meme application que l'extension : meme palette, memes badges, meme logique de cartes, meme ton produit local-first. Elle doit rester plus large et plus dense que le popup, car elle affiche des sources Windows, des sous-sources navigateur, des controles manuels, le bridge, les logs et Panic.

## Reference Visuelle Extension

Sources de reference :

- `D:\Codex\StreamVolume Guard Hybride\apps\browser-extension\popup\popup.css`
- `D:\Codex\StreamVolume Guard Hybride\apps\browser-extension\options\options.css`
- `D:\Codex\StreamVolume Guard Hybride\apps\browser-extension\popup\popup.html`
- `D:\Codex\StreamVolume Guard Hybride\apps\browser-extension\options\options.html`

Elements a reprendre :

- header bleu nuit `#10202c` ;
- fond clair `#f7f8fa` / `#eef4f6` ;
- cartes blanches avec bordure fine `#d7e1e8` ;
- rayon de bordure 8px maximum ;
- texte principal `#17202a` ;
- texte secondaire `#60707d` ;
- accent teal `#1f6f78` ;
- safe vert `#188a4d` ;
- warning ambre `#d88211` ;
- danger rouge `#c73333` ;
- badges de confiance : Local, Open source, Zero tracking ;
- boutons sobres, pas de style hero ou marketing.

## Direction Retenue

Option retenue : alignement extension strict avec quelques elements dashboard streamer.

Structure cible :

1. Header produit.
2. Barre de confiance et etat global.
3. Resume live compact.
4. Panneau `Applications Windows`.
5. Panneau `Sources navigateur`.
6. Panneau bas `Bridge, logs et debug`.

Le desktop reste un outil de travail, pas une landing page. L'ecran principal doit etre directement utilisable pour tester et regler le volume.

## Layout Cible

### Header

Contenu :

- logo si disponible dans `apps/browser-extension/assets/logo.svg` ;
- titre `StreamVolume Guard Desktop` ;
- sous-titre court `Mixeur intelligent local pour streamers` ;
- badge etat : `Auto off`, `Auto on`, `Bridge actif`, ou `Bridge erreur` ;
- bouton theme : `Clair` / `Sombre` ;
- bouton `Panic` plus visible que les autres actions.

Style :

- fond `#10202c` ;
- texte clair ;
- hauteur moderee ;
- pas de gros hero ;
- commandes compactes a droite.

### Bandeau Confiance

Reprendre l'esprit du popup :

- `Local only` / `Local` ;
- `Open source` ;
- `Zero tracking` ;
- `No account` si la place le permet.

Ces badges doivent etre discrets mais visibles. Ils rassurent sans polluer le workflow.

### Resume Live

Quatre cartes compactes :

- `Sources Windows` : nombre de sources visibles ;
- `Sources navigateur` : nombre de sous-sources recues ;
- `A surveiller` : nombre de Risky / Unknown / ObserveOnly ;
- `Mode` : Observation ou Auto actif.

But : comprendre l'etat de l'app en 2 secondes.

### Applications Windows

Remplacer la table brute sombre par un panneau clair plus lisible.

Colonnes conseillees :

- Source ;
- Statut ;
- Pic ;
- Volume ;
- Controle ;
- Exclu ;
- Derniere action.

Regles :

- `Sons système Windows` doit rester une seule entree groupee ;
- badges colores pour les statuts ;
- slider visible mais compact ;
- les colonnes `origin`, `controlSurface`, `isControllable` peuvent etre affichees de facon lisible, mais pas comme du debug brut ;
- les sources `ObserveOnly` / `Unknown` doivent rester visibles.

### Sources Navigateur

Panneau coherent avec l'extension :

- Navigateur ;
- Site ;
- Statut ;
- Niveau ;
- Gain ;
- Controle ;
- Titre.

Regles :

- `BrowserGain`, `ObserveOnly`, `Unknown` doivent etre des badges lisibles ;
- ne pas afficher d'URL complete ;
- ne pas laisser croire qu'un onglet est controlable s'il ne l'est pas ;
- si aucune sous-source n'est recue, afficher un etat vide utile : `Aucune source navigateur recue pour le moment`.

### Bridge, Logs Et Debug

Zone basse plus propre :

- statut bridge ;
- dernier message logs ;
- boutons : `Marquer etape`, `Copier logs`, `Ouvrir logs`, `Simuler source navigateur`, `Rafraichir`.

Ces actions doivent etre secondaires. `Panic`, `Auto` et `Theme` restent dans le header.

## Mode Clair / Sombre

### Clair par defaut

Palette principale :

```text
Window background: #f7f8fa
Header: #10202c
Panel background: #ffffff
Panel soft background: #f5f8fa
Border: #d7e1e8
Text: #17202a
Muted text: #60707d
Accent: #1f6f78
Safe: #188a4d
Warning: #d88211
Danger: #c73333
```

### Sombre activable

Palette sombre alignee extension :

```text
Window background: #11161c
Header: #10202c
Panel background: #18212b
Panel soft background: #141c25
Border: #2b3846
Text: #ecf1f5
Muted text: #a8b3bf
Accent: #9ddce3
Safe: #7df0aa
Warning: #f3c46d
Danger: #ffb4b4
```

### Comportement

- bouton theme dans le header ;
- changement immediat sans redemarrer ;
- changement de theme persistant dans la config locale `%LOCALAPPDATA%\StreamVolumeGuard\config.json` ;
- clair reste le theme par defaut si aucune config n'existe encore.

## Composants UI

### Badges

Statuts :

- Safe : fond vert pale, texte vert ;
- Risky : fond rouge pale, texte rouge ;
- Low / Warning : fond ambre pale, texte ambre ;
- Muted : neutre ;
- Excluded : gris/teal ;
- ObserveOnly : ambre ou bleu selon lisibilite ;
- Unknown : gris + bordure ambre.

### Boutons

- primaire : texte clair sur `#17202a` ou header inverse ;
- secondaire : fond clair, bordure fine ;
- danger : Panic en rouge ;
- theme : bouton compact, pas un gros toggle.

### Tables

Les DataGrid peuvent rester en V1 si elles sont restylees proprement :

- fond clair ;
- headers lisibles ;
- lignes alternees legeres ;
- pas de grille sombre brute ;
- hauteur de ligne confortable ;
- sliders alignes.

Une refonte en cartes par source est possible plus tard, mais pas necessaire pour la V1 stable.

## Contraintes Techniques

- WPF .NET 8.
- Eviter d'introduire une grosse librairie UI.
- Preferer `ResourceDictionary` pour les couleurs/styles.
- Garder le code-behind existant utilisable.
- Ne pas casser les bindings existants : `Sessions`, `BrowserSources`, boutons existants.
- Ne pas modifier la logique audio pour une refonte visuelle.
- Ne pas toucher aux dossiers generes : `bin/`, `obj/`, `dist/`, `build/`, `release-assets/`, `graphify-out/`.

## Plan D'Implementation Recommande

1. Ajouter un systeme de theme WPF simple : ressources clair/sombre.
2. Restyler le shell principal : header, fond, panels.
3. Reorganiser les actions : `Auto`, theme et `Panic` dans le header ; logs/debug en bas.
4. Restyler les DataGrid en tables claires coherentes extension.
5. Ajouter badges visuels pour statut/controlSurface/isControllable.
6. Ajouter le resume live compact si les compteurs sont faciles a exposer.
7. Mettre a jour la checklist testeur avec le bouton theme et l'alignement extension.
8. Lancer tests desktop + build.

## Tests De Validation

Commandes depuis la racine :

```powershell
cd "D:\Codex\StreamVolume Guard Hybride"
dotnet run --project "apps/desktop/tests/StreamVolumeGuard.Tests/StreamVolumeGuard.Tests.csproj"
dotnet build "apps/desktop/StreamVolumeGuard.Desktop.sln" -nr:false
```

Tests manuels :

- lancer l'app desktop ;
- verifier que le theme clair est actif par defaut ;
- passer en sombre ;
- fermer puis relancer l'app et verifier que le theme sombre reste actif ;
- repasser en clair ;
- fermer puis relancer l'app et verifier que le theme clair reste actif ;
- verifier que les sources Windows restent lisibles ;
- verifier que `Sons système Windows` reste groupe ;
- verifier que les sous-sources navigateur restent lisibles ;
- verifier que Panic reste evident ;
- verifier que les logs/debug sont accessibles sans dominer l'ecran ;
- comparer visuellement avec l'extension popup/options.

## Risques

- Trop de changement XAML peut casser les bindings : limiter la premiere passe a styles/layout.
- Mode sombre peut devenir incoherent si les couleurs restent en dur : centraliser les couleurs.
- Les DataGrid WPF sont moins flexibles que du HTML : ne pas chercher une copie pixel-perfect du popup.
- Trop masquer les champs techniques peut cacher les limites du produit : garder `controlSurface` et `isControllable` visibles, mais sous forme lisible.

## Definition De Fini

La refonte est acceptable si :

- le desktop semble appartenir au meme produit que l'extension ;
- clair est le theme par defaut ;
- sombre est activable via un bouton ;
- le choix clair/sombre persiste apres redemarrage ;
- l'UI reste utilisable comme melangeur ;
- Panic, Auto, logs et bridge restent visibles ;
- les sources non controlables restent honnetement affichees ;
- les tests desktop passent ;
- la build desktop passe.

