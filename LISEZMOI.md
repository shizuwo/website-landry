# Site de Landry : mode d'emploi

Le site tourne sur le Worker Cloudflare **website-landry**, relié à ce dépôt GitHub.
Chaque modification fusionnée dans `main` est publiée automatiquement sur landrypf.com.

## Les pages

| Adresse | Fichier | Contenu |
|---|---|---|
| landrypf.com | `public/index.html` | Balade animée au scroll (écran de chargement, curseur tiare, tes photos) |
| landrypf.com/bio | `public/bio.html` | Liens, heure, météo et houle, événement, Mauruuru, livre d'or, contact, 3 langues |
| landrypf.com/galerie | `public/galerie.html` | Tes photos, façon carnet de voyage |
| landrypf.com/admin | `public/admin.html` | Ton espace privé |
| landrypf.com/f/… | — | Les fichiers que tu partages |
| landrypf.com/ton-code | — | Tes liens courts |

## L'admin (landrypf.com/admin)

- **Chiffres** : visites, clics, téléchargements et mauruuru des 30 derniers jours.
- **Liens bio** : ajouter, modifier, masquer, réordonner, supprimer. Dates de début et de fin facultatives
  (le lien n'apparaît qu'entre ces deux dates). Phrases « En ce moment » : mets-en plusieurs et active
  « au hasard » pour qu'une phrase différente s'affiche à chaque visite (bouton « Des idées » pour t'inspirer).
- **Liens courts** : landrypf.com/ton-code vers n'importe quelle adresse, avec QR code à télécharger.
- **Fichiers** : envoi jusqu'à 100 Mo, lien court à partager (landrypf.com/f/…), QR code, mot de passe
  et date d'expiration facultatifs, renommage. La case « Optimiser les photos » (cochée par défaut)
  les réduit à 2 560 px et les allège sans perte visible ; décoche-la pour envoyer l'original.
  La jauge indique la place utilisée sur les 10 Go gratuits ; l'envoi est bloqué juste avant la limite.
- **Galerie** : chaque nouvelle image arrive dans « Photos à valider » ; rien n'est publié sans ton accord.
- **Accueil** : remplace les 8 dessins par tes photos, et réécris tous les textes de la page d'accueil
  (titre, bandeau, cartes, coucher de soleil, fin). Un champ vide garde le texte d'origine.
- **Événement** : affiché avec un compte à rebours sur la page bio.
- **Réglages** : activer ou couper le livre d'or et le formulaire de contact, la bannière d'annonce
  (en bas de toutes les pages) et le lecteur de musique de la bio (morceau choisi parmi tes fichiers audio).
- **Messages** : ce que les visiteurs t'envoient avec le formulaire « Me contacter ».
- **Livre d'or** : publier ou supprimer les mots.

**Installer l'admin comme une appli** : ouvre landrypf.com/admin sur ton téléphone, puis
« Partager → Sur l'écran d'accueil » (iPhone) ou « ⋮ → Ajouter à l'écran d'accueil » (Android).

## Réglages Cloudflare (website-landry → Settings → Variables and Secrets)

| Nom | Type | Rôle |
|---|---|---|
| `ADMIN_KEY` | Secret | Ton mot de passe admin |
| `SEL` | Secret | Une phrase au hasard (anonymise les visiteurs) |
| `NTFY_TOPIC` | Secret | Facultatif : ton canal de notifications (voir ci-dessous) |

Déjà en place : base de données D1 `landry-db` et stockage R2 `landry-fichiers`.

## Notifications sur ton téléphone (ntfy, gratuit)

1. Installe l'appli **ntfy** (App Store ou Google Play).
2. Dans l'appli, touche **+** et abonne-toi à un nom de canal secret, par exemple celui que Claude t'a donné.
3. Ajoute ce même nom dans Cloudflare comme secret `NTFY_TOPIC`.

Tu recevras une notification à chaque nouveau message de contact ou mot dans le livre d'or.
Garde ce nom secret : quiconque le connaît peut lire tes notifications.

## Statistiques Cloudflare (facultatif)

Les chiffres de l'admin suffisent pour suivre ton site. Pour des statistiques plus détaillées
(pays, appareils…), active **Web Analytics** dans le tableau de bord Cloudflare.

## Revenir en arrière

- **Le plus rapide** : Cloudflare → website-landry → **Deployments** → choisis une version précédente → **Rollback**.
- **Sur GitHub** : la branche `sauvegarde-v1` contient le site tel qu'il était avant la v2,
  et `ancien-site-astro` l'ancien site Astro. Sur une demande de fusion déjà fusionnée,
  le bouton **Revert** crée une demande qui annule ses changements.
- Les nouvelles tables de la base de données ne gênent pas les anciennes versions du site.

## Options dans `public/bio.html` (bloc CONFIG)

- **Ta musique Spotify** : relie Spotify à ton compte Discord, rejoins le serveur de Lanyard
  (discord.gg/lanyard), puis mets ton ID Discord dans `discordUtilisateurId`.

## Reo tahiti

Fais relire les textes `TEXTES.ty` de `public/bio.html` par quelqu'un qui parle couramment.
