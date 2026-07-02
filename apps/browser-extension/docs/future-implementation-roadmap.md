# StreamVolume Guard Hub - Roadmap D'implémentation

Ce document classe les prochaines idées d'implémentation par priorité. Il ne sert pas à vérifier si la V1 fonctionne : il sert à choisir quoi construire ensuite, dans quel ordre, avec le moins de complexité possible.

## Priorité 0 - Fiabiliser La V1 Publique

Objectif : rendre la version publiée facile à installer, tester et déboguer.

Déjà livré :

- [x] Diagnostics streamer de base : média détecté, pipeline actif, source active, exclusions, erreur récente.
- [x] Migration simple des réglages dans `storage/settings.js`.
- [x] Politique privacy-first : pas de tracker, pas de collecte, pas de télémétrie automatique.
- [x] Politique de confidentialité publique dans `docs/privacy-policy.md`.
- [x] Export diagnostic JSON local depuis les Options.
- [x] Builds `dist/` commités pour installation sans Node.js.
- [x] Script de zips publics dans `tools/package-release.js`.
- [x] Plan de test plateformes réelles dans `docs/real-platform-test-plan.md`.
- [x] Contrat de stabilité audio et checklist de reprise dans `docs/maintenance-checklist.md`.

À renforcer ensuite :

- [ ] Ajouter une page `docs/known-issues.md` avec les bugs confirmés et contournements.
- [ ] Ajouter des captures d'écran propres pour GitHub et stores.
- [ ] Exécuter et compléter le plan de test plateformes réelles avant d'annoncer une compatibilité forte.

### Stabiliser Les Zones Critiques

Le rapport Graphify identifie les zones à surveiller en priorité :

- `background.js`
- `content.js`
- `audio/normalizer.js`
- `storage/settings.js`
- `offscreen/offscreen.js`
- `options/options.js`

Vérification ciblée recommandée :

| Priorité | Zone | Pourquoi |
| --- | --- | --- |
| 1 | `storage/settings.js` | Une erreur de configuration peut casser tout le comportement. |
| 2 | `audio/normalizer.js` | Cœur produit : normalisation audio. |
| 3 | `content.js` | Détection média, risque de double traitement. |
| 4 | `background.js` | Permissions, injection, capture onglet. |
| 5 | `offscreen/offscreen.js` | Fallback Chromium sensible. |
| 6 | `options/options.js` | Module dense, faible cohésion, risque de bugs UI. |

Minimum viable : garder le projet installable par un testeur non technique.

## Priorité 1 - Valider `Capture Onglet` Sur Sites Réels

Objectif : confirmer que le fallback Chromium résout les cas Spotify, Deezer et lecteurs complexes.

Déjà livré :

- [x] Bouton unique `Protéger cet onglet` dans la popup.
- [x] Document offscreen Chromium pour héberger la capture audio.
- [x] Réutilisation de la même chaîne audio que les médias HTML.
- [x] Source active affichée dans les diagnostics.
- [x] Permissions `tabCapture` et `offscreen` retirées des builds Firefox/Safari.
- [x] Respect des domaines exclus avant de lancer la capture d'onglet.
- [x] Arrêt automatique de la capture quand l'onglet navigue.

À faire :

- [ ] Tester Spotify Web Player sur Chrome, Brave et Edge.
- [ ] Tester Deezer web sur Chrome, Brave et Edge.
- [ ] Tester Twitch, Kick, YouTube et TikTok avec changement de vidéo ou live.
- [ ] Vérifier que l'arrêt de capture fonctionne quand l'onglet change, se ferme ou quand l'utilisateur coupe l'extension.
- [ ] Ajouter une phrase claire dans la popup quand la capture d'onglet n'est pas disponible sur Firefox ou Safari.

Minimum viable suivant : une validation réelle documentée, pas seulement des tests statiques.

## Priorité 2 - Profils Par Plateforme Plus Visibles

Objectif : réduire les réglages manuels pour les streamers.

Déjà livré :

- [x] Profils recommandés localement pour YouTube, Twitch, TikTok, Kick, Spotify web et Deezer web.
- [x] Surcharge locale par domaine depuis la popup.
- [x] Sauvegarde locale sans serveur.
- [x] Section Options pour voir les profils par plateforme.
- [x] Modification locale du profil par plateforme depuis Options.
- [x] Bouton pour revenir au profil recommandé.
- [x] Affichage du statut recommandé ou personnalisé.
- [x] Tests unitaires sur l'interface Options des profils plateforme.

À faire :

- [ ] Ajouter plus tard une vue avancée pour éditer tous les domaines personnalisés hors plateformes connues.

Minimum viable suivant : l'utilisateur doit comprendre pourquoi le profil change selon le site.

## Priorité 3 - Mode Panic Plus Streamer

Objectif : protéger immédiatement le stream quand un son explose.

Déjà livré :

- [x] Bouton Panic dans la popup.
- [x] Réduction rapide du niveau de l'onglet actif.
- [x] État Panic dans les diagnostics.

À faire :

- [ ] Ajouter un raccourci clavier simple pour activer Panic sans ouvrir la popup.
- [ ] Ajouter un mode `cap temporaire 10 secondes`.
- [ ] Ajouter une animation discrète mais visible quand Panic est actif.
- [ ] Ajouter un réglage Options pour choisir `mute`, `-30 dB` ou `-20 dB`.

Minimum viable suivant : Panic utilisable en plein live sans chercher le bouton.

## Priorité 4 - Calibration OBS Plus Guidée

Objectif : aider un streamer à régler navigateur + OBS sans expertise audio.

Déjà livré :

- [x] Recommandation du profil OBS.
- [x] Page de test locale avec boutons simples `Son faible`, `Son fort` et `Son très fort`, plus démo avant / après.
- [x] Slider `Volume moyen voulu` dans Options avec écoute locale générée par le navigateur.

À faire :

- [ ] Ajouter des sons de calibration directement dans Options.
- [ ] Ajouter un mini guide visuel : où doit rester le vumètre OBS.
- [ ] Ajouter une procédure en 60 secondes avec niveaux conseillés.
- [ ] Ajouter un export texte des réglages recommandés pour OBS.
- [ ] Tester la calibration avec capture navigateur, capture fenêtre et capture application audio si disponible dans OBS.

Minimum viable suivant : un streamer doit pouvoir régler OBS sans connaître les dB.

## Priorité 5 - Speech Priority

Objectif : rendre les contenus plus agréables pour les lives avec commentaire vocal.

Idée d'implémentation :

- [ ] Créer un profil `Speech` ou une option dans le profil Stream.
- [ ] Éviter de trop booster les basses et la musique dense.
- [ ] Stabiliser davantage les voix.
- [ ] Comparer sur YouTube, Twitch, podcasts, lives parlés et TikTok.
- [ ] Garder l'approche légère : pas de séparation vocale IA pour la V1.

Minimum viable : nouveau profil avec réglages plus doux, sans modèle IA et sans coût serveur.

## Priorité 6 - Integration Hybride Desktop

Objectif : relier la couche navigateur au desktop pour couvrir les sources web et les applications Windows sans melanger les responsabilites.

Important : une extension navigateur ne peut pas traiter directement l'audio des applications PC. Dans le repo hybride, cette couverture existe dans `apps/desktop` via les sessions audio Windows. L'extension doit seulement annoncer ce qu'elle voit dans les onglets/sites.

Pistes actuelles :

- [ ] Envoyer `browser_source_observed` depuis l'extension.
- [ ] Transporter les evenements via un bridge local `127.0.0.1`.
- [ ] Afficher les vraies sous-sources navigateur dans le desktop.
- [ ] Declarer `BrowserGain`, `ObserveOnly` ou `Unknown` pour chaque source web.
- [ ] Eviter les conflits entre gain navigateur et volume de session Windows.

Recommandation : ne pas transformer l'extension en application PC. Garder trois couches separees : extension navigateur, protocole, desktop Windows.

Raison : cette separation permet de couvrir plus de sources tout en restant local, testable et honnete sur les limites de controle.

## Ordre Recommandé

1. Exécuter `docs/real-platform-test-plan.md` sur YouTube, Twitch, TikTok, Kick, Spotify web et Deezer web.
2. Valider le routeur `Protéger cet onglet` sur Chrome, Brave et Edge avec Spotify, Deezer, Twitch, Kick, TikTok et YouTube.
3. Rendre Panic utilisable sans ouvrir la popup.
4. Améliorer la calibration OBS avec une procédure guidée.
5. Ajouter Speech Priority.
6. Connecter l'extension au desktop hybride via `packages/protocol` et le bridge local `127.0.0.1`.

Le meilleur ratio coût / impact est maintenant double : valider le routeur navigateur sur les lecteurs web et connecter ses observations au desktop sans cacher les sources `ObserveOnly` ou `Unknown`.

