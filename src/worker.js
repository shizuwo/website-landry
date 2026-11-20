// Worker du site de Landry.
// Sert les pages (dossier public) et gère : compteur Mauruuru, livre d'or, liens de la bio,
// liens courts, fichiers (R2), galerie, photos de l'accueil, statistiques, contact,
// prochain événement, notifications sur le téléphone, et l'espace admin.

const json = (data, init = {}) => Response.json(data, init);
const nettoyer = (s, max) => String(s ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const nettoyerTexte = (s, max) => String(s ?? '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const erreur = (msg, status = 400) => json({ erreur: msg }, { status });
const echappe = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Codes de liens courts interdits (déjà utilisés par le site)
const RESERVES = new Set(['bio', 'admin', 'api', 'go', 'l', 'f', 'galerie', 'index', 'menu', 'icones', 'favicon', 'partage', 'site', 'apple-touch-icon',
  'icone-192', 'icone-512', 'monde', 'robots', 'sitemap', 'commun']);
const ICONES = new Set(['instagram', 'tiktok', 'youtube', 'facebook', 'snapchat', 'spotify', 'x', 'whatsapp', 'email', 'boutique', 'monde', 'lien']);
const EMPLACEMENTS = new Set(['p1', 'p2', 'p3', 'c1', 'c2', 'c3', 'c4', 'c5']);
const TAILLE_MAX = 100 * 1024 * 1024; // 100 Mo
const PAGES_VUES = new Set(['accueil', 'bio', 'galerie']);

function urlValide(u) {
  const s = String(u || '').trim();
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(s)) return s;
  if (/^\/[a-z0-9/_.-]*$/i.test(s)) return s; // lien interne, ex. /galerie
  try {
    const x = new URL(s);
    return (x.protocol === 'https:' || x.protocol === 'http:') ? x.toString() : null;
  } catch { return null; }
}
const entierOuNull = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(+v) ? Math.round(+v) : null));
const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const aleatoire = (n = 8) => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; return Array.from(crypto.getRandomValues(new Uint8Array(n)), b => a[b % a.length]).join(''); };

// Jour au format AAAA-MM-JJ, à l'heure de Tahiti
const jourTahiti = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Pacific/Tahiti' });

async function empreinte(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || 'inconnu';
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + (env.SEL || 'tiare')))).slice(0, 24);
}

async function tropTot(env, cle, ms) {
  const maintenant = Date.now();
  const dernier = await env.DB.prepare('SELECT dernier FROM limites WHERE cle = ?').bind(cle).first('dernier');
  if (dernier && maintenant - dernier < ms) return true;
  await env.DB.prepare('INSERT INTO limites (cle, dernier) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET dernier = excluded.dernier')
    .bind(cle, maintenant).run();
  return false;
}

function autorise(request, env) {
  const cle = request.headers.get('x-cle') || '';
  if (!env.ADMIN_KEY || cle.length !== env.ADMIN_KEY.length) return false;
  let diff = 0;
  for (let i = 0; i < cle.length; i++) diff |= cle.charCodeAt(i) ^ env.ADMIN_KEY.charCodeAt(i);
  return diff === 0;
}

// Mots de passe des fichiers privés : PBKDF2 avec un sel aléatoire
async function hacher(mdp, selHex) {
  const sel = selHex ? Uint8Array.from(selHex.match(/../g).map(h => parseInt(h, 16))) : crypto.getRandomValues(new Uint8Array(16));
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(mdp), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sel, iterations: 100000 }, cle, 256);
  return hex(sel) + ':' + hex(bits);
}
async function mdpCorrect(mdp, stocke) {
  const [sel, attendu] = String(stocke).split(':');
  const calcule = (await hacher(mdp, sel)).split(':')[1];
  let diff = calcule.length ^ attendu.length;
  for (let i = 0; i < Math.min(calcule.length, attendu.length); i++) diff |= calcule.charCodeAt(i) ^ attendu.charCodeAt(i);
  return diff === 0;
}

const compteur = (env, nom) => env.DB.prepare('SELECT valeur FROM compteurs WHERE nom = ?').bind(nom).first('valeur');
const statJour = (env, cle, n = 1) => env.DB.prepare(
  'INSERT INTO stats_jour (jour, cle, valeur) VALUES (?, ?, ?) ON CONFLICT(jour, cle) DO UPDATE SET valeur = valeur + excluded.valeur'
).bind(jourTahiti(), cle, n).run().catch(() => {});
const reglage = (env, cle) => env.DB.prepare('SELECT valeur FROM reglages WHERE cle = ?').bind(cle).first('valeur');
const ecrireReglage = (env, cle, valeur) => env.DB.prepare(
  'INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur'
).bind(cle, valeur).run();

// Notification sur le téléphone via ntfy (si NTFY_TOPIC est configuré)
function notifier(env, ctx, titre, message) {
  if (!env.NTFY_TOPIC) return;
  ctx.waitUntil(fetch('https://ntfy.sh/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: env.NTFY_TOPIC, title: titre, message: message.slice(0, 400), tags: ['hibiscus'], click: 'https://landrypf.com/admin' })
  }).catch(() => {}));
}

const urlFichier = (f) => `/f/${f.id}/${encodeURIComponent(f.nom)}`;
const fichierPublic = (f, now = Date.now()) => f && !f.mdp && (!f.expire || f.expire > now);

/* ================= Public ================= */

async function infos(env) {
  const [mauruuru, statut, titre, date, lien] = await Promise.all([
    compteur(env, 'mauruuru'), reglage(env, 'statut'),
    reglage(env, 'evt_titre'), reglage(env, 'evt_date'), reglage(env, 'evt_lien')
  ]);
  const d = +date || 0;
  const evenement = titre && d && d > Date.now() - 6 * 3600e3 ? { titre, date: d, lien: lien || '' } : null;
  return json({ mauruuru: mauruuru || 0, statut: statut || '', evenement }, { headers: { 'cache-control': 'public, max-age=15' } });
}

async function mauruuru(request, env, ctx) {
  if (await tropTot(env, 'm:' + await empreinte(request, env), 10_000)) {
    return json({ mauruuru: (await compteur(env, 'mauruuru')) || 0, limite: true });
  }
  const r = await env.DB.prepare(
    "INSERT INTO compteurs (nom, valeur) VALUES ('mauruuru', 1) ON CONFLICT(nom) DO UPDATE SET valeur = valeur + 1 RETURNING valeur"
  ).first('valeur');
  ctx.waitUntil(statJour(env, 'mauruuru'));
  return json({ mauruuru: r });
}

async function livreLire(env) {
  const { results } = await env.DB.prepare("SELECT nom, texte, cree FROM messages WHERE statut = 'ok' ORDER BY cree DESC LIMIT 30").all();
  return json({ messages: results }, { headers: { 'cache-control': 'public, max-age=30' } });
}

async function livreEcrire(request, env, ctx) {
  let c; try { c = await request.json(); } catch { return erreur('format'); }
  if (c.site) return json({ ok: true }); // piège à robots
  const nom = nettoyer(c.nom, 30), texte = nettoyer(c.texte, 200);
  if (!nom || !texte) return erreur('vide');
  if (/(https?:\/\/|www\.)/i.test(nom + ' ' + texte)) return erreur('liens');
  if (await tropTot(env, 'l:' + await empreinte(request, env), 60_000)) return erreur('trop-vite', 429);
  await env.DB.prepare("INSERT INTO messages (nom, texte, cree, statut) VALUES (?, ?, ?, 'attente')").bind(nom, texte, Date.now()).run();
  notifier(env, ctx, `Livre d'or : ${nom}`, texte);
  return json({ ok: true });
}

async function contact(request, env, ctx) {
  let c; try { c = await request.json(); } catch { return erreur('format'); }
  if (c.site) return json({ ok: true });
  const nom = nettoyer(c.nom, 40), email = nettoyer(c.email, 120), message = nettoyerTexte(c.message, 1500);
  if (!nom || !message) return erreur('vide');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erreur('email');
  if (await tropTot(env, 'c:' + await empreinte(request, env), 120_000)) return erreur('trop-vite', 429);
  await env.DB.prepare('INSERT INTO contacts (nom, email, message, cree) VALUES (?, ?, ?, ?)').bind(nom, email, message, Date.now()).run();
  notifier(env, ctx, `Message de ${nom}`, message + (email ? `\n\nRépondre : ${email}` : ''));
  return json({ ok: true });
}

async function liensBio(env) {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    'SELECT id, titre, sous_titre, icone FROM liens WHERE actif = 1 AND (debut IS NULL OR debut <= ?) AND (fin IS NULL OR fin > ?) ORDER BY ordre, id'
  ).bind(now, now).all();
  return json({ liens: results }, { headers: { 'cache-control': 'public, max-age=20' } });
}

async function vue(request, env) {
  let page = '';
  try { page = (await request.json()).page; } catch {}
  const ua = request.headers.get('user-agent') || '';
  if (PAGES_VUES.has(page) && !/bot|crawl|spider|preview|facebookexternalhit|slurp/i.test(ua)) await statJour(env, 'vue:' + page);
  return new Response(null, { status: 204 });
}

async function galerie(env) {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    'SELECT id, nom, legende, type FROM fichiers WHERE galerie = 1 AND mdp IS NULL AND (expire IS NULL OR expire > ?) ORDER BY ordre, cree DESC'
  ).bind(now).all();
  return json({ photos: results.map(f => ({ ...f, url: urlFichier(f) })) }, { headers: { 'cache-control': 'public, max-age=30' } });
}

async function photosAccueil(env) {
  const { results } = await env.DB.prepare(
    "SELECT r.cle AS cle, f.id AS id, f.nom AS nom, f.mdp AS mdp, f.expire AS expire FROM reglages r JOIN fichiers f ON f.id = r.valeur WHERE r.cle LIKE 'photo:%'"
  ).all();
  const now = Date.now(), photos = {};
  for (const r of results) if (fichierPublic(r, now)) photos[r.cle.slice(6)] = urlFichier(r);
  return json({ photos }, { headers: { 'cache-control': 'public, max-age=30' } });
}

async function ouvrirLienBio(id, env, ctx, origine) {
  const url = await env.DB.prepare('SELECT url FROM liens WHERE id = ? AND actif = 1').bind(id).first('url');
  if (!url) return null;
  ctx.waitUntil(Promise.all([env.DB.prepare('UPDATE liens SET clics = clics + 1 WHERE id = ?').bind(id).run().catch(() => {}), statJour(env, 'clic')]));
  return Response.redirect(new URL(url, origine).toString(), 302);
}

async function ouvrirLienCourt(code, env, ctx, origine) {
  const url = await env.DB.prepare('SELECT url FROM raccourcis WHERE code = ?').bind(code).first('url');
  if (!url) return null;
  ctx.waitUntil(Promise.all([env.DB.prepare('UPDATE raccourcis SET clics = clics + 1 WHERE code = ?').bind(code).run().catch(() => {}), statJour(env, 'court')]));
  return Response.redirect(new URL(url, origine).toString(), 302);
}

/* ================= Fichiers ================= */

function pageSimple(titre, contenu, status = 200) {
  return new Response(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${echappe(titre)} · Landry</title><link rel="icon" href="/favicon.ico">
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#B3212E;color:#fff;font:17px/1.5 system-ui,sans-serif;padding:24px;box-sizing:border-box}
main{max-width:360px;width:100%;text-align:center}h1{font:400 2rem/1.1 Georgia,serif;margin:0 0 .5rem}p{margin:0 0 1.25rem;color:#F6E3E1}
input{font:inherit;font-size:16px;width:100%;box-sizing:border-box;padding:.8rem 1rem;border-radius:12px;border:0;margin-bottom:.75rem}
button,a.btn{font:inherit;font-weight:600;min-height:48px;width:100%;border:0;border-radius:999px;background:#fff;color:#B3212E;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
.err{color:#FFD7DC;font-weight:600}input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #fff;outline-offset:3px}</style></head>
<body><main><div style="font-size:2.5rem">🌺</div><h1>${echappe(titre)}</h1>${contenu}</main></body></html>`,
  { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

async function servirFichier(request, env, ctx, id) {
  if (!env.FICHIERS) return pageSimple('Bientôt', '<p>Le stockage de fichiers n\'est pas encore activé.</p>', 503);
  const f = await env.DB.prepare('SELECT * FROM fichiers WHERE id = ?').bind(id).first();
  if (!f) return pageSimple('Introuvable', '<p>Ce fichier n\'existe pas ou a été supprimé.</p><a class="btn" href="/">Aller sur le site</a>', 404);
  if (f.expire && f.expire <= Date.now()) return pageSimple('Lien expiré', '<p>Ce lien n\'est plus valable. Demande-moi un nouveau lien !</p><a class="btn" href="/bio">Mes liens</a>', 410);

  let protege = false;
  if (f.mdp) {
    protege = true;
    const formulaire = (msg = '') => pageSimple('Fichier protégé', `<p>Entre le mot de passe pour ouvrir <b>${echappe(f.nom)}</b>.</p>
      <form method="post"><input type="password" name="mdp" aria-label="Mot de passe" autocomplete="off" required autofocus><button>Ouvrir</button></form>
      ${msg ? `<p class="err" role="alert">${msg}</p>` : ''}`, msg ? 401 : 200);
    if (request.method !== 'POST') return formulaire();
    if (await tropTot(env, 'f:' + id + ':' + await empreinte(request, env), 1500)) return formulaire('Doucement… réessaie dans une seconde.');
    const mdp = String((await request.formData()).get('mdp') || '');
    if (!(await mdpCorrect(mdp, f.mdp))) return formulaire('Mot de passe incorrect.');
  }

  const avecPlage = !protege && request.headers.has('range');
  const obj = await env.FICHIERS.get(f.cle, avecPlage ? { range: request.headers } : undefined);
  if (!obj) return pageSimple('Introuvable', '<p>Ce fichier a disparu du stockage.</p>', 404);

  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('content-type', f.type || 'application/octet-stream');
  h.set('etag', obj.httpEtag);
  h.set('accept-ranges', protege ? 'none' : 'bytes');
  h.set('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.nom)}`);
  h.set('x-content-type-options', 'nosniff');
  h.set('cache-control', protege || f.expire ? 'private, no-store' : 'public, max-age=3600');
  if (f.type === 'text/html' || f.type === 'image/svg+xml') h.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");

  let status = 200;
  if (avecPlage && obj.range) {
    const r = obj.range;
    const debut = r.offset ?? (obj.size - r.suffix);
    const longueur = r.length ?? (obj.size - debut);
    h.set('content-range', `bytes ${debut}-${debut + longueur - 1}/${obj.size}`);
    h.set('content-length', String(longueur));
    status = 206;
    if (debut === 0) ctx.waitUntil(compterTelechargement(env, id));
  } else {
    h.set('content-length', String(obj.size));
    ctx.waitUntil(compterTelechargement(env, id));
  }
  return new Response(request.method === 'HEAD' ? null : obj.body, { status, headers: h });
}
const compterTelechargement = (env, id) => Promise.all([
  env.DB.prepare('UPDATE fichiers SET telechargements = telechargements + 1 WHERE id = ?').bind(id).run().catch(() => {}),
  statJour(env, 'telechargement')
]);

async function envoyerFichier(request, env) {
  if (!env.FICHIERS) return erreur("Le stockage R2 n'est pas encore activé.", 503);
  const taille = +request.headers.get('content-length') || 0;
  if (!taille) return erreur('Fichier vide.');
  if (taille > TAILLE_MAX) return erreur('Fichier trop lourd (100 Mo maximum).', 413);
  const p = new URL(request.url).searchParams;
  const nom = nettoyer(p.get('nom') || 'fichier', 120).replace(/[\\/]/g, '-') || 'fichier';
  const type = nettoyer(request.headers.get('content-type') || 'application/octet-stream', 100);
  const id = aleatoire(8);
  const cle = `f/${id}/${nom}`;
  await env.FICHIERS.put(cle, request.body, { httpMetadata: { contentType: type } });
  const mdp = request.headers.get('x-mdp');
  const expire = entierOuNull(p.get('expire'));
  const versGalerie = p.get('galerie') === '1' && type.startsWith('image/') ? 1 : 0;
  const ordre = versGalerie ? ((await env.DB.prepare('SELECT MAX(ordre) AS m FROM fichiers WHERE galerie = 1').first('m')) || 0) + 1 : 0;
  await env.DB.prepare('INSERT INTO fichiers (id, nom, cle, type, taille, cree, mdp, expire, galerie, legende, ordre) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, nom, cle, type, taille, Date.now(), mdp ? await hacher(mdp) : null, expire, versGalerie, nettoyer(p.get('legende'), 120), ordre).run();
  return json({ ok: true, id, url: `/f/${id}/${encodeURIComponent(nom)}` });
}

/* ================= Admin ================= */

async function adminLire(env) {
  const depuis = jourTahiti(Date.now() - 29 * 86400e3);
  const DB = env.DB;
  const [compteurs, reglages, attente, valides, liens, courts, fichiers, contacts, stats] = await Promise.all([
    DB.prepare('SELECT nom, valeur FROM compteurs').all(),
    DB.prepare('SELECT cle, valeur FROM reglages').all(),
    DB.prepare("SELECT id, nom, texte, cree FROM messages WHERE statut = 'attente' ORDER BY cree DESC").all(),
    DB.prepare("SELECT id, nom, texte, cree FROM messages WHERE statut = 'ok' ORDER BY cree DESC LIMIT 50").all(),
    DB.prepare('SELECT id, titre, sous_titre, url, icone, ordre, actif, clics, debut, fin FROM liens ORDER BY ordre, id').all(),
    DB.prepare('SELECT code, url, clics, cree FROM raccourcis ORDER BY cree DESC').all(),
    DB.prepare('SELECT id, nom, type, taille, cree, telechargements, (mdp IS NOT NULL) AS protege, expire, galerie, legende, ordre FROM fichiers ORDER BY cree DESC').all(),
    DB.prepare('SELECT id, nom, email, message, cree, lu FROM contacts ORDER BY cree DESC LIMIT 100').all(),
    DB.prepare('SELECT jour, cle, valeur FROM stats_jour WHERE jour >= ? ORDER BY jour').bind(depuis).all()
  ]);
  const r = Object.fromEntries(reglages.results.map(x => [x.cle, x.valeur]));
  const photos = {};
  for (const [k, v] of Object.entries(r)) if (k.startsWith('photo:')) photos[k.slice(6)] = v;
  return json({
    compteurs: Object.fromEntries(compteurs.results.map(x => [x.nom, x.valeur])),
    statut: r.statut || '',
    evenement: { titre: r.evt_titre || '', date: +r.evt_date || null, lien: r.evt_lien || '' },
    attente: attente.results, valides: valides.results,
    liens: liens.results, courts: courts.results,
    fichiers: fichiers.results.map(f => ({ ...f, protege: !!f.protege, url: urlFichier(f) })),
    contacts: contacts.results, photos, stats: stats.results, stockage: !!env.FICHIERS, notifications: !!env.NTFY_TOPIC
  });
}

async function deplacer(DB, table, filtre, id, sens) {
  const { results } = await DB.prepare(`SELECT id FROM ${table} ${filtre} ORDER BY ordre, id`).all();
  const ids = results.map(r => r.id);
  const i = ids.indexOf(id), j = i + (sens < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await DB.batch(ids.map((x, k) => DB.prepare(`UPDATE ${table} SET ordre = ? WHERE id = ?`).bind(k + 1, x)));
}

async function adminEcrire(request, env) {
  const c = await request.json();
  const DB = env.DB;
  switch (c.action) {
    case 'statut':
      await ecrireReglage(env, 'statut', nettoyer(c.valeur, 120));
      break;
    case 'valider':
      await DB.prepare("UPDATE messages SET statut = 'ok' WHERE id = ?").bind(c.id).run();
      break;
    case 'supprimer':
      await DB.prepare('DELETE FROM messages WHERE id = ?').bind(c.id).run();
      break;

    // --- Liens de la bio ---
    case 'lien_ajouter':
    case 'lien_modifier': {
      const titre = nettoyer(c.titre, 60), sous = nettoyer(c.sous_titre, 80), url = urlValide(c.url);
      const icone = ICONES.has(c.icone) ? c.icone : 'lien';
      const debut = entierOuNull(c.debut), fin = entierOuNull(c.fin);
      if (!titre) return erreur('Donne un titre au lien.');
      if (!url) return erreur("L'adresse doit commencer par https:// (ou mailto: pour un e-mail).");
      if (debut && fin && fin <= debut) return erreur('La date de fin doit être après la date de début.');
      if (c.action === 'lien_ajouter') {
        const max = (await DB.prepare('SELECT MAX(ordre) AS m FROM liens').first('m')) || 0;
        await DB.prepare('INSERT INTO liens (titre, sous_titre, url, icone, ordre, debut, fin) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(titre, sous, url, icone, max + 1, debut, fin).run();
      } else {
        await DB.prepare('UPDATE liens SET titre = ?, sous_titre = ?, url = ?, icone = ?, debut = ?, fin = ? WHERE id = ?')
          .bind(titre, sous, url, icone, debut, fin, c.id).run();
      }
      break;
    }
    case 'lien_supprimer':
      await DB.prepare('DELETE FROM liens WHERE id = ?').bind(c.id).run();
      break;
    case 'lien_basculer':
      await DB.prepare('UPDATE liens SET actif = 1 - actif WHERE id = ?').bind(c.id).run();
      break;
    case 'lien_bouger':
      await deplacer(DB, 'liens', '', c.id, c.sens);
      break;

    // --- Liens courts ---
    case 'court_ajouter': {
      const code = String(c.code || '').trim().toLowerCase();
      const url = urlValide(c.url);
      if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(code)) return erreur('Le code ne peut contenir que des lettres minuscules, des chiffres et des tirets.');
      if (RESERVES.has(code)) return erreur('Ce code est déjà utilisé par le site, choisis-en un autre.');
      if (!url) return erreur("L'adresse doit commencer par https://");
      const existe = await DB.prepare('SELECT 1 AS x FROM raccourcis WHERE code = ?').bind(code).first('x');
      if (existe && !c.remplacer) return erreur('Ce code existe déjà.');
      await DB.prepare('INSERT INTO raccourcis (code, url, clics, cree) VALUES (?, ?, 0, ?) ON CONFLICT(code) DO UPDATE SET url = excluded.url')
        .bind(code, url, Date.now()).run();
      break;
    }
    case 'court_supprimer':
      await DB.prepare('DELETE FROM raccourcis WHERE code = ?').bind(String(c.code)).run();
      break;

    // --- Prochain événement ---
    case 'evenement': {
      const titre = nettoyer(c.titre, 80), date = entierOuNull(c.date), lien = c.lien ? urlValide(c.lien) : '';
      if (c.lien && !lien) return erreur("Le lien de l'événement doit commencer par https://");
      if (titre && !date) return erreur("Indique la date de l'événement.");
      await DB.batch([
        DB.prepare("INSERT INTO reglages (cle, valeur) VALUES ('evt_titre', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").bind(titre),
        DB.prepare("INSERT INTO reglages (cle, valeur) VALUES ('evt_date', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").bind(titre ? String(date) : ''),
        DB.prepare("INSERT INTO reglages (cle, valeur) VALUES ('evt_lien', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").bind(titre ? lien : '')
      ]);
      break;
    }

    // --- Messages du formulaire de contact ---
    case 'contact_lu':
      await DB.prepare('UPDATE contacts SET lu = 1 - lu WHERE id = ?').bind(c.id).run();
      break;
    case 'contact_supprimer':
      await DB.prepare('DELETE FROM contacts WHERE id = ?').bind(c.id).run();
      break;

    // --- Fichiers ---
    case 'fichier_modifier': {
      const f = await DB.prepare('SELECT id, type FROM fichiers WHERE id = ?').bind(c.id).first();
      if (!f) return erreur('Fichier introuvable.');
      const champs = [], valeurs = [];
      if ('legende' in c) { champs.push('legende = ?'); valeurs.push(nettoyer(c.legende, 120)); }
      if ('expire' in c) { champs.push('expire = ?'); valeurs.push(entierOuNull(c.expire)); }
      if ('galerie' in c) {
        if (c.galerie && !String(f.type).startsWith('image/')) return erreur('Seules les images peuvent aller dans la galerie.');
        champs.push('galerie = ?'); valeurs.push(c.galerie ? 1 : 0);
        if (c.galerie) { champs.push('ordre = ?'); valeurs.push(((await DB.prepare('SELECT MAX(ordre) AS m FROM fichiers WHERE galerie = 1').first('m')) || 0) + 1); }
      }
      if ('mdp' in c) { champs.push('mdp = ?'); valeurs.push(c.mdp ? await hacher(String(c.mdp)) : null); }
      if (champs.length) await DB.prepare(`UPDATE fichiers SET ${champs.join(', ')} WHERE id = ?`).bind(...valeurs, c.id).run();
      break;
    }
    case 'fichier_bouger':
      await deplacer(DB, 'fichiers', 'WHERE galerie = 1', c.id, c.sens);
      break;
    case 'fichier_supprimer': {
      const f = await DB.prepare('SELECT cle FROM fichiers WHERE id = ?').bind(c.id).first();
      if (f && env.FICHIERS) await env.FICHIERS.delete(f.cle);
      await DB.batch([
        DB.prepare('DELETE FROM fichiers WHERE id = ?').bind(c.id),
        DB.prepare("DELETE FROM reglages WHERE cle LIKE 'photo:%' AND valeur = ?").bind(c.id)
      ]);
      break;
    }

    // --- Photos de la page d'accueil ---
    case 'photo_accueil': {
      if (!EMPLACEMENTS.has(c.emplacement)) return erreur('Emplacement inconnu.');
      if (!c.id) { await DB.prepare('DELETE FROM reglages WHERE cle = ?').bind('photo:' + c.emplacement).run(); break; }
      const f = await DB.prepare('SELECT type, mdp, expire FROM fichiers WHERE id = ?').bind(c.id).first();
      if (!f || !String(f.type).startsWith('image/')) return erreur('Choisis une image.');
      if (!fichierPublic(f)) return erreur("Cette image est privée ou expire : elle ne peut pas aller sur l'accueil.");
      await ecrireReglage(env, 'photo:' + c.emplacement, c.id);
      break;
    }

    default:
      return erreur('action inconnue');
  }
  return json({ ok: true });
}

/* ================= Aiguillage ================= */

export default {
  async fetch(request, env, ctx) {
    const { pathname, origin } = new URL(request.url);
    const m = request.method;
    try {
      if (pathname.startsWith('/api/')) {
        if (pathname === '/api/infos' && m === 'GET') return await infos(env);
        if (pathname === '/api/mauruuru' && m === 'POST') return await mauruuru(request, env, ctx);
        if (pathname === '/api/livredor' && m === 'GET') return await livreLire(env);
        if (pathname === '/api/livredor' && m === 'POST') return await livreEcrire(request, env, ctx);
        if (pathname === '/api/contact' && m === 'POST') return await contact(request, env, ctx);
        if (pathname === '/api/liens' && m === 'GET') return await liensBio(env);
        if (pathname === '/api/vue' && m === 'POST') return await vue(request, env);
        if (pathname === '/api/galerie' && m === 'GET') return await galerie(env);
        if (pathname === '/api/photos-accueil' && m === 'GET') return await photosAccueil(env);
        if (pathname === '/api/admin' || pathname === '/api/fichiers') {
          if (!autorise(request, env)) return erreur('non autorisé', 401);
          if (pathname === '/api/fichiers' && m === 'PUT') return await envoyerFichier(request, env);
          if (pathname === '/api/admin' && m === 'GET') return await adminLire(env);
          if (pathname === '/api/admin' && m === 'POST') return await adminEcrire(request, env);
        }
        return erreur('introuvable', 404);
      }

      // Fichier : /f/abc12345/nom.jpg
      const fichier = pathname.match(/^\/f\/([a-z0-9]{8})(?:\/.*)?$/);
      if (fichier && ['GET', 'HEAD', 'POST'].includes(m)) return await servirFichier(request, env, ctx, fichier[1]);

      // Lien de la bio : /l/3
      const bio = pathname.match(/^\/l\/(\d+)\/?$/);
      if (bio) { const r = await ouvrirLienBio(+bio[1], env, ctx, origin); if (r) return r; }

      // Lien court : /insta, /promo, /go/insta…
      const court = pathname.match(/^\/(?:go\/)?([a-z0-9][a-z0-9-]{0,39})\/?$/i);
      if (court && (m === 'GET' || m === 'HEAD')) {
        const r = await ouvrirLienCourt(court[1].toLowerCase(), env, ctx, origin);
        if (r) return r;
      }
    } catch (err) {
      console.error(err);
      return erreur('serveur', 500);
    }
    return env.ASSETS.fetch(request);
  }
};
