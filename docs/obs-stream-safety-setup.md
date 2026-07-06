# OBS Stream Safety Setup

StreamVolume Guard Hub n'est pas un compresseur studio global. Le Hub sert a voir, organiser, classifier et calibrer les sources disponibles sur le PC : sessions Windows, sous-sources navigateur quand l'extension peut les exposer, sources `ObserveOnly` ou `Unknown` quand le controle direct n'est pas possible.

OBS est la couche de securite finale du stream. C'est dans OBS que l'on peut appliquer un traitement audio reel avec `Compressor` et `Limiter` sur les sources capturees.

## Quand Utiliser Le Hub

Utiliser StreamVolume Guard Hub pour :

- voir les applications qui produisent du son ;
- distinguer `WindowsSessionVolume`, `BrowserGain`, `ObserveOnly` et `Unknown` ;
- lire le dashboard `Couverture` pour savoir si une source est en `Direct`, `Fallback Windows`, `Action requise`, `Limite` ou `Inconnu` ;
- appliquer les profils `Calme`, `Standard` et `Fort` ;
- corriger le volume Windows par application quand c'est possible ;
- utiliser l'extension navigateur pour calibrer une sous-source web quand le site/navigateur le permet ;
- garder des logs locaux lisibles pendant les tests.

## Quand Utiliser OBS

Utiliser OBS pour :

- securiser le son final entendu par le stream ;
- limiter les pics internes d'une video, d'un jeu ou d'une app ;
- compresser une source qui a de gros ecarts de niveau ;
- separer les sources du stream quand OBS peut les capturer par application.

Le Hub peut reduire l'ecart global entre sources. OBS doit proteger le signal final contre les pics.

## Configuration Recommandee

1. Ouvrir OBS.
2. Ajouter une source `Application Audio Capture` pour le navigateur principal quand OBS le permet.
3. Ajouter une source `Application Audio Capture` pour Discord, Spotify desktop, VLC ou le jeu quand OBS le permet.
4. Si les apps sont capturees separement, desactiver `Desktop Audio` global dans OBS pour eviter les doublons et l'echo.
5. Ajouter `Compressor` sur les sources a risque.
6. Ajouter `Limiter` en dernier filtre de chaque source ou de la chaine pertinente.
7. Tester avec du contenu reel, pas seulement avec une video calme.

## Reglages De Depart

Ces valeurs sont des points de depart, pas des promesses universelles.

Compressor :

- Ratio : 4:1 a 10:1 selon la source ;
- Threshold : environ -18 dB a -12 dB ;
- Attack : 5 a 10 ms ;
- Release : 80 a 250 ms ;
- Output Gain : 0 dB au depart.

Limiter :

- Threshold : -6 dB ou -3 dB ;
- Release : 60 a 100 ms ;
- placer le Limiter en dernier filtre.

## Test Manuel

Tester dans cet ordre :

1. YouTube seul.
2. TikTok seul.
3. Spotify Web ou Deezer Web seul.
4. Discord seul.
5. VLC, Spotify desktop ou jeu seul.
6. Navigateur + app Windows.
7. Deux sources simultanees.

Pour chaque test :

- regarder les meters OBS ;
- verifier que le signal ne clippe pas ;
- verifier que le Limiter agit en dernier ;
- garder StreamVolume Guard Hub ouvert pour comparer la classification et les logs ;
- copier les logs Hub si le comportement semble incoherent.

## Limites Honnetes

- StreamVolume Guard Hub ne lit pas encore automatiquement les scenes OBS.
- StreamVolume Guard Hub ne lit pas encore les meters internes OBS.
- Certaines apps peuvent ne pas etre compatibles avec `Application Audio Capture`.
- Si une app ne peut pas etre capturee proprement par OBS, un cable audio virtuel peut etre necessaire plus tard.
- L'extension navigateur reste separee : OBS ne l'installe pas et le Microsoft Store ne l'installera pas automatiquement.
- Le Hub ne doit pas masquer une source non controlable : elle doit rester `ObserveOnly`, `Unknown` ou documentee comme limite.

## References OBS

- Application Audio Capture : https://obsproject.com/kb/application-audio-capture-guide
- Compressor Filter : https://obsproject.com/kb/compressor-filter
- Limiter Filter : https://obsproject.com/kb/limiter-filter
- VST 2.x Plugin Filter : https://obsproject.com/kb/vst-2-x-plugin-filter

## Suite Possible

Si cette configuration est trop manuelle pour les testeurs, la suite logique sera d'etudier un plugin OBS. Le VST reste une piste plus tardive, car OBS supporte surtout VST 2.x avec des limites de compatibilite et de stabilite.
