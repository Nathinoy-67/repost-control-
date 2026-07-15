# Repost Control — publier une vidéo depuis ton tel vers YouTube + Instagram

Tout le code est déjà écrit. Il te reste 4 réglages à faire toi-même (comptes développeurs liés à ton identité,
je ne peux pas les créer à ta place). Compte environ 20-30 min la première fois, ensuite plus rien à toucher.

## Ce dont tu as besoin (tout gratuit)

- Un compte GitHub (hébergement du site statique — gratuit)
- Un compte Google Cloud (gratuit, juste pour déclarer l'app)
- Un compte Meta for Developers (gratuit)
- Un compte Cloudflare (gratuit, pour le Worker)
- Une Page Facebook + un compte Instagram **Professionnel (Business)** relié à cette Page

---

## 1. Héberger le site (GitHub Pages)

1. Crée un repo GitHub (ex: `repost-control`), mets-le en **public**.
2. Dépose tous les fichiers de ce dossier SAUF `worker/` à la racine du repo.
3. Settings → Pages → Source: branche `main`, dossier `/ (root)`.
4. Ton URL sera du type `https://tonpseudo.github.io/repost-control/`.
   **Note cette URL**, tu en as besoin juste après.

## 2. Google Cloud — pour YouTube

1. https://console.cloud.google.com → crée un projet.
2. APIs & Services → Library → active **YouTube Data API v3**.
3. APIs & Services → OAuth consent screen → type **External**, ajoute-toi comme "test user"
   (pas besoin de validation Google si tu restes le seul utilisateur).
4. APIs & Services → Credentials → Create credentials → OAuth client ID → type **Desktop app**.
5. Copie le **Client ID** dans `config.js` → `GOOGLE_CLIENT_ID`.

> Le type "Desktop app" permet d'utiliser OAuth sans exposer de secret côté navigateur — c'est fait pour ce cas d'usage.

## 3. Meta for Developers — pour Instagram

1. https://developers.facebook.com/apps → Create App → type **Autre** → **Consumer/Business**.
2. Ajoute le produit **Facebook Login** et le produit **Instagram Graph API**.
3. Paramètres de base → copie l'**App ID** et l'**App Secret**.
4. Facebook Login → Paramètres → ajoute ton URL GitHub Pages dans "Valid OAuth Redirect URIs" et "Allowed Domains".
5. Rôles → Testeurs → ajoute ton propre compte Facebook (tant que tu restes le seul utilisateur,
   pas besoin de validation Meta — l'app reste en mode Développement).
6. Vérifie que ton compte Instagram est en mode **Professionnel (Business)** et relié à une **Page Facebook**
   (Instagram app → Paramètres → Compte → Passer à un compte professionnel).

## 4. Cloudflare Worker — le bout "serveur" (à la demande, rien à laisser allumé)

1. https://dash.cloudflare.com → Workers & Pages → Create Worker.
2. Colle le contenu de `worker/worker.js` dans l'éditeur, déploie.
3. Worker → Settings → Variables → ajoute deux **secrets** (pas des variables en clair) :
   - `FB_APP_ID` = ton App ID Meta
   - `FB_APP_SECRET` = ton App Secret Meta
4. Copie l'URL du Worker (ex: `https://repost-worker.tonpseudo.workers.dev`) dans `config.js` → `WORKER_URL`.

## 5. Dernier réglage

Ouvre `config.js`, remplis les 3 valeurs, redéploie sur GitHub Pages (push le fichier modifié).

---

## Utilisation au quotidien

1. Sur ton tel, ouvre l'URL GitHub Pages dans le navigateur, "Ajouter à l'écran d'accueil".
2. La première fois : bouton "Connecter YouTube" et "Connecter Instagram" (une seule fois, les tokens restent sur ton tel).
3. Ensuite, à chaque vidéo : ouvre l'app → sélectionne la vidéo dans ta galerie → choisis/écris la description →
   coche les plateformes → "Publier".

Rien ne tourne en continu : le site est un fichier statique gratuit, le Worker ne s'exécute que pendant les
quelques secondes de la publication Instagram.

## Limites à connaître

- Instagram Reels : 5 à 90 secondes, format vertical 9:16 pour apparaître dans l'onglet Reels.
- Instagram : max 25 publications / 24h par compte (largement suffisant pour un usage perso).
- Si tu ajoutes un jour d'autres comptes Instagram que le tien sur cette app, Meta demandera une validation
  d'app (2-4 semaines) — pas nécessaire tant que tu es seul utilisateur.
- YouTube : si tu ne postes pas pendant 6 mois, il faudra te reconnecter (durée de vie du refresh token Google
  pour les apps en mode test).
