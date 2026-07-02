# Cahier Des Charges V1 - Couche Desktop

Date : 2026-06-30
Statut : cadrage initial repris dans la base hybride
Dossier produit : `D:\Codex\StreamVolume Guard Hybride`
Note 2026-07-02 : ce document reste le cadrage de la couche desktop. L'etat courant du produit hybride et du bridge local est suivi dans `docs/hybrid-architecture.md`, `docs/product-next-plan.md` et `docs/tester-checklist.md`.

## Décision Produit

La couche desktop de StreamVolume Guard Hub est une application Windows locale pensée comme un mélangeur de volume Windows intelligent pour streamers.

La V1 doit afficher les applications qui produisent du son, permettre de garder la main sur leur volume, et ajouter une normalisation automatique équilibrée mais prudente : corriger les sources trop fortes ou trop faibles sans effet de pompage agressif.

La base actuelle est hybride : le desktop reste un module separe techniquement dans `apps/desktop`, mais il fait partie du meme produit que `apps/browser-extension` et `packages/protocol`. La promesse globale est documentee dans `docs/hybrid-architecture.md`.


## Position Dans Le Produit Hybride

Ce document cadre la couche desktop. Il ne remplace pas la vision hybride globale.

- Desktop : sessions audio Windows, volume par application, Panic, exclusions, logs locaux.
- Extension : sous-sources navigateur, gain web quand possible, observation des sources non controlables.
- Protocole : contrat commun `origin`, `controlSurface`, `status`, `isControllable`.
- Bridge local actuel : lien `127.0.0.1` entre extension et desktop, durci en version testable avec limites de requete, Origin allowlist et token local optionnel.

## Fondation Globale Audio Windows

La V1 ne doit pas fonctionner avec des patchs ciblés par application.

La solution globale retenue est de s'appuyer sur l'architecture audio Windows : périphériques de sortie, sessions audio WASAPI/Core Audio et volumes de session. L'app doit découvrir dynamiquement les sessions audio exposées par Windows, quel que soit le programme qui les crée.

Chrome, Spotify, Discord, VLC ou un jeu ne sont donc pas des cas spéciaux codés en dur. Ce sont seulement des exemples d'applications que Windows peut exposer comme sessions audio.

La couverture visée est :

- scanner le périphérique de sortie par défaut ;
- préparer la prise en charge de plusieurs périphériques de sortie actifs ;
- lister toutes les sessions audio disponibles sur ces périphériques ;
- regrouper les sessions par processus ou application quand Windows fournit assez d'information ;
- contrôler le volume de session via l'API Windows quand c'est possible ;
- afficher clairement les sessions inconnues, système, exclusives ou non contrôlables ;
- éviter toute règle du type `si Chrome alors...` ou `si Spotify alors...` dans le moteur.

Limite importante : sans driver audio, périphérique virtuel ou traitement sample par sample, l'app ne peut pas garantir un contrôle parfait de chaque son final qui sort physiquement du PC. Elle peut en revanche couvrir globalement les sessions audio Windows partagées, ce qui correspond au meilleur ratio impact / risque pour une V1 locale et simple à installer.

Pour les sons non exposés ou non contrôlables, la V1 doit les signaler au lieu de faire semblant de les normaliser. Un mode de secours global sur le volume du périphérique pourra être étudié plus tard, mais il ne doit pas remplacer le contrôle par session dans la V1.

## Objectif

Aider les streamers à garder un volume stable entre les sources audio du PC : navigateur, TikTok web, YouTube, Spotify, Deezer, jeux, Discord, VLC, alertes et autres applications Windows.

Le produit doit résoudre un problème concret de live : éviter qu'une application parte beaucoup plus fort qu'une autre, tout en restant simple à comprendre et à désactiver.

## Promesse V1

Pour la couche desktop : réduire les gros écarts de volume entre applications Windows exposées comme sessions audio, sans driver audio maison, sans compte, sans tracker, sans collecte de données et sans installation complexe.

La promesse n'est pas un mastering studio parfait. La promesse desktop V1 est un controle automatique raisonnable du volume par application dans le mixeur Windows. La separation fine des onglets et sites web releve de la couche navigateur et du bridge local hybride.

## Utilisateurs Visés

- Streamers qui utilisent plusieurs sources audio pendant un live.
- Créateurs qui lancent musique, vidéos, Discord, jeux et navigateur en même temps.
- Testeurs non techniques qui veulent comprendre immédiatement si l'app protège leur mix.
- Utilisateurs avancés qui veulent garder la main par application quand l'automatique ne convient pas.

## Expérience Produit Cible

L'interface doit ressembler à un mélangeur de volume Windows augmenté.

Chaque application audio active apparaît sur une ligne avec :

- nom de l'application ;
- icône ou nom de processus quand disponible ;
- état audio ;
- niveau approximatif ou activité détectée ;
- volume Windows actuel de la session ;
- action automatique en cours ;
- contrôle manuel ;
- bouton d'exclusion.

L'utilisateur doit comprendre en quelques secondes :

- quelles applications produisent du son ;
- lesquelles sont trop fortes ou trop faibles ;
- lesquelles sont corrigées automatiquement ;
- lesquelles sont exclues ;
- comment reprendre la main.

## États Affichés

La V1 doit utiliser des états simples :

- `Safe` : volume stable ou proche de la cible ;
- `Risky` : source trop forte ou pic important détecté ;
- `Low` : source trop faible et correction douce possible ;
- `Muted` : session muette ou volume nul ;
- `Excluded` : application ignorée volontairement ;
- `Unknown` : niveau non disponible ou session trop récente.

Ces états doivent rester lisibles pour un testeur non technique.

## Fonctionnement V1

1. L'app scanne les sessions audio Windows actives.
2. Elle liste les applications qui produisent ou peuvent produire du son.
3. Elle lit l'activité audio et, quand possible, un niveau approximatif par session.
4. Elle compare chaque source à une cible de volume.
5. Elle calibre ponctuellement le volume Windows par application en `Auto actif`.
6. Elle verrouille ensuite la source active pour éviter le pompage audible.
7. Elle affiche l'état de chaque source.
8. Elle permet d'exclure une application.
9. Elle conserve les réglages localement.
10. Elle écrit des logs locaux lisibles pour le debug.

## Mode Automatique Par Défaut

La décision validée est : normalisation équilibrée.

Le comportement par défaut doit :

- baisser assez vite une source trop forte ;
- remonter doucement une source trop faible ;
- éviter les corrections brutales ;
- ne jamais couper le son sans action explicite ;
- respecter les exclusions ;
- laisser l'utilisateur corriger manuellement une application ;
- ne pas combattre immédiatement une action manuelle récente.

Pour la version testable actuelle, `Auto actif` applique une calibration ponctuelle par source active, puis verrouille cette source pour eviter de bouger le volume en boucle pendant la meme lecture. Le verrou se rearme apres silence durable ou disparition de la session.

Une future variante prudente pourra limiter l'automatique à l'anti-pics, mais ce n'est pas le comportement principal de la V1.

## Contrôle Manuel

L'utilisateur doit toujours garder la main.

Pour chaque application, la V1 doit prévoir :

- un volume Windows par app modifiable ;
- un indicateur indiquant si l'auto agit ;
- une option pour exclure l'application ;
- une option pour réinclure l'application ;
- une pause temporaire de l'auto si l'utilisateur ajuste manuellement une source.

Le produit ne doit jamais donner l'impression de voler le contrôle du mix.

## Bouton Panic

La V1 doit inclure un bouton Panic global.

Comportement attendu :

- baisser rapidement les sources surveillées ;
- ne pas modifier les applications exclues ;
- ne pas couper définitivement le son ;
- afficher clairement que Panic est actif ;
- permettre un retour progressif ou manuel.

Le Panic est une protection de live, pas une fonction de mixage avancée.

## Calibration OBS Simple

La calibration OBS doit exister, mais ne doit pas devenir l'écran principal de la V1.

Elle doit aider à choisir une cible adaptée au live :

- consigne simple pour observer le vumètre OBS ;
- recommandation de niveau cible ;
- rappel de garder la voix du streamer comme référence ;
- possibilité d'ajuster la cible globale ;
- aucun vocabulaire audio expert obligatoire.

L'objectif est d'aider un streamer à ne pas envoyer le mix dans le rouge, sans transformer l'app en outil OBS complet.

## Périmètre V1

Inclus :

- Windows uniquement ;
- app locale ;
- interface Windows minimale mais utilisable ;
- détection globale des sessions audio Windows actives ;
- liste dynamique des applications et sessions audio exposées par Windows ;
- mesure approximative du niveau ou de l'activité quand disponible ;
- ajustement du volume Windows par session ou application, sans logique ciblée par programme ;
- profil Stream par défaut ;
- normalisation automatique équilibrée ;
- contrôle manuel par application ;
- bouton Panic ;
- exclusions d'applications ;
- réglage du volume cible ;
- calibration OBS simple ;
- configuration locale JSON ;
- logs locaux lisibles ;
- aucune télémétrie.

Hors périmètre V1 :

- driver audio maison ;
- périphérique audio virtuel ;
- traitement audio sample par sample ;
- vrai compresseur global studio ;
- plugin OBS ;
- synchronisation cloud ;
- compte utilisateur ;
- télémétrie ;
- collecte d'audio ;
- support macOS ou Linux ;
- marketplace ou système premium intégré.

## Architecture Recommandée

Chemin d'implémentation : `D:\Codex\StreamVolume Guard Hybride\apps\desktop\`

Stack recommandée :

- C# .NET 8 ;
- application Windows locale ;
- NAudio pour interagir avec les périphériques de sortie, sessions WASAPI/Core Audio et volumes de session Windows ;
- configuration JSON locale ;
- logs locaux texte ou JSONL ;
- séparation stricte entre moteur audio, décision de normalisation et interface.

Modules proposés :

- `AudioEndpointMonitor` : détecte les périphériques de sortie Windows et le périphérique par défaut ;
- `AudioSessionMonitor` : détecte toutes les sessions audio exposées par Windows, leur état et leur volume, sans liste d'applications codée en dur ;
- `VolumeNormalizer` : décide quand baisser ou remonter une application ;
- `ManualOverrideService` : gère les actions manuelles et évite que l'auto les annule trop vite ;
- `PanicService` : applique la baisse rapide globale ;
- `AppConfigStore` : lit et écrit la config locale ;
- `LocalLogger` : écrit les événements utiles au debug ;
- `MainWindow` : interface façon mélangeur Windows intelligent.

## Règles De Normalisation

La V1 doit privilégier la stabilité perçue.

Règles de base :

- seuil haut : si une app dépasse durablement la zone cible, appliquer une baisse ponctuelle ;
- seuil bas : si une app reste faible, appliquer une remontée douce ponctuelle ;
- verrou one-shot : éviter d'alterner baisse/remontée pendant la même lecture ;
- cooldown manuel : ne pas corriger immédiatement après une action utilisateur ;
- plafond de boost : ne pas remonter trop fort une source faible ;
- plancher de réduction : ne pas rendre une app inaudible sans Panic ;
- rampe douce : tout changement automatique doit être progressif.

Le produit doit éviter le comportement agressif qui aligne tout trop vite.

## Configuration Locale

La config V1 doit rester lisible et portable.

Exemples de données :

- volume cible global ;
- profil actif ;
- applications exclues ;
- réglages manuels par application ;
- intensité de la normalisation ;
- comportement Panic ;
- préférences d'affichage ;
- date de dernière calibration OBS.

Aucune donnée ne doit être envoyée automatiquement.

## Logs Locaux

Les logs doivent aider à comprendre un problème sans collecter de données sensibles.

Ils peuvent contenir :

- démarrage et arrêt de l'app ;
- sessions audio détectées ;
- changement de statut ;
- correction automatique appliquée ;
- action Panic ;
- exclusion ou réinclusion ;
- erreurs techniques NAudio ou Windows.

Ils ne doivent pas contenir :

- audio brut ;
- historique de navigation ;
- contenu écouté ;
- identifiants personnels ;
- envoi réseau automatique.

## Sécurité Et Confidentialité

Principes non négociables :

- traitement local ;
- pas de compte ;
- pas de tracker ;
- pas de télémétrie automatique ;
- pas de capture ou stockage audio ;
- logs locaux supprimables ;
- code lisible ;
- permissions Windows minimales.

La confiance est un avantage concurrentiel du produit.

## Avantages Concurrentiels

- Plus simple qu'un setup audio virtuel complet.
- Plus clair qu'un compresseur OBS mal compris.
- Complementaire de l'extension navigateur : couvre les apps PC pendant que l'extension couvre les sous-sources web.
- Pensé streamer dès la V1 : Panic, OBS, lisibilité live.
- Local-first, sans compte et sans collecte.
- Familiarité du mélangeur Windows, avec automatisation utile.

## Monétisation Potentielle Plus Tard

La V1 doit rester simple et fiable. Les pistes premium ne doivent pas affaiblir la confiance.

Pistes futures possibles :

- profils avancés par jeu ou application ;
- presets streamer exportables ;
- historique local plus détaillé ;
- raccourcis clavier avancés ;
- durcissement du bridge local avec l'extension navigateur ;
- intégration optionnelle OBS ;
- thème ou mode studio avancé ;
- règles automatiques par scène de live.

Les fonctions de sécurité de base, exclusions, Panic et contrôle manuel ne doivent pas être paywallées dans l'esprit produit actuel.

## Risques Techniques

- Certaines applications exposent peu ou mal leur niveau audio.
- Le volume par session Windows peut ne pas correspondre au niveau perçu.
- Les sessions peuvent apparaître, disparaître ou changer de processus.
- Les jeux et apps protégées peuvent avoir des comportements spécifiques.
- Les sons en mode exclusif, système ou non exposés comme session contrôlable peuvent échapper au contrôle par session sans driver ou périphérique virtuel.
- Les corrections trop rapides peuvent créer du pompage audible.
- OBS peut capturer l'audio avant ou après certains traitements selon la configuration.
- Les permissions et APIs audio Windows peuvent varier selon versions et périphériques.

## Risques Produit

- Promettre un résultat trop proche d'un vrai traitement studio.
- Faire une interface trop technique.
- Corriger trop agressivement et perdre la confiance utilisateur.
- Sous-estimer la diversité des setups OBS.
- Fusionner trop tôt extension navigateur, app desktop et plugin OBS au lieu de garder des couches séparées par protocole.

## Critères De Validation V1

La V1 est validée si :

- l'app voit les sessions audio Windows disponibles, sans dépendre d'une liste codée Chrome/Spotify/Discord ;
- elle affiche une liste compréhensible des applications, sessions inconnues et sessions non contrôlables ;
- elle peut baisser une app trop forte ;
- elle peut remonter ponctuellement une app trop faible ;
- elle ne coupe pas le son sans demande explicite ;
- elle ne fait pas grésiller ;
- elle évite les variations rapides audibles ;
- le bouton Panic baisse rapidement les sources surveillées ;
- les exclusions sont respectées ;
- les réglages persistent localement ;
- un testeur non technique comprend l'état général ;
- les logs locaux suffisent à diagnostiquer un comportement étrange.

## Plan De Livraison Recommandé

1. Documenter le cahier des charges V1.
2. Valider explicitement le périmètre.
3. Créer le squelette `apps/desktop/` en .NET 8.
4. Implémenter la détection des sessions audio.
5. Afficher le mélangeur intelligent minimal.
6. Ajouter le contrôle manuel par app.
7. Ajouter la normalisation équilibrée.
8. Ajouter exclusions, Panic, config locale et logs.
9. Tester sur Chrome, Spotify/Deezer, Discord, VLC et un jeu si disponible.
10. Préparer une checklist testeur non technique.

## Décision Finale V1

La direction validee pour la couche desktop est : Windows sans driver, normalisation equilibree par volume d'application, interface type melangeur Windows intelligent, pensee streamer, simple a tester, avec controle manuel conserve. Dans le produit hybride, cette couche coopere avec l'extension navigateur via le protocole et le bridge local.






