-- Base de données D1 du site (à coller une seule fois dans la console D1 de Cloudflare)
CREATE TABLE IF NOT EXISTS compteurs (nom TEXT PRIMARY KEY, valeur INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS reglages  (cle TEXT PRIMARY KEY, valeur TEXT);
CREATE TABLE IF NOT EXISTS messages  (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, texte TEXT NOT NULL, cree INTEGER NOT NULL, statut TEXT NOT NULL DEFAULT 'attente');
CREATE TABLE IF NOT EXISTS limites   (cle TEXT PRIMARY KEY, dernier INTEGER NOT NULL);
INSERT OR IGNORE INTO compteurs (nom, valeur) VALUES ('mauruuru', 0), ('clic:discord', 0), ('clic:insta', 0);
INSERT OR IGNORE INTO reglages (cle, valeur) VALUES ('statut', '');
CREATE TABLE IF NOT EXISTS liens (id INTEGER PRIMARY KEY AUTOINCREMENT, titre TEXT NOT NULL, sous_titre TEXT NOT NULL DEFAULT '', url TEXT NOT NULL, icone TEXT NOT NULL DEFAULT 'lien', ordre INTEGER NOT NULL DEFAULT 0, actif INTEGER NOT NULL DEFAULT 1, clics INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS raccourcis (code TEXT PRIMARY KEY, url TEXT NOT NULL, clics INTEGER NOT NULL DEFAULT 0, cree INTEGER NOT NULL);
INSERT INTO liens (titre, sous_titre, url, icone, ordre) SELECT 'Me suivre sur Instagram', 'Photos et stories de Tahiti', 'https://www.instagram.com/landry.pf/', 'instagram', 1 WHERE NOT EXISTS (SELECT 1 FROM liens);
INSERT OR IGNORE INTO raccourcis (code, url, clics, cree) VALUES ('insta', 'https://www.instagram.com/landry.pf/', 0, 0);
