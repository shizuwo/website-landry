# Site de Landry : mise en ligne sur Cloudflare (Worker)

Ton site landrypf.com tourne sur le Worker **website-landry**. Ce projet le remplace,
et ton domaine reste branché dessus : rien à refaire de ce côté.

## Ce qu'il y a dans le dossier

| Fichier | Rôle |
|---|---|
| `public/index.html` | Page d'accueil animée au scroll → **landrypf.com** |
| `public/bio.html` | Page bio (heure de Tahiti, jour/nuit, Mauruuru, livre d'or, 3 langues…) → **landrypf.com/bio** |
| `public/_redirects` | Renvoie l'ancienne adresse /monde vers l'accueil |
| `public/menu.js` | Le menu « tissu » qui se déroule |
| `public/admin.html` | Ton espace privé (landrypf.com/admin) |
| `src/worker.js` | Le serveur : compteurs, livre d'or, liens de la bio, liens courts |
| `public/icones.js` | Les icônes proposées pour les liens de la bio |
| `wrangler.jsonc` | Les réglages du Worker (nom, base de données, liens) |
| `schema.sql` | La base de données (déjà créée : `landry-db`) |

## Déjà fait ✅

- Base de données D1 `landry-db` créée, tables installées, reliée dans `wrangler.jsonc`.
- Lien Instagram (landry.pf) ajouté à la bio, et lien court landrypf.com/insta créé.

## À faire

1. Mets **landrypf.com/bio** dans ta bio Instagram.
2. **GitHub** : crée un dépôt (ex. `landry-site`) et envoie-y tout le contenu du dossier
   (Add file → Upload files, en gardant les dossiers `public` et `src`).
3. **Brancher GitHub au Worker** : Cloudflare → Workers & Pages → **website-landry** → Settings → **Build** →
   Connect (ou change le dépôt s'il est déjà relié à l'ancien site Astro).
   - Build command : *(vide)*
   - Deploy command : `npx wrangler deploy`
4. **Secrets** : website-landry → Settings → **Variables and Secrets** → Add, type **Secret** :
   - `ADMIN_KEY` : un long mot de passe que toi seul connais
   - `SEL` : n'importe quelle phrase au hasard
5. Chaque fois que tu modifies un fichier sur GitHub, Cloudflare republie le site tout seul.

## Options (dans `public/bio.html`, bloc CONFIG tout en bas)

- **Ta musique Spotify** : relie Spotify à ton compte Discord, rejoins le serveur de Lanyard
  (discord.gg/lanyard), mets ton ID Discord dans `discordUtilisateurId`.

## Au quotidien

- **landrypf.com/admin** :
  - **Liens de la page bio** : ajouter, modifier, masquer, réordonner (↑ ↓), supprimer. Chaque lien compte ses clics.
  - **Liens courts** : crée landrypf.com/ce-que-tu-veux vers n'importe quelle adresse (code en minuscules,
    chiffres et tirets). Quelques codes sont réservés par le site : bio, admin, api…
  - Ligne « En ce moment » et modération du livre d'or.
- Tester le mode nuit en journée : **landrypf.com/bio?moment=nuit**
- Easter egg : touche la fleur 7 fois rapidement 🌺

## Reo tahiti

Fais relire les textes `TEXTES.ty` de `public/bio.html` par quelqu'un qui parle couramment.
