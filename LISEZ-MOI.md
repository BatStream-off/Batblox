# 🦇 Batblox — application Windows

Une seule application, entièrement en français, qui remplace le lanceur et l'ancienne extension navigateur :
lanceur Roblox, amis, profils suivis, historique, statistiques et présence, notifications Windows / Discord / ntfy,
comptes multiples, personnalisation, maintenance, Discord Rich Presence et zone de notification.

## Lancer
- **Essai rapide** : installe [Node.js](https://nodejs.org) (version 20 ou plus), puis double-clique sur `lancer-batblox.bat`.
- **Installeur et version portable** : double-clique sur `construire-installeur.bat` (à faire sous Windows).
  Les fichiers sont créés dans le dossier `dist`.
- Les tests de la logique interne : `npm test`.

## Premier démarrage
1. Va dans **Comptes** (ou clique sur « Ajouter un compte » en haut à droite) et connecte-toi : une fenêtre Roblox s'ouvre.
   Batblox ne voit jamais ton mot de passe.
2. Les changements sont détectés à partir de la **deuxième** vérification (la première sert de point de départ).
3. Pour reprendre tes données de l'ancienne extension : **Réglages → Données → Importer** et choisis son fichier de sauvegarde.

## Sécurité
- La session Roblox de chaque compte est chiffrée par Windows (DPAPI, via Electron `safeStorage`). Seul le texte chiffré est écrit sur le disque.
- Les sessions ne sont jamais affichées, exportées, journalisées, ni envoyées à Discord ou ntfy.
  Les exports ne contiennent ni session, ni adresse de webhook, ni sujet ntfy.
- Les sessions sont gardées uniquement en mémoire par fenêtre de session ; la fenêtre de connexion est effacée après usage.
- L'interface est isolée du système (pas d'accès Node, politique de contenu stricte, une seule passerelle contrôlée).

## Données
Dossier de l'application : `%APPDATA%\Batblox` (réglages, comptes chiffrés, historique, statistiques, journaux).
Chaque fichier contient `schemaVersion` pour permettre les futures migrations.

## Ce qu'il faut savoir
| Sujet | Précision |
|---|---|
| Multi-instance Roblox | **Non implémenté volontairement** : contourner la limite d'une instance expose les comptes à des sanctions. Batblox liste, ferme et lance les instances. |
| Lancer un jeu / rejoindre un ami | Utilise le ticket d'authentification et le lien de lancement officiels de Roblox, avec le compte actif. « Rejoindre » ne fonctionne que si Roblox partage le serveur de la personne. |
| Statut en ligne | Exige une session valide. Pour les joueurs qui ne sont pas tes amis, Roblox masque souvent l'activité. |
| Personnalisation | Remplace des fichiers locaux de Roblox (son `ouch.ogg`, polices, curseurs) après sauvegarde, restaurables. Roblox ne prend pas cela officiellement en charge. Une mise à jour de Roblox remet les fichiers d'origine : Batblox peut les réappliquer. |
| Intégrité | Vérifie réellement l'installation (exécutable, dossiers, certificats, version officielle). Ce n'est pas une comparaison fichier par fichier avec des empreintes officielles ; « Réparer » restaure les fichiers personnalisés puis relance l'installeur officiel de Roblox. |
| Lanceur utilisé | Dans **Roblox → Lanceur utilisé** : Automatique (Windows décide), Roblox officiel, Bloxstrap, Fishstrap, Voidstrap (détectés dans `%LOCALAPPDATA%`) ou un `.exe` personnalisé. Batblox lui passe le lien de lancement officiel. Non testé sous Windows. |
| Rich Presence | Nécessite l'identifiant d'une application créée sur discord.com/developers. |
| Bouton « Suivre » sur roblox.com | N'existe plus (il dépendait du navigateur) : on ajoute un profil par pseudo ou identifiant dans **Profils suivis**. |
| Messages (chat Roblox) | Page **Messages** (menu de gauche) : conversations du compte actif, privées et de groupe, avec lecture de l'historique et réponse directe (Entrée pour envoyer, Maj+Entrée pour un retour à la ligne). Pastille de non-lus dans le menu ; rafraîchissement automatique tant que la page est ouverte (jamais fenêtre cachée). Roblox a supprimé en 2024 la boîte de réception « messages privés » entre joueurs : seul le chat est branché. |

## Intro vidéo de lancement

Au tout premier affichage de la fenêtre, une vidéo d'intro (`src/assets/intro/intro.mp4`, H.264 1080p, son d'origine) se joue seule, en plein cadre, sans contrôles et une seule fois, avec l'interface masquée dessous. À la fin, elle se dissout en fondu enchaîné sur l'écran principal déjà prêt.

- Pas d'intro en démarrage réduit (`--cache` + « démarrer réduit »), ni quand la fenêtre est rouverte depuis la zone de notification.
- Si la vidéo est absente ou illisible, l'application s'ouvre normalement (aucun blocage).
- Pour changer la vidéo : remplacer `src/assets/intro/intro.mp4` (H.264 + AAC, `-movflags +faststart` conseillé). Réglages de durée dans `src/renderer/intro.js`.
- Code : `src/renderer/intro.js`, calque `#intro` dans `index.html`, fenêtre dans `src/main/main.js` (`autoplayPolicy`, couleur de fond bleue de la vidéo).

## Nouveautés de la version 1.5.7
**Thème Batman : interface et confort d'utilisation**
- Finitions UI / UX : panneaux en verre fumé avec reflet et liseré doré qui s'estompe, navigation qui réagit au survol (glissement, icône dorée, appui), boutons plus lisibles (relief discret, reflet sur le bouton principal, état désactivé explicite), champs enfoncés avec survol doré, barres de défilement fines, bulles d'amis qui s'illuminent au survol, fenêtres / menus / notifications plus nets (fond assombri et flouté, liseré doré), entrée des pages en cascade. Mise en page, couleurs de base et structure inchangées ; les animations suivent « Animations », le mode potato et « mouvement réduit ».
**Fenêtre**
- Barre de titre Windows remplacée par une barre de titre personnalisée intégrée à l'application (réduire, agrandir / restaurer, fermer ; glisser pour déplacer, double-clic pour agrandir). Elle se fond dans le décor (dégradé translucide, logo, titre teinté de l'accent du thème, coins arrondis comme la fenêtre Windows 11), s'atténue quand la fenêtre n'a plus le focus, et « Fermer » respecte toujours l'option de réduction dans la zone de notification.

## Nouveautés de la version 1.5.6
**Thème Batman**
- Éclairs refaits : de vrais éclairs d'orage (tracé irrégulier et ramifié, unique à chaque fois, cœur blanc et halo bleuté) frappent au loin derrière les toits de Gotham. Chaque éclair éclaire brièvement le ciel, les nuages, la pluie et les toits, avec parfois un second flash quelques instants plus tard. Ils restent derrière l'interface, peuvent être activés ou désactivés dans **Réglages › Apparence › Éclairs** (thème Batman uniquement), suivent l'interrupteur **Effets** et disparaissent en mode économe, si les animations sont coupées ou si le système demande moins de mouvement.

- Ville de Gotham entièrement refaite (fond du thème Batman) : skyline dense en trois plans (lointain bleuté et flou, intermédiaire, proche très sombre) séparés par de la brume, avec gratte-ciels Art déco, immeubles résidentiels, toits industriels, antennes, cheminées, réservoirs, pylône radio, grue, gazomètre, cathédrale gothique, tour de l'horloge et grande tour monolithique. Fenêtres chaudes irrégulières d'intensités variées (certaines éteintes), enseignes très discrètes, feux rouges d'antenne, reflets de lumière dans la pluie. Même position, même hauteur, même rôle de décor : l'interface, la pluie et les autres effets sont inchangés. Les éclairs éclairent aussi les toits grâce à une silhouette dédiée (`gotham-skyline-lit.svg`).

## Nouveautés de la version 1.5.4
**Thème Batman**
- La carte « bat-signal » de la barre latérale (au-dessus de Réglages) est retirée en grande fenêtre ; Réglages reste en bas du menu.
- Le grand bat-signal du fond est 20 % moins lumineux.
- La tache lumineuse du bat-signal (celle qui entoure le logo) est encore 28 % moins lumineuse (−20 % puis −10 %).

## Nouveautés de la version 1.5.3 (corrections)
**Bugs corrigés**
- Le mot « null » ne s'affiche plus (page Roblox, statistiques d'une personne). Un test automatique surveille ce piège.
- Messages : le panneau de droite indique « Choisis une conversation… » une fois la liste chargée.
- Initiales des avatars et des jeux : accents et emojis gérés (« Équipe » → É ; « [🎃 …] Adopt Me! » → H).
- Personnalisation : le bouton **Réappliquer** réactive un son, une police ou des curseurs déjà importés, sans devoir les réimporter après « Désactiver » ou une mise à jour de Roblox.
- Réglages : un champ numérique affiche la valeur réellement retenue (ex. 5 s → 15 s) ; ntfy signale un sujet refusé.
- Profils suivis : plus de cartes en double ; interrupteurs sans `<label>` imbriqués.
- Fenêtres et menus : « Changer de compte » se ferme proprement ; Échap ne ferme que la fenêtre du dessus ; le menu ⋮ se retourne près du bas de l'écran.
- Accueil : la rangée d'amis garde sa position de défilement à chaque vérification.
- Amis : tri « dernière activité » (connectés d'abord), tri tolérant aux statuts inconnus, avis « amis inactifs » unique.
- Zone de notification : « Lancer Roblox » lance réellement Roblox. Le fond de la fenêtre suit le thème (plus de flash sombre avec un thème clair).
- Miniatures d'avatars : un échec de chargement n'est mémorisé que 2 minutes (au lieu d'une heure). Studio s'affiche comme « Dans Studio » dans Profils suivis.

**Cohérence graphique**
- Pastilles de statut identiques partout, comme sur Roblox : **gris** hors ligne, **bleu** en ligne, **vert** en jeu (la liste d'amis, la carte Roblox et les statistiques affichaient l'inverse de l'accueil).
- Mon profil : grands nombres abrégés (1 234 567 → « 1,23 M », valeur exacte en infobulle) ; tuiles et onglets sans débordement, y compris à 900 px de large.
- Découvrir : recherche et « Actualiser » sur la ligne du titre. Comptes : les boutons passent sous le nom au lieu de l'écraser. Batman : « Rejoindre » reste dans sa bulle.
- Décimales à la française (« 700,0 Mo »). Titre « Intégrité » sans emoji isolé.

**Vérification de cette version** : 70 tests automatiques, plus un balayage de toutes les pages dans 6 thèmes (1180×780 et 900×600) avec des données simulées dans Chromium. Ce n'est pas un test dans Electron sous Windows : voir ci-dessous.

## Limites de ce que j'ai pu vérifier
La logique interne est couverte par des tests automatiques et l'interface a été affichée et parcourue dans l'application réelle.
**Je n'ai pas pu tester sous Windows** avec de vrais comptes Roblox : la connexion, le lancement du client, la lecture des
processus et la personnalisation des fichiers de Roblox sont écrits d'après le fonctionnement connu de Roblox et sont à valider sur ton PC.
Si quelque chose ne fonctionne pas, le journal (Maintenance → Journaux) indique la cause.
| Découvrir | Page façon Roblox : recherche dans tous les jeux, rangées (amis, jeux proches des tiens, classements officiels), « Tout voir » avec « Charger plus », lancement et favoris en un clic. Demande le compte actif ; accueil mis en cache 10 min. |
| Son des clics | Petite note douce et très courte, synthétisée (aucun fichier audio), à chaque clic sur un bouton, un onglet ou un interrupteur. **Réglages → Son** : interrupteur on/off et volume (discret par défaut). |
| Mon profil | Remplace les pages « Amis » et « Profils suivis ». Détails du compte actif (nom, pseudo, ID, date de création, ancienneté, statut, Robux, Premium, description) puis cinq onglets-compteurs : Amis, Demandes (accepter / refuser), Abonnés, Abonnements, Profils suivis. |
| Lancer Roblox (Accueil) | Lance directement Roblox avec le compte actif : dernier jeu joué, sinon premier favori, sinon demande quel jeu lancer. « Autre jeu… » ouvre Découvrir (la page Roblox ne contient plus de champ « Lancer un jeu » ni de liste « Jeux favoris » : les favoris s'ajoutent et se retirent avec ⭐ dans Découvrir). |
| Jeux Roblox (Accueil) | Affiche les jeux en tendance (classements officiels : Populaires, Tendances, Mieux notés) avec bouton Lancer et ⭐ favoris. Mis en cache 10 min. Les amis en jeu restent visibles dans « Amis en ligne » (bouton Rejoindre). |
| Statistiques d une personne suivie | Onglet Statistiques (page Activité) : sélecteur « Moi / Profils suivis / Amis suivis ». Pour un profil suivi : amis, abonnés, abonnements, courbe d évolution, ajouts/retraits par semaine et présence ; pour un ami suivi : présence. Bouton « Suivre quelqu un » (pseudo, ID ou lien). |
| Deux chemins réseau | Le **compte** (ta session) sert à ce qui t'est propre : amis, demandes, présence, lancement. Les **profils suivis** passent par un second client **sans session** (aucun cookie), avec sa propre file d'attente et sa propre pause : un « Roblox demande de ralentir » d'un côté ne bloque plus l'autre. **Réglages → Réseau** : relais facultatif (un nom de domaine, ex. `roproxy.com`) pour que ces requêtes publiques sortent par un service tiers ; en cas de panne, retour automatique en direct. Vide par défaut. Non testé avec les vrais serveurs Roblox : à valider sur ton PC. |
| Amis (Accueil) | Comme sur Roblox : un rond par ami avec une pastille — **gris** hors ligne, **bleu** en ligne, **vert** en jeu (Studio compte comme « en jeu »). En jeu d'abord, puis en ligne, puis hors ligne (le plus récemment vu en premier). Jusqu'à 40 amis, défilement horizontal ; « Rejoindre » sous les amis rejoignables. |
| Mise à jour de Roblox | **Roblox → Client Roblox → Mise à jour** : compare la version installée (dossier `version-…`) à la dernière version publique (API officielle `clientsettings.roblox.com`, sans compte ni cookie), puis « Mettre à jour Roblox » lance le lien officiel `roblox-player:1+launchmode:app` : c'est Roblox lui-même qui télécharge et installe la mise à jour, puis s'ouvre (tu peux le fermer). Avec Bloxstrap / Fishstrap / Voidstrap choisi dans « Lanceur utilisé », c'est ce lanceur qui est démarré (il met Roblox à jour). Si Roblox est ouvert, Batblox propose de le fermer d'abord (fermeture normale, jamais forcée). L'accueil affiche un rappel discret quand une mise à jour existe. Windows uniquement ; la vérification est mémorisée 10 min. Un canal bêta peut afficher une version différente de la version publique. Non testé avec les vrais serveurs Roblox : à valider sur ton PC. |
| Exécuteur | Page **Exécuteur** (menu Application) : ton lanceur personnel de logiciels (calculatrice, bloc-notes…). **Vide par défaut** : Batblox n’y met jamais rien, c’est toi qui choisis avec « Ajouter un logiciel » (programmes `.exe`, raccourcis `.lnk`, scripts `.bat` / `.cmd`, jusqu’à 100). Un clic lance le logiciel ; le menu ⋮ permet de le renommer, de le déplacer, d’afficher son dossier ou de le retirer (le logiciel n’est jamais supprimé). L’icône réelle du programme est affichée. L’interface ne transmet jamais de chemin : elle envoie l’identifiant d’un élément de ta liste. La liste est enregistrée dans `%APPDATA%\Batblox\donnees\executor.json` ; elle n’est pas incluse dans l’export de sauvegarde. Non testé sous Windows : à valider sur ton PC. |
| Activité | Une seule page, **Activité**, regroupe trois onglets : **Historique**, **Statistiques** et **Notifications** (anciennement trois pages du menu). Les anciens raccourcis (clic sur une notification Windows, bouton 📜 d'un ami ou d'un profil suivi) ouvrent directement le bon onglet. La pastille de nouveaux événements est affichée sur « Activité » et disparaît à l'ouverture de l'onglet Historique. |
La page Messages repose sur les API de chat de Roblox, non documentées officiellement : elle est testée avec des réponses simulées (tests automatiques), pas avec un vrai compte. Si Roblox change un format, l'erreur s'affiche dans la page.
| Mises à jour (GitHub) | **Réglages → Mises à jour** : compare ta version à la dernière release de `BatStream-off/Batblox`, télécharge l'installeur, vérifie son empreinte SHA-256 (si GitHub la fournit), le lance puis ferme Batblox. Vérification automatique au démarrage (désactivable), jamais d'installation sans ton accord. Version portable : ouvre la page de la release. L'installeur n'est pas signé : Windows peut afficher SmartScreen. Non testé avec une vraie release : à valider après la première publication. |

La lecture ne démarre qu'une fois la vidéo chargée et l'interface déjà dessinée sous le calque bleu (pré-roulage, quelques dixièmes de seconde invisibles) ; pendant la lecture rien ne bouge en dessous (animations en pause, éclairs et lueur de souris coupés), ce qui supprime les saccades. Si la vidéo est absente ou ne démarre pas, l'interface s'affiche directement.

## Nouveautés v1.6.0
- **Intro vidéo** : plus de saccades. Avant, la vidéo démarrait pendant le chargement de l'interface, l'interface était dévoilée sous la vidéo 1 s avant la fin (avec un recalcul de style à chaque image), et le décor animé repartait pendant le fondu.
- **Une seule barre en haut** : logo, état du monitoring, compte et boutons de la fenêtre réunis (l'ancienne barre de titre affichait « Batblox » une deuxième fois).
- **Accueil** : un bandeau unique avec ton statut, le jeu qui sera lancé et le bouton « Lancer Roblox », puis les compteurs du compte (amis, demandes, abonnés, abonnements, profils suivis), cliquables.
- **Thèmes Clair, Sombre et Auto** : couleur d'accent bleue, celle du logo et de l'intro (au lieu du violet). Les thèmes Batcave, Joker, Batman et Inde ne changent pas.
- **Icônes** : les emojis des boutons, titres, menus et bandeaux (🔄 ➕ 🗑 ⬇ 📜 📊 🔕 ⭐…) sont remplacés à l'affichage par des icônes au trait, de la même famille que celles du menu et dans la couleur du thème (conversion centralisée dans `lib.js` : `B.GLYPH`, `B.EMOJI_GLYPH`). Les noms de jeux et de joueurs ne sont jamais modifiés.
- **États vides** : silhouette de chauve-souris vectorielle dans la couleur du thème au lieu de l'emoji 🦇.
- **Réglages** : barre de sections collante en haut de la page (Apparence, Son, Monitoring…) ; la section visible est mise en évidence.

### Nouvelles options (v1.6.0)
| Option | Où | Détail |
|---|---|---|
| Intro au démarrage | Réglages → Apparence | Interrupteur. L'intro se passe aussi d'un clic, avec Échap, Entrée ou Espace. |
| Taille de l'interface | Réglages → Apparence | 80 à 130 % (zoom de la fenêtre). Raccourcis Ctrl + + / Ctrl + − / Ctrl + 0. |
| Page d'ouverture | Réglages → Apparence | Accueil, Découvrir, Mon profil, Activité, Messages ou Roblox. |
| Couleur d'accent | Réglages → Apparence | Bleu, violet, vert, orange, rose, cyan pour Clair / Sombre / Auto (contraste vérifié : texte blanc ≥ 4,5:1 sur les boutons). |
| Raccourcis clavier | partout (liste dans Réglages) | Ctrl+1…9 pages du menu, Ctrl+L lancer Roblox, Ctrl+R ou F5 vérifier, Ctrl+, réglages. Interceptés dans `main.js` avant le menu caché d'Electron (Ctrl+R ne recharge plus la page). |
| Temps de jeu | Activité → Temps de jeu | Aujourd'hui, 7 jours, graphique sur 14 jours, jeux les plus joués. Calculé avec ton propre statut à chaque vérification (`core/playtime.js`, stockage `playtime.json`) ; nécessite « Statut en ligne » et « Afficher mon propre statut ». Un trou (PC en veille) n'est jamais compté plus de 2,5 intervalles. |
| Limite quotidienne | Activité → Temps de jeu | Notification Windows une fois par jour quand la limite est dépassée. Rien n'est bloqué. |
| Silence pendant que je joue | Activité → Notifications | Notifications Windows retenues pendant la partie, une seule notification récapitulative à la fin. Discord / ntfy inchangés. |
| Jeux surveillés | Activité → Notifications | Alerte dédiée quand un ami lance un jeu de la liste (nom partiel ou identifiant) ; un clic sur la notification le rejoint. |
| Résumé quotidien | Activité → Notifications | Un message par jour sur Discord / ntfy à l'heure choisie (`core/scheduler.js`), avec aperçu et envoi immédiat. |
| Sauvegarde automatique | Réglages → Sauvegarde automatique | Chaque semaine dans le dossier choisi, fichiers `batblox-sauvegarde-auto-AAAA-MM-JJ.json`, les N plus récents conservés ; les autres fichiers du dossier ne sont jamais touchés. Dossier absent : nouvel essai une heure plus tard. Le chemin du dossier n'est pas exporté. |
| Notes sur un ami | Mon profil → Amis → bouton Fiche (📝) | Texte libre (500 caractères), visible sous le pseudo ; la recherche d'amis cherche aussi dans les notes. Stockage local `people.json`, inclus dans l'export, jamais envoyé ailleurs. |
| Groupes d'amis | Fiche d'un ami, « Gérer les groupes » | Jusqu'à 12 groupes colorés (Proches et École créés par défaut), filtre dans la liste d'amis. Par groupe : « Connexions » (reste notifié quand « Connexions seulement pour mes groupes » est actif, dans Activité → Notifications) et « Sourdine » (aucune notification). Règle dans `core/people.js` (`allowEntry`). |
| Recherche globale | Ctrl + K ou « Rechercher… » en haut | Pages, réglages (la carte visée clignote), actions, amis (et leurs notes), rejoindre un ami, jeux récents / favoris / tendances, ou un identifiant / lien de jeu collé. |
| Mode streamer | Icône œil barré en haut, Ctrl + Maj + S, menu de la zone de notification | Floute pseudos, avatars, identifiants, notes, messages et historique ; notifications Windows anonymes ; compte masqué dans la zone de notification. Les données ne sont pas modifiées. |
| Mini-fenêtre « Amis en ligne » | Icône en haut, Ctrl + Maj + M, zone de notification, Réglages → Système | Fenêtre compacte (`index.html?mini=1`), toujours au premier plan (désactivable), position et taille mémorisées, bouton Rejoindre. |
| Vue tous comptes | Comptes (dès 2 comptes) | Amis, en ligne, demandes, abonnés, temps de jeu du jour et de la semaine, côte à côte. Seul le compte actif est vérifié en continu : les autres affichent leur dernière vérification. |
| Quoi de neuf | Après une mise à jour, ou Réglages → Système | Liste des nouveautés de la version (`renderer/whatsnew.js`, `B.CHANGELOG`), avec raccourcis vers les pages concernées. Affichée une fois par version (`settings.ui.seenVersion`). |
| Guide du premier lancement | Nouvelle installation, ou Réglages → Système | Trois écrans : compte, apparence (thème + couleur), notifications. |
| Prévenir à la prochaine connexion | Fiche d'un ami (📝) | Alerte unique : une notification à sa prochaine connexion (s'il est déjà en ligne : à sa prochaine reconnexion), même si les connexions sont coupées dans les notifications. Son statut est lu même s'il n'est pas « Suivi ». Une cloche s'affiche à côté de son pseudo tant que l'alerte est active. |
| Anciens pseudos | Fiche d'un ami | Liste des changements de pseudo enregistrés dans l'historique, du plus récent au plus ancien. |
| Signaler un problème | Réglages → Système, Maintenance → Journaux, Ctrl + K | Rapport : version, système, état, réglages et 250 lignes de journal. Retirés : session Roblox, webhook, sujet ntfy, dossier de sauvegarde, lanceur personnalisé, identifiant Discord, chemin du dossier personnel (`%USERPROFILE%`), pseudos des comptes, notes d'amis. Copier, enregistrer en .txt, ou ouvrir GitHub. |
| Bilan du mois | Activité → Bilan | Temps de jeu (total, jours joués, plus grosse journée, jeux), amis gagnés / perdus (un aller-retour dans le mois ne compte pas), pseudos changés, demandes, jeux de tes amis. Export : image PNG, image copiée (à coller dans Discord), texte, CSV. Le mode streamer floute aussi l'image. |
| Version anglaise | Réglages → Apparence → Langue (et guide du premier lancement) | Première installation : langue de Windows. Le code reste en français ; la traduction est appliquée à l'affichage (`renderer/i18n.js`) avec le dictionnaire `renderer/i18n-en.js` (≈ 1 400 textes + morceaux de phrases), aussi utilisé par `main.js` pour les notifications, la zone de notification, les boîtes de dialogue et Discord / ntfy. Les pseudos, noms de jeux, notes et messages ne sont jamais traduits. **Ajouter un texte** : ajoute sa traduction dans `i18n-en.js`, puis vérifie avec `node tools/i18n-couverture.js`. |

### Latence et cache (v1.6.0)
`core/cache.js` : cache en mémoire, et sur le disque (`cache.json`) uniquement pour les données publiques et sans secret (avatars, icônes de jeux, tendances, page Découvrir). Jamais de session, de Robux ni de message sur le disque.
- **Valeur fraîche** : servie sans réseau. **Valeur périmée mais utilisable** : servie tout de suite puis rafraîchie en arrière-plan ; la page affichée se met à jour toute seule (événement `refreshed`). **Requêtes dédoublonnées** : deux demandes identiques au même moment ne partent qu'une fois (au niveau du cache et de la passerelle interface ↔ moteur).
- Durées : avatars frais 6 h / utilisables 7 jours ; icônes 24 h / 30 jours ; tendances et Découvrir 10 min / 24 h ; détails du profil 5 min / 6 h (mémoire seulement) ; compteurs 2 min / 1 h ; conversations 15 s / 5 min (vidées après un envoi ou une lecture) ; détection de Roblox (`tasklist`) 2,5 s, dossiers d'installation 15 s.
- **Mon profil** : les 4 compteurs passaient par le service « amis » de Roblox, volontairement espacé de 1,2 s par requête (~4 s d'attente). Ils sont désormais servis depuis le monitoring, qui les tient à jour, et rafraîchis en arrière-plan.
- **Préchargement** : après la première vérification, avatars des amis (en ligne d'abord), icônes des derniers jeux et tendances sont chargés discrètement.
- **Interface** : avatars chargés à la demande (`loading="lazy"`, décodage asynchrone) dans les longues listes ; recherche d'amis redessinée au plus toutes les 120 ms pendant la frappe.
- Réglages → Données → **Cache de Batblox** : taille, part des demandes servies sans attendre Roblox, bouton « Vider le cache ».

Mesures (banc avec un faux Roblox répondant en 200 ms, espacement réel du client) :

| Action | Avant | Après |
|---|---|---|
| Mon profil : compteurs (monitoring déjà passé) | 3,8 s | 0 ms |
| Mon profil : 2e visite (détails + compteurs) | 6,0 s | 0 ms |
| Accueil après redémarrage : 120 avatars + 12 icônes | 0,8 s | 2 ms |
| 2 demandes identiques simultanées (120 avatars) | 1,1 s, 4 requêtes | 0,5 s, 2 requêtes (0 après redémarrage) |

