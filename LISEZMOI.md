# Site de Landry : mode d'emploi

Le site tourne sur le Worker Cloudflare **website-landry**, relié à ce dépôt GitHub.
Chaque modification fusionnée dans `main` est publiée automatiquement sur landrypf.com.

## Les pages

| Adresse | Fichier | Contenu |
|---|---|---|
| landrypf.com | `public/index.html` | Balade animée au scroll (écran de chargement, curseur tiare, tes photos) |
| landrypf.com/bio | `public/bio.html` | Liens, heure, météo et houle, événement, Mauruuru, livre d'or, contact, 3 langues |
| landrypf.com/galerie | `public/galerie.html` | Tes photos, façon carnet de voyage |
| landrypf.com/album | `public/album.html` | Album privé, protégé par mot de passe |
| landrypf.com/mentions | `public/mentions.html` | Mentions légales (le minimum obligatoire) |
| landrypf.com/admin | `public/admin.html` | Ton espace privé |
| landrypf.com/f/… | — | Les fichiers que tu partages |
| landrypf.com/ton-code | — | Tes liens courts |
| (adresse inconnue) | `public/404.html` | Page « perdue dans le lagon » |
| landrypf.com/sitemap.xml et /robots.txt | — | Pour Google (créés automatiquement) |

## L'admin (landrypf.com/admin)

Sur téléphone, les onglets sont en bas de l'écran ; sur ordinateur, en haut. Chaque onglet a ses sous-onglets.
L'onglet **Tout** affiche tout sur une seule page. **Ctrl K** (ou la loupe) cherche partout.

- **Tableau de bord** : ce qui est à traiter (messages, mots, photos), jauge de stockage, chiffres sur 30 jours.
- **Page bio** : couleurs (le ciel de Tahiti : lever, jour, coucher, nuit aux vraies heures du soleil ; ou Lagon, Tifaifai, Tapa, Monoï, Océan profond), disposition (liens en haut ou infos en haut ; « En ce moment » reste toujours sous ton nom), liens (menu ⋯ → « Mettre en avant ✨ » pour faire briller un lien) (glisser ⠿ pour l'ordre, dates de début et de fin), phrases « En ce moment »,
  événement, badge « en direct », lecteur de musique avec playlist, blocs intégrés
  (Instagram, TikTok, YouTube, Spotify, SoundCloud). Sur ordinateur, un aperçu en direct de la bio s'affiche à droite.
- **Page d'accueil** : tes photos à la place des dessins (bouton **Recadrer** : glisse et zoome), et tous les textes.
- **Fichiers** : envoi (100 Mo max, photos optimisées), filtres, lien court, QR code, mot de passe, expiration,
  renommage ; galerie publique (avec « Photos à valider », et **Recadrer** dans le menu ⋯ : format carré, portrait, paysage ou d'origine) ; **album privé** protégé par mot de passe (landrypf.com/album).
- **Outils** :
  - **Transferts** (landrypf.com/t/…) : plusieurs fichiers (jusqu'à 5 Go chacun), un seul lien, nombre de téléchargements et expiration au choix, mot de passe, message, .zip. L'envoi reprend tout seul si la connexion coupe (ou en renvoyant le même fichier). Menu ⋯ : modifier, ajouter des fichiers, envoyer par e-mail, partager. La page montre des vignettes, et sans limite de téléchargements on peut regarder et écouter en ligne. Les fichiers sont supprimés tout seuls à la fin.
  - **Demandes** (landrypf.com/d/…) : un lien pour que les gens te déposent leurs fichiers (avec leur prénom), notification à chaque fichier.
  - **Depuis Android** : installe l'admin sur l'écran d'accueil, puis « Partager → Admin » depuis la galerie photo.
  - **Bloc-notes** (landrypf.com/n/…) : texte ou code, mot de passe, expiration, « détruire après lecture ».
  - **Liens courts** : destination iPhone / Android, expiration, nombre de clics maximum, statistiques (jour, appareil, pays).
  - **QR codes** : n'importe quel lien, tiare au centre, couleur au choix, PNG ou SVG.
  - **Corbeille** : transferts et notes supprimés gardés 30 jours.
  - La position GPS des photos est retirée à l'envoi (case cochée par défaut).
- **Messages** : formulaire de contact et livre d'or (les visiteurs peuvent mettre un 🌺 aux mots).
- **Réglages** : livre d'or et contact (activer/couper), bannière programmable, liens courts, fêtes
  (automatique : Matari'i fin novembre, Noël, Nouvel An, Nouvel An chinois, 29 juin, Heiva en juillet, ton anniversaire ; messages personnalisés), mentions légales, sauvegarde en un clic, nettoyage.

**Sécurité** : après 5 mauvais mots de passe en 15 minutes, l'admin est bloqué 15 minutes pour cet appareil, et tu reçois une notification.

Chaque suppression peut être annulée pendant 5 secondes. Le menu **⋯** de chaque élément regroupe ses actions.

**Installer l'admin comme une appli** : ouvre landrypf.com/admin sur ton téléphone, puis
« Partager → Sur l'écran d'accueil » (iPhone) ou « ⋮ → Ajouter à l'écran d'accueil » (Android).

## Les petits secrets de l'accueil

- Les cartes postales de « Mon île » se déplacent à la souris (ou au doigt avec un appui long). Double-clic pour les remettre.
- Dans le lagon du soir, une honu et un banc de poissons nagent.
- À la nuit tombée, Matari'i (les Pléiades) s'allume, et une étoile filante passe de temps en temps.

## Entretien automatique

Chaque nuit à 4 h (heure de Tahiti), le site supprime les fichiers expirés, les messages de contact
de plus d'un an et les vieilles traces anti-spam.

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
