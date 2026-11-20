-- Base de données D1 du site (à coller une seule fois dans la console D1 de Cloudflare)
CREATE TABLE IF NOT EXISTS compteurs (nom TEXT PRIMARY KEY, valeur INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS reglages  (cle TEXT PRIMARY KEY, valeur TEXT);
CREATE TABLE IF NOT EXISTS messages  (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, texte TEXT NOT NULL, cree INTEGER NOT NULL, statut TEXT NOT NULL DEFAULT 'attente');
CREATE TABLE IF NOT EXISTS limites   (cle TEXT PRIMARY KEY, dernier INTEGER NOT NULL);
INSERT OR IGNORE INTO compteurs (nom, valeur) VALUES ('mauruuru', 0), ('clic:discord', 0), ('clic:insta', 0);
INSERT OR IGNORE INTO reglages (cle, valeur) VALUES ('statut', '');
