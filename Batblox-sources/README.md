<div align="center">

# 🦇 Batblox

**Le centre de contrôle Roblox pour Windows.**
Lanceur, amis, profils suivis, historique, statistiques et notifications dans une seule application, entièrement en français.

![Version](https://img.shields.io/badge/version-1.5.0-2563F2)
![Plateforme](https://img.shields.io/badge/plateforme-Windows-0078D4)
![Electron](https://img.shields.io/badge/Electron-33-47848F)

</div>

---

## ✨ Fonctionnalités

- **Lanceur Roblox** : lance un jeu, rejoins un ami, gère les instances ouvertes. Compatible Roblox officiel, Bloxstrap, Fishstrap, Voidstrap ou un `.exe` personnalisé.
- **Comptes multiples** : connexion par fenêtre Roblox officielle (ton mot de passe n'est jamais vu), changement de compte en un clic.
- **Amis et profils suivis** : détection des ajouts, retraits, changements de pseudo, connexions et jeux lancés.
- **Activité** : historique, statistiques de présence et notifications réunis sur une seule page.
- **Messages** : lis et réponds aux conversations Roblox sans ouvrir le navigateur.
- **Découvrir** : recherche de jeux, classements officiels, jeux auxquels jouent tes amis.
- **Notifications** : Windows, Discord (webhook) et ntfy, avec plage « Ne pas déranger ».
- **Discord Rich Presence**, **zone de notification**, **exécuteur** de logiciels personnels.
- **Personnalisation et maintenance** de Roblox : son, polices, curseurs, nettoyage du cache, vérification de l'installation.
- **Thèmes** : Clair, Sombre, Batcave Neon, Joker, Batman, Inde, mode potato pour les PC anciens.
- **Mises à jour automatiques depuis GitHub** (voir plus bas).

## 📥 Installation

1. Ouvre la page des [**Releases**](https://github.com/BatStream-off/Batblox/releases/latest).
2. Télécharge **`Batblox-Setup-x.y.z.exe`** (installeur) ou **`Batblox-Portable-x.y.z.exe`** (sans installation).
3. Lance-le, puis va dans **Comptes** pour te connecter à Roblox.

> Windows peut afficher un avertissement « SmartScreen » : l'application n'est pas signée numériquement. Clique sur *Informations complémentaires → Exécuter quand même*.

## 🔄 Mise à jour automatique

Dans **Réglages → Mises à jour** :

| Action | Résultat |
|---|---|
| **Vérifier les mises à jour** | Interroge la dernière release GitHub et compare avec ta version. |
| **Mettre à jour vers vX.Y.Z** | Télécharge l'installeur, vérifie son empreinte SHA-256 (fournie par GitHub), lance l'installation et ferme Batblox. |
| **Vérifier au démarrage** | Une vérification discrète quelques secondes après l'ouverture (activée par défaut). Rien n'est installé sans ton accord. |

- Tes comptes, réglages et historique sont conservés.
- Avec la version **portable**, le bouton ouvre la page de la release pour télécharger le nouveau fichier.
- Seuls les fichiers de la release officielle `BatStream-off/Batblox` sont acceptés.

## 🛠️ Développement

Prérequis : [Node.js](https://nodejs.org) 20 ou plus.

```bash
npm install          # installe les dépendances
npm start            # lance l'application en mode développement
npm test             # lance les tests de la logique interne
npm run dist         # construit l'installeur et la version portable (dossier dist/, sous Windows)
```

Sous Windows, tu peux aussi double-cliquer sur `lancer-batblox.bat` (essai rapide) ou `construire-installeur.bat` (installeur).

### Structure

```
src/
  main/        processus principal Electron (fenêtre, IPC, réseau)
    core/      logique métier : comptes, monitoring, notifications, lanceur, mises à jour…
  renderer/    interface (HTML, CSS, JavaScript sans framework)
  assets/      icône et logo
test/          tests automatiques (node:test)
build/         icônes de l'installeur
```

## 🚀 Publier une nouvelle version

1. Change `version` dans `package.json` (par exemple `1.6.0`).
2. Commit, puis crée et pousse le tag correspondant :
   ```bash
   git tag v1.6.0
   git push origin main --tags
   ```
3. Le workflow GitHub Actions (`.github/workflows/release.yml`) construit l'installeur et la version portable, puis crée la release avec les fichiers.
4. Les utilisateurs reçoivent la mise à jour via le bouton **Réglages → Mises à jour**.

Le tag (`v1.6.0`) doit correspondre à la version du `package.json`.

## 🔒 Sécurité et confidentialité

- La session Roblox de chaque compte est chiffrée par Windows (DPAPI, via Electron `safeStorage`).
- Les sessions ne sont jamais affichées, exportées, journalisées, ni envoyées à Discord ou ntfy.
- L'interface est isolée du système (pas d'accès Node, politique de contenu stricte, une seule passerelle contrôlée).
- Données stockées dans `%APPDATA%\Batblox`.

Le détail complet (limites, précisions, fonctionnement de chaque page) est dans [`LISEZ-MOI.md`](LISEZ-MOI.md).

## ⚠️ Avertissement

Batblox n'est ni affilié, ni approuvé, ni soutenu par Roblox Corporation. La multi-instance Roblox n'est volontairement pas implémentée : contourner la limite d'une instance expose les comptes à des sanctions. La personnalisation des fichiers locaux de Roblox n'est pas officiellement prise en charge par Roblox.
