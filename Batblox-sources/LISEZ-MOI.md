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
