# Changelog

Toutes les modifications notables de StreamVolume Guard Hub sont documentées ici.

Le changelog public est volontairement consolidé : les micro-corrections faites avant la première vraie publication sont regroupées dans des versions lisibles pour les testeurs.

## Non publié

### Corrigé

- Fusion du profil `Universel` dans `Stream` : `Stream` devient le profil recommandé unique pour YouTube, Twitch, TikTok, Kick, Spotify web et Deezer web.
- Migration automatique des anciens réglages `universal` vers `stream`, y compris les profils locaux par domaine.
- Les profils pilotent maintenant réellement la cible de volume quand l'utilisateur choisit un profil ; le slider `Volume moyen voulu` reste prioritaire dès qu'il est modifié manuellement.
- Gain automatique rendu plus stable sur les profils naturels (`Stream`, `Doux`, `Normal`, `Nuit`) pour éviter de suivre trop agressivement les micro-variations d'une voix ou d'une musique.
- Capture d'onglet Chromium branchée directement sur une source `MediaStream` Web Audio, au lieu de rejouer le flux via un élément audio intermédiaire.
- Popup simplifiée avec un seul bouton `Protéger cet onglet` : l'extension choisit automatiquement entre média HTML et capture d'onglet selon la plateforme.
- TikTok passe en priorité par la capture d'onglet Chromium quand elle est disponible, car son lecteur web change souvent de média.
- Page de test locale maintenue sur le profil `Stream` par défaut, sans bloquer les changements de profil explicites pendant les tests.
- Les changements de `Volume moyen voulu` appliqués depuis Options rafraîchissent maintenant immédiatement les onglets déjà traités, sans devoir rouvrir l'onglet.
- Les changements de `Volume moyen voulu` s'appliquent aussi immédiatement aux onglets déjà protégés en `capture d'onglet`.
- Les captures d'onglet comme TikTok écoutent maintenant directement les changements de réglages sauvegardés, afin que la cible dB choisie dans Options soit resynchronisée pendant la lecture.
- TikTok ne retombe plus silencieusement sur le traitement média HTML si `tabCapture` est indisponible, et la popup signale maintenant les captures actives sans signal audio détecté.
- La popup force maintenant la mise à niveau vers `capture d'onglet` sur TikTok lorsqu'un ancien état `média HTML` est encore actif, au lieu de couper la protection.
- Le diagnostic TikTok ne reste plus bloqué sur `contextState: unknown` après le démarrage de la capture, et indique maintenant si le signal Web Audio est `starting`, `signal`, `no-signal` ou `unavailable`.
- Une capture d'onglet muette malgré une piste audio live déclenche maintenant une seule relance automatique contrôlée, avec compteur visible dans le diagnostic.
- Quand TikTok est silencieux ou non audible pendant un changement de réglage, la relance automatique attend maintenant que l'onglet redevienne audible au lieu de consommer le seul essai et d'afficher une erreur permanente.
- Le diagnostic de capture conserve maintenant l'état audible/actif calculé par le background quand l'offscreen renvoie un statut partiel, afin d'éviter un faux `no-signal` après un changement de cible dB sur TikTok.
- Les paramètres `attack` et `release` du compresseur Web Audio sont bornés dans la plage nominale navigateur pour éviter les warnings Chrome.
- Le réglage `release` du compresseur évite aussi la borne exacte `1 s` et les valeurs non finies, ce qui supprime le warning Chrome restant sur `DynamicsCompressor.release`.
- Changer le `Volume moyen voulu` depuis Options ne reconnecte plus tout le graphe audio en direct, ce qui évite les grésillements pendant une vidéo en lecture.
- Quand TikTok renvoie une capture d'onglet audible mais sans signal Web Audio après une relance, l'extension stoppe automatiquement `tabCapture` et tente le fallback média HTML au lieu de rester active sans modifier le son.
- Version Chromium alignée sur Chrome 116 minimum, nécessaire pour utiliser `tabCapture` depuis le service worker avec un document offscreen.
- Les statuts `tabCapture` sont maintenant envoyés au bridge local comme sous-sources navigateur, afin que le desktop voie TikTok en `BrowserGain` si le signal est exploitable ou en `ObserveOnly` si la capture ne fournit pas de signal utilisable.

## [0.1.4] - 2026-06-29

### Corrigé

- Ajout d'un garde-fou contre les pics transitoires au début des changements de niveau dans le smoke test navigateur.
- Stabilisation du ducking de transition du normalizer avec des constantes nommées, pour conserver la protection anti-pic sans laisser passer de sursaut audible.
- Lissage des grands boosts vers un son faible pour éviter qu'il monte trop haut avant de redescendre.
- Resserrement du trim de sortie et du smoke test pour vérifier une égalisation plus proche de la cible pendant l'écoute.
- Export diagnostic enrichi avec une synthèse streamer exploitable, sans URL complète ni titre de page.
- Ajout d'un indicateur de qualité dans l'export diagnostic pour savoir si le fichier est exploitable ou incomplet.
- Ajout d'un test streamer guidé dans la page locale pour valider rapidement faible, fort et très fort avant un live.
- Ajout de la page de test et des guides testeurs essentiels dans les distributions publiques.
- Clarification du README pour guider les débutants vers les fichiers `.zip` de la release GitHub.
- Refonte de la page Options en tableau de bord streamer plus lisible et plus intuitif.
- Refonte visuelle de la page de test locale pour reprendre le même design que la page Options.
- Badges de confiance de la popup compactés et libellé `Local` simplifié.
- Alignement centré des badges de confiance en haut de la popup.
- Badges de confiance élargis avec cadre ajusté à leur largeur réelle.
- Ajout de la mesure `Peak OBS estimé` sur la page de test et dans les diagnostics, pour comparer les niveaux vus dans OBS.
- Verrouillage du critère d'égalisation streamer : écart RMS max `0.5 dB` et écart Peak OBS max `1.5 dB` après stabilisation.
- Accélération du rattrapage des sons très faibles pour qu'ils rejoignent plus vite le niveau des sons forts et très forts.
- Protection contre les réglages `Boost max dB` trop bas : le boost minimum est relevé selon le volume moyen voulu pour éviter qu'un son faible reste bloqué sous les autres.
- Plafond du `Volume moyen voulu` ramené à `-15 dB RMS`, car une cible plus forte n'est pas récupérable pour le son faible de test avec le boost max disponible.
- Libellé de la page de test clarifié : `Moyenne RMS traitée` affiche la moyenne autour de `-21 dB`, tandis que `Peak OBS estimé` doit rester autour de `-18 dB`.
- Ajout d'une marge contrôlée au boost récupérable et d'un trim post-chaîne plafonné, pour aligner le son faible avec les sons fort et très fort sans dépassement audible dans OBS.
- Analyse de sortie rendue plus réactive pour éviter que le correcteur compense un niveau obsolète après un changement très fort/faible.
- Clarification des textes du compresseur : en V1, le compresseur Web Audio natif reste neutre pour éviter les variations cachées du navigateur.
- Rattrapage plus rapide des contenus web réalistes après compression, pour éviter qu'un son fort ou très fort reste perçu trop faible en condition OBS réelle.
- Rattrapage du son faible après un son très fort rendu plus direct : le niveau revient autour de `-21 dB RMS` / `-18 dB Peak OBS estimé` en environ une seconde dans le smoke navigateur.
- Capteur `Peak OBS estimé` stabilisé pendant les transitions pour éviter d'afficher un pic obsolète au moment où la page change de niveau audio.
- Ajout d'une politique de confidentialité publique dans `docs/privacy-policy.md`.
- Ajout d'un plan de test plateformes réelles dans `docs/real-platform-test-plan.md`.
- Ajout de `tools/package-release.js` pour générer les zips publics sans refaire les commandes PowerShell à la main.
- Profils par plateforme clarifiés dans les options avec badge recommandé/personnalisé et sélection plus explicite.
- Plage du `Volume moyen voulu` ajustée de `-48 dB` à `-15 dB` et champ de saisie clavier déplacé dans le bloc du slider.
- Logo de la page de test aligné sur l'icône PNG officielle de l'extension pour garantir son affichage dans les builds distribués.
- Ajout de `docs/maintenance-checklist.md` pour figer le contrat audio validé, les commandes de vérification et les règles de reprise.
- Correction du README : le son `Très fort` de la page de test est documenté autour de `-4 dB RMS`, pas `-3 dB`.
- Checklist testeur clarifiée : `Avant brut` doit faire entendre les écarts, tandis que l'extension active doit rapprocher les trois niveaux.

## [0.1.3] - 2026-06-27

### Corrigé

- Stabilisation de la page de test audio brute : les boutons `Son faible`, `Son fort` et `Son très fort` utilisent désormais un seul WAV continu avec segments internes.
- Suppression du changement de source audio entre `Son très fort` et `Son fort`, pour réduire les grésillements audibles sans extension activée.
- Ajout de fondus et de protections contre les clics rapides sur la page de test.
- Alignement du smoke test navigateur avec les niveaux encodés dans les WAV, au lieu d'utiliser `audio.volume` pour simuler les écarts.

### Vérification

- Tests unitaires Node.
- Smoke test navigateur réel avec extension chargée.
- Tests de packaging multi-navigateurs.
- Builds Chromium, Firefox, Firefox Android et source Safari régénérés.

## [0.1.2] - 2026-06-26

### Ajouté

- Builds prêts à tester pour Chromium, Firefox, Firefox Android et source Safari.
- Notes de release publiques réutilisables dans `store/release-0.1.2.md`.
- Fallback manuel `Capture onglet` sur Chromium desktop avec document offscreen.
- Mode Panic pour baisser immédiatement le niveau d'un onglet actif.
- Profils recommandés par plateforme : YouTube, Twitch, TikTok, Kick, Spotify web et Deezer web.
- Profils locaux par domaine, sans compte utilisateur, sans serveur et sans synchronisation.
- Profil OBS recommandé.
- Page de test locale avec sons faible, fort et tres fort.
- Bloc de résultats live sur la page de test : cible, gain, RMS brut, sortie traitée, risque, médias et pics contenus.
- Slider `Volume moyen voulu` dans les Options, avec plage étendue jusqu'à `-36 dB`.
- Export diagnostic JSON local depuis les Options pour aider les testeurs a reporter un bug manuellement.

### Corrigé

- Correction du cas où l'activation pouvait couper le son d'un onglet déjà en lecture.
- Reconfiguration des pipelines audio existants quand les réglages changent, sans recréer `createMediaElementSource()`.
- Application explicite des réglages via le bouton `Appliquer les réglages`, avec retour visuel après envoi aux onglets ouverts.
- Propagation des changements de cible RMS aux onglets déjà traités.
- Stabilisation de l'égalisation entre les sons faible, fort et très fort sur la page de test.
- Ajout de micro-rampes de volume sur la page de test et dans le pipeline audio pour réduire les clics entre les niveaux.
- Remise à zéro rapide de la correction de sortie après un gros changement de niveau, pour éviter qu'un son faible reste trop bas après un son très fort.
- Alignement du champ `Cible RMS dB` avec la limite réelle `-14 dB` déjà appliquée par le slider.
- Restriction du message local `WLG_TEST_PAGE_STATUS` à l'origine de la page de test au lieu d'un `postMessage` global.
- Protection contre le double traitement d'un meme element audio ou video.
- Respect des domaines exclus, y compris avec la capture d'onglet.
- Arret de la capture d'onglet lors d'une navigation ou fermeture d'onglet.
- Textes Options et popup clarifiés en français et anglais.

### Confidentialité

- Aucun tracker.
- Aucune télémétrie automatique.
- Aucune collecte d'audio, d'historique, de titre de page ou d'URL complete.
- Diagnostic généré localement et partagé uniquement si l'utilisateur l'exporte volontairement.
- Les manifests Firefox déclarent explicitement `data_collection_permissions.required = ["none"]`.

### Vérification

- Tests unitaires Node.
- Smoke test navigateur réel sur Chromium avec extension chargée depuis `dist/chromium`.
- Tests de packaging multi-navigateurs.
- Test de cohérence branding et textes publics.
- Controle des permissions et absence d'appel reseau produit.

### Pourquoi

Cette version est la première base publique crédible pour testeurs : elle regroupe la stabilisation audio, les options essentielles, les builds multi-navigateurs et les diagnostics locaux sans multiplier les numéros de version visibles.

## [0.1.1] - 2026-06-25

### Ajouté

- Documentation d'installation pour Chrome, Brave, Firefox, Firefox Android et source Safari.
- README réorganisé pour favoriser l'adoption : promesse streamer, confiance, installation, tests, limites et roadmap.
- Checklist testeur publique pour guider les retours audio et les diagnostics.
- Roadmap d'implémentation priorisée pour les prochaines fonctions.
- Description courte GitHub et éléments de présentation pour Discord.
- Social preview GitHub `assets/social-preview.png`.
- Regle de maintenance : tout changement public doit verifier si `CHANGELOG.md` doit etre mis a jour.

### Changé

- Renommage public du projet vers StreamVolume Guard Hub avec identite Guard Signal.
- Positionnement privacy-first : open source, sans tracker et sans collecte de donnees.
- Chemins d'installation generiques avec `chemin vers StreamVolume Guard Hub`, sans chemin personnel.

### Pourquoi

Cette version prépare le projet pour un dépôt public propre : compréhensible, testable et partageable sans exposer de données privées.

## [0.1.0] - 2026-06-25

### Ajouté

- Première version MVP de StreamVolume Guard Hub.
- Extension Chromium Manifest V3.
- Détection des éléments HTML `video` et `audio`.
- Normalisation audio locale via Web Audio API.
- Analyse RMS approximative.
- Gain automatique lissé.
- Reduction rapide des sons trop forts.
- Remontée progressive des sons faibles.
- Compresseur doux.
- Limiteur de sécurité autour de `-1 dB`.
- Profils Doux, Normal, Stream, OBS recommandé et Nuit.
- Popup avec ON/OFF, site actif, profil actif, gain actuel et diagnostics.
- Page Options.
- Stockage local avec `chrome.storage.local`.
- Liste d'exclusion de domaines.
- Architecture séparée dans `audio/`, `popup/`, `options/`, `storage/`, `license/`, `tests/` et `docs/`.
- Module `license/capabilities.js` pour garder une séparation propre avec de futures capacités avancées.

### Confidentialité

- Traitement audio local sur la machine de l'utilisateur.
- Aucun backend.
- Aucune dependance payante.
- Aucun compte utilisateur.
- Aucune collecte inutile de donnees.

### Pourquoi

Cette version pose le coeur du produit : aider les streamers à réduire les écarts de volume et les pics audio dans le navigateur, avec un traitement local, lisible et maintenable.
