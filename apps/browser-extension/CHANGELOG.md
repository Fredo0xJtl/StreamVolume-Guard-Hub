# Changelog

Toutes les modifications notables de StreamVolume Guard Hub sont documentées ici.

Le changelog public est volontairement consolidé : les micro-corrections faites avant la première vraie publication sont regroupées dans des versions lisibles pour les testeurs.

## Non publié

### Modifié

- Image de partage `assets/social-preview.png` refaite pour présenter StreamVolume Guard Hub comme mixeur audio hybride desktop, navigateur et bridge local.
- Réactivité On/Off : l’arrêt/activation évite désormais d’attendre une réanalyse complète de toutes les sources avant de répondre à la popup, et la désactivation globale coupe les captures actives sans rafraîchir immédiatement tous les onglets ouverts.
- Calibration `BrowserGain` reservee au mode avec app desktop connectee : environ 18 secondes et 8 secondes de signal utile. En mode autonome, l'extension revient au gain direct historique base sur le RMS, pour que la cible dB s’applique vite quand un media HTML est controlable.
- Changement de cible desktop plus reactif pour `BrowserGain` : une source deja verrouillee recalcule immediatement son gain depuis la mesure fiable existante, au lieu d'attendre une nouvelle fenetre complete.
- Les messages `browser_source_observed` transmettent maintenant `captureSignalState`, `browserState`, `reason` et `recommendedAction` pour que le desktop affiche une raison et une action claire quand une source reste `ObserveOnly`, `Unknown`, `skipped` ou `no-signal`.
- Sur Spotify-like/DRM flows, une capture d'onglet avec piste audio live (mediaDetected/mediaProcessed positifs, track live) et `captureSignalState=no-signal` reste désormais en observation de capture d'onglet au lieu d'activer systématiquement le `desktop-fallback-available` quand Chrome n'expose pas encore un RMS exploitable.
- Le bouton `Proteger l'onglet actif` revient a `media-html` par defaut, comme l'ancien projet stable, puis tente `tabCapture` generiquement si le signal HTML reste muet ou introuvable alors que l'onglet est audible. En mode autonome, c'est la derniere tentative de controle direct ; avec l'app connectee, le fallback Windows reste visible.
- Sur Spotify en `tab-capture-no-signal`, la couche d'activation enchaîne maintenant directement vers `media-html` quand un cooldown no-signal est actif (tab/domain), afin de stabiliser le statut visible et d'eviter le retour `tab-capture` sans progression. Le statut de capture tab est aussi nettoye avant fallback.
- Manifest Chromium monte a `0.1.29` pour que Brave/Chromium remplace clairement les installations testeur `0.1.28`.
- Outil historique `tools/package-release.js` aligne sur le suffixe `0.1.29` par defaut pour eviter de produire de nouveaux zips nommes `0.1.28`.
- Une machine d'etat navigateur partagee classe maintenant `media-html-starting`, `media-html-signal`, `media-html-no-signal`, `tab-capture-starting`, `tab-capture-signal`, `tab-capture-no-signal`, `observe-only` et `desktop-fallback-available` avant d'annoncer `BrowserGain` ou `ObserveOnly`.
- Le diagnostic separe maintenant le mode autonome du mode hybride : sans app desktop, la limite HTML reste dans `mediaHtmlFallbackReason`; avec l'app connectee, `fallbackRecommended` / `fallbackReason` indiquent le fallback Windows.

### Corrigé

- La popup garde maintenant l'etat visuel actif en observation tab-capture lorsque la source reste en transition (`no-signal` vers `waiting-for-audio`) suite à un `tabAudible=false` transitoire.
- Le statut visuel reste stable sur `tab-capture-no-signal` tant que la capture reste `live` et exploitée, même si un évènement `audible` repasse brièvement à `false` côté Chrome.
 - Verrou visuel popup renforcé sur Spotify/`tab-capture` : l'état observé reste verrouillé dès `audible=false` en l'absence de signal exploitable, puis repasse hors-ON seulement après 2 confirmations stables.
 - Anti-oscillation popup : passage visuel à off tab-capture en 2 checks consécutifs sur les transitions `audible=false` / `waiting-for-audio` / `starting` avant de se couper visuellement.
 - Un lecteur web deja detecte mais marque `processed` sans normalizer actif est maintenant retraite au lieu de rester bloque en `mediaDetected=1`, `mediaProcessed=0`.
- Le diagnostic popup expose maintenant `skippedAlreadyProcessed` pour identifier ce blocage sans masquer la limite derriere un fallback orange.
- En mode autonome, un fallback `media-html` muet ou sans media controlable peut maintenant declencher l'upgrade generique `tabCapture` si l'onglet est audible. Si `tabCapture` reste sans signal, l'extension revient a un etat `ObserveOnly` lisible.
- En mode autonome, une source HTML controlable utilise de nouveau le calcul de gain direct au lieu d'attendre une calibration `BrowserGain`, ce qui restaure le changement rapide de cible dB de l'ancien projet extension seule.
- Apres un echec `tabCapture`, le diagnostic ne range plus `tab-capture-no-signal` dans `mediaHtmlFallbackReason` : il expose `browserState=tab-capture-no-signal`, `captureFallbackReason=tab-capture-no-signal`, et garde une raison HTML separee comme `no-controllable-media-detected`.
- En mode autonome, la popup affiche maintenant une ligne `Limite media HTML` quand le diagnostic contient `mediaHtmlFallbackReason=no-media-element-detected`, au lieu de laisser croire que le diagnostic est vide.
- Quand le fallback HTML reste inutilisable apres un `tab-capture-no-signal`, le diagnostic conserve maintenant l'erreur HTML reelle si elle existe au lieu de la remplacer par un message generique.
- L'activation `Protéger cet onglet` réessaie maintenant le contact avec le content script après injection, puis affiche une erreur claire si l'onglet ne répond toujours pas au lieu de repasser silencieusement inactif.
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
- Une capture d'onglet qui reste `starting` sans nouveau callback audio est maintenant réévaluée par un watchdog court, puis signalée `tab-capture-no-signal` pour ne pas masquer le fallback desktop.
- Quand le fallback média HTML échoue après `tab-capture-no-signal`, la popup garde maintenant le bouton de protection actif en mode observation/fallback desktop au lieu de le repasser gris.
- Quand le fallback média HTML renvoie `mediaDetected > 0` mais `mediaProcessed = 0`, l'extension le considère maintenant comme non contrôlable et garde l'observation active au lieu de repasser visuellement inactif.
- Quand le fallback média HTML renvoie aussi `mediaDetected = 0` après une capture d'onglet sans signal, l'extension garde maintenant le fallback desktop actif et le bouton ne repasse plus gris.
- La popup reconnait aussi les champs diagnostic normalises `fallbackRecommended` / `fallbackReason`, pour eviter de repasser visuellement inactive alors que le fallback desktop est bien actif.
- La popup garde aussi le fallback desktop actif sur les domaines prioritaires `tabCapture` quand `media-html` est actif avec `mediaDetected = 0` et `mediaProcessed = 0`, meme si la raison fallback arrive avec retard.
- En mode autonome, une source `tab-capture-no-signal` reste maintenant visuellement active en observation/fallback meme si l'app desktop est fermee, au lieu de donner l'impression que le bouton s'est eteint tout seul.
- En mode `tab-capture`, la fusion des statuts ne surcharge plus `tabAudible` avec la valeur brute de l’onglet quand une capture est active : un `audible=false` isolé ne provoque plus un basculement visuel instantané tant que le signal n’est pas confirmé.
- En mode Spotify, un `message` de capture reçu avec `enabled:false` en cours d’écoute (`live`, `mediaDetected>0`, `audioTrackCount>0`) n’éteint plus la protection tant qu’il n’y a pas d’arrêt explicite (`user-stop`, `manual-stop`, `site-excluded`) ou fin réelle de piste.
- Une source `media-html` active qui traite un lecteur mais reste sans signal RMS exploitable passe maintenant en `fallbackReason=media-html-no-usable-signal` apres une courte observation, au lieu d'afficher un `BrowserGain` actif dont la cible dB semble non appliquee.
- En mode autonome, une page protegee qui revient en `sourceType=media-html`, `mediaDetected=0` et `mediaProcessed=0` garde `enabled=true` et `mediaHtmlFallbackReason=no-media-element-detected`, puis peut tenter `tabCapture` si l'onglet est audible.
- Quand `media-html` ne detecte aucun media apres la courte phase de detection, le content script republie maintenant un statut de fallback au background. Si l'onglet est audible, cela peut declencher l'upgrade generique `tabCapture` au lieu d'attendre uniquement une copie de diagnostic.
- En mode media-html, la raison `safety-attenuation` ne force plus `media-html-no-signal` : la source garde `BrowserGain` quand un signal et `mediaDetected/mediaProcessed` sont bons, et le control redevient visible.
- Les diagnostics `media-html` conservent maintenant `tabAudible` et `tabActive` depuis l'onglet Chromium, pour eviter les faux rapports orange difficiles a interpreter.
- Le refresh des reglages et les changements de cible dB ne coupent plus un onglet deja protege : seul un arret utilisateur explicite ou une exclusion remet `enabled=false`.
- L'upgrade generique `media-html` vers `tabCapture` ne desactive plus le fallback HTML avant que la capture d'onglet ait vraiment demarre, afin d'eviter les diagnostics `tabAudible=true` mais `enabled=false`.
- La popup affiche maintenant `Controle via Windows` / `Windows control` comme etat principal quand une source reste observable mais depend du fallback desktop, et garde `Source incompatible` pour les vrais cas sans fallback exploitable.
- Le bouton Options `Appliquer les reglages` ignore maintenant les onglets non joignables par l'extension pendant le rafraichissement global, afin qu'une cible dB sauvegardee ne soit plus affichee `Non applique` a cause d'un onglet interne ou non injectable.
- Le diagnostic popup retrouve maintenant l'onglet actif via la derniere fenetre navigateur focalisee si `currentWindow` ne donne pas de page normale, afin d'eviter `site=""` et `sourceType=unknown` alors que Spotify/YouTube est ouvert.
- Le diagnostic popup transmet maintenant l'ID exact de l'onglet actif au background et evite les clics multiples sur `Copier diagnostic`.
- `Copier diagnostic` copie maintenant immediatement l'etat local deja affiche, sans attendre un rafraichissement force ni le health check desktop, afin d'eviter les erreurs de presse-papiers apres un delai trop long.
- Les appels bridge local (`/health`, `/global-target`, `/browser-source`, `/extension-log`) ont maintenant un timeout court quand l'app desktop est fermee.
- L'export diagnostic Options peut maintenant selectionner un onglet media deja observe au lieu de diagnostiquer la page Options elle-meme, ce qui evitait `site=""`, `sourceType=unknown` et des conclusions fausses sur la cible dB.
- Le background recupere maintenant le domaine depuis le content script quand Chromium ne fournit pas `tab.url`, afin que Spotify/YouTube/TikTok ne tombent plus en `site=""` avant meme le choix du mode de controle.
- Le diagnostic popup ne retourne plus un statut vide juste parce qu'un `tabId` est fourni : il tente d'abord de recuperer le site via le content script.
- Une capture d'onglet `no-signal` est maintenant arretee avant de publier le fallback `media-html` / desktop, afin d'eviter de garder un chemin `tab-capture live` stale qui peut provoquer des gresillements ou des diagnostics instables.
- Le fallback `Controle via Windows` n'est plus declenche immediatement quand `media-html` vient juste d'etre active avec `mediaDetected=0` : l'extension laisse d'abord une courte phase de detection, puis applique `BrowserGain` si un media controlable apparait.
- Le toggle popup affiche maintenant l'etat de protection de l'onglet courant, pas uniquement le reglage global de l'extension, afin d'eviter le faux off/on a la reouverture.
- Le toggle popup reste maintenant visuellement actif quand l'extension est globalement active mais que le statut d'onglet est encore `unknown` ou `active-tab-empty`.
- L'export diagnostic popup ajoute `globalEnabled`, `visualEnabled`, `popupTabIdKnown`, `statusRoute`, `diagnosticReason` et `statusError` pour identifier la couche qui perd le site actif sans exposer l'URL ni le titre de page.
- Le service worker background ne declare plus son listener `runtime.onMessage` en `async`, afin que Chromium garde correctement le canal `sendResponse` ouvert. Cela evite les reponses vides qui faisaient afficher `statusOk=true` sans site dans la popup et `Non applique` dans Options.
- La popup traite maintenant une reponse runtime vide comme une erreur `runtime-empty-response` au lieu de la transformer en faux succes.
- La popup force maintenant un nouveau check local `/health` a l'ouverture, apres `Proteger l'onglet actif` et avant `Copier diagnostic`, afin que `Mode autonome` / `App connectee` se mette a jour plus vite.
- L'export diagnostic Options inclut maintenant `desktopBridge` et indique `standalone-media-html-unavailable` quand une source web n'est pas controlable en mode extension seule, sans afficher un fallback Windows tant que l'app desktop est fermee.
- Quand le mode `media-html` est activé mais ne trouve aucun média contrôlable, par exemple Spotify Web selon le navigateur, l'extension annonce maintenant `ObserveOnly` avec une raison claire (`no-media-element-detected` ou `no-controllable-media-detected`).
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
- Ajout d'un plan de test plateformes réelles interne.
- Ajout de `tools/package-release.js` pour générer les zips publics sans refaire les commandes PowerShell à la main.
- Profils par plateforme clarifiés dans les options avec badge recommandé/personnalisé et sélection plus explicite.
- Plage du `Volume moyen voulu` ajustée de `-48 dB` à `-15 dB` et champ de saisie clavier déplacé dans le bloc du slider.
- Logo de la page de test aligné sur l'icône PNG officielle de l'extension pour garantir son affichage dans les builds distribués.
- Ajout d'une checklist maintenance interne pour figer le contrat audio validé, les commandes de vérification et les règles de reprise.
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
