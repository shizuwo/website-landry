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
const RESERVES = new Set(['404', 'cadre', 'bio', 'admin', 'api', 'go', 'l', 'f', 'galerie', 'index', 'menu', 'icones', 'favicon', 'partage', 'site', 'apple-touch-icon',
  'icone-192', 'icone-512', 'monde', 'robots', 'sitemap', 'commun', 'album', 'mentions']);
const ICONES = new Set(['instagram', 'tiktok', 'youtube', 'facebook', 'snapchat', 'spotify', 'x', 'whatsapp', 'email', 'boutique', 'monde', 'lien']);
const EMPLACEMENTS = new Set(['p1', 'p2', 'p3', 'c1', 'c2', 'c3', 'c4', 'c5']);
const TAILLE_MAX = 100 * 1024 * 1024; // 100 Mo par fichier
const STOCKAGE_MAX = 10 * 1000 ** 3;    // 10 Go (offre gratuite R2)
const STOCKAGE_LIMITE = STOCKAGE_MAX - 50 * 1000 ** 2; // on bloque un peu avant, par sécurité
const PAGES_VUES = new Set(['accueil', 'bio', 'galerie']);
// Textes modifiables de la page d'accueil, avec leur longueur maximale
const TEXTES_ACCUEIL = {
  hero1: 12, hero2: 12, descends: 40, bande: 120, badge: 18, ile_mot: 10,
  p1_legende: 40, p2_legende: 40, p3_legende: 40, ile_texte: 300, tour_titre: 60, tour_note: 60,
  c1_titre: 24, c1_texte: 160, c2_titre: 24, c2_texte: 160, c3_titre: 24, c3_texte: 160, c4_titre: 24, c4_texte: 160, c5_titre: 24, c5_texte: 160,
  soir1: 80, soir2: 80, soir3: 80, soir4: 80, fin_titre: 14, fin_texte: 200
};
const THEMES = new Set(['auto', 'aucun', 'heiva', 'noel', 'nouvel_an']);
// Thème saisonnier automatique selon la date à Tahiti
function themeDuJour(t = Date.now()) {
  const [, m, j] = new Date(t).toLocaleDateString('en-CA', { timeZone: 'Pacific/Tahiti' }).split('-').map(Number);
  if (m === 7) return 'heiva';
  if (m === 12 && j <= 26) return 'noel';
  if ((m === 12 && j >= 27) || (m === 1 && j <= 5)) return 'nouvel_an';
  return '';
}

// Blocs intégrés : on reconnaît le service et on garde seulement l'identifiant utile
function analyserBloc(adresse) {
  let u; try { u = new URL(String(adresse).trim()); } catch { return null; }
  const h = u.hostname.replace(/^www\.|^m\./, ''), p = u.pathname;
  let m;
  if (h === 'instagram.com' && (m = p.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)/))) return { type: 'instagram', ref: `${m[1]}/${m[2]}` };
  if (h === 'tiktok.com' && (m = p.match(/\/video\/(\d+)/))) return { type: 'tiktok', ref: m[1] };
  if (h === 'youtu.be' && (m = p.match(/^\/([A-Za-z0-9_-]{6,})/))) return { type: 'youtube', ref: m[1] };
  if (h === 'youtube.com' || h === 'music.youtube.com') {
    if (u.searchParams.get('v')) return { type: 'youtube', ref: u.searchParams.get('v').replace(/[^A-Za-z0-9_-]/g, '') };
    if ((m = p.match(/^\/(shorts|embed|live)\/([A-Za-z0-9_-]+)/))) return { type: 'youtube', ref: m[2] };
  }
  if (h === 'open.spotify.com' && (m = p.match(/^\/(?:intl-[a-z]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/))) return { type: 'spotify', ref: `${m[1]}/${m[2]}` };
  if (h === 'soundcloud.com' && p.split('/').filter(Boolean).length >= 2) return { type: 'soundcloud', ref: `https://soundcloud.com${p}` };
  return null;
}

// Album privé : jeton signé, valable 30 jours, invalidé si le mot de passe change
async function signer(env, texte) {
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode((env.SEL || '') + (env.ADMIN_KEY || 'album')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(texte)));
}
async function jetonAlbum(env, empreinteMdp, duree = 30 * 864e5) {
  const fin = Date.now() + duree;
  return `${fin}.${await signer(env, fin + ':' + String(empreinteMdp).slice(0, 24))}`;
}
async function albumOuvert(request, env) {
  const c = (request.headers.get('cookie') || '').match(/(?:^|;\s*)album=([^;]+)/);
  if (!c) return false;
  const [fin, sig] = decodeURIComponent(c[1]).split('.');
  if (!fin || !sig || +fin < Date.now()) return false;
  const mdp = await reglage(env, 'album_mdp');
  const attendu = await signer(env, fin + ':' + String(mdp || 'admin').slice(0, 24));
  return attendu === sig;
}
const cookieAlbum = (valeur, maxAge) => `album=${encodeURIComponent(valeur)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

const lireJSON = (t, defaut) => { try { return t ? JSON.parse(t) : defaut; } catch { return defaut; } };

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

// Protection de l'admin : 5 mauvais mots de passe en 15 min → bloqué 15 min (et une notification)
const ESSAIS_MAX = 5, BLOCAGE_MS = 15 * 60e3;
async function gardeAdmin(request, env, ctx) {
  const fp = await empreinte(request, env), now = Date.now();
  const [kb, kn, kt] = ['xb:', 'xn:', 'xt:'].map(p => p + fp);
  const lignes = Object.fromEntries((await env.DB.prepare('SELECT cle, dernier FROM limites WHERE cle IN (?, ?, ?)').bind(kb, kn, kt).all()).results.map(r => [r.cle, r.dernier]));
  if (lignes[kb] > now) {
    const min = Math.ceil((lignes[kb] - now) / 60e3);
    return erreur(`Trop d'essais ratés. Réessaie dans ${min} min.`, 429);
  }
  if (autorise(request, env)) {
    if (lignes[kn]) await env.DB.prepare('DELETE FROM limites WHERE cle IN (?, ?, ?)').bind(kb, kn, kt).run();
    return null;
  }
  const debut = lignes[kt] && now - lignes[kt] < BLOCAGE_MS ? lignes[kt] : now;
  const essais = (debut === lignes[kt] ? (lignes[kn] || 0) : 0) + 1;
  const ecrire = (k, v) => env.DB.prepare('INSERT INTO limites (cle, dernier) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET dernier = excluded.dernier').bind(k, v);
  if (essais >= ESSAIS_MAX) {
    await env.DB.batch([ecrire(kb, now + BLOCAGE_MS), env.DB.prepare('DELETE FROM limites WHERE cle IN (?, ?)').bind(kn, kt)]);
    notifier(env, ctx, '🔒 Admin bloqué 15 min', `${ESSAIS_MAX} mauvais mots de passe d'affilée sur l'admin. Si ce n'était pas toi, rien à faire : l'accès est bloqué pour cet appareil.`);
    return erreur("Trop d'essais ratés. Réessaie dans 15 min.", 429);
  }
  await env.DB.batch([ecrire(kn, essais), ecrire(kt, debut)]);
  const reste = ESSAIS_MAX - essais;
  return erreur(`Mot de passe incorrect. Encore ${reste} essai${reste > 1 ? 's' : ''} avant un blocage de 15 min.`, 401);
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

// Recadrage d'une photo : point visé (x, y en %), zoom z (1 à 4), format a (galerie uniquement)
const FORMATS = new Set(['orig', '1', '4/5', '4/3']);
function lireCadre(v) {
  const c = lireJSON(v, null); if (!c) return null;
  const n = (x, min, max, d) => { x = Number(x); return Number.isFinite(x) ? Math.min(max, Math.max(min, Math.round(x * 100) / 100)) : d; };
  const r = { x: n(c.x, 0, 100, 50), y: n(c.y, 0, 100, 50), z: n(c.z, 1, 4, 1) };
  if (FORMATS.has(c.a)) r.a = c.a;
  return r;
}
const urlFichier = (f) => `/f/${f.id}/${encodeURIComponent(f.nom)}`;
const urlCourte = (f) => `/f/${f.id}`;
const actif = (v, defaut = true) => (v === null || v === undefined || v === '' ? defaut : v === '1');
const stockageUtilise = async (env) => (await env.DB.prepare('SELECT COALESCE(SUM(taille), 0) AS t FROM fichiers').first('t')) || 0;
const fichierPublic = (f, now = Date.now()) => f && !f.mdp && (!f.expire || f.expire > now);

/* ================= Public ================= */

async function infos(env) {
  const [mauruuru, { results }] = await Promise.all([
    compteur(env, 'mauruuru'),
    env.DB.prepare("SELECT cle, valeur FROM reglages WHERE cle IN ('statut','statuts','statut_hasard','evt_titre','evt_date','evt_lien','livre_actif','contact_actif','banniere_active','banniere_texte','banniere_lien','musique_active','musique_id','musique_titre','musique_artiste','playlist','banniere_debut','banniere_fin','live_actif','live_lien','live_texte','theme','legal_nom','legal_email','disposition')").all()
  ]);
  const r = Object.fromEntries(results.map(x => [x.cle, x.valeur]));
  const d = +r.evt_date || 0;
  const evenement = r.evt_titre && d && d > Date.now() - 6 * 3600e3 ? { titre: r.evt_titre, date: d, lien: r.evt_lien || '' } : null;
  const now = Date.now();
  const bDebut = +r.banniere_debut || 0, bFin = +r.banniere_fin || 0;
  const banniere = actif(r.banniere_active, false) && r.banniere_texte && (!bDebut || bDebut <= now) && (!bFin || bFin > now)
    ? { texte: r.banniere_texte, lien: r.banniere_lien || '' } : null;

  // Playlist (ou ancien morceau unique)
  let pistes = lireJSON(r.playlist, null);
  if (!Array.isArray(pistes) || !pistes.length) pistes = r.musique_id ? [{ id: r.musique_id, titre: r.musique_titre, artiste: r.musique_artiste }] : [];
  let musique = null;
  if (actif(r.musique_active, false) && pistes.length) {
    const ids = pistes.map(p => p.id).filter(Boolean);
    const { results: fs } = ids.length ? await env.DB.prepare(`SELECT id, nom, type, mdp, expire, album FROM fichiers WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all() : { results: [] };
    const parId = Object.fromEntries(fs.map(f => [f.id, f]));
    const liste = pistes.map(p => {
      const f = parId[p.id];
      if (!f || !String(f.type).startsWith('audio/') || !fichierPublic(f) || f.album) return null;
      return { url: urlFichier(f), titre: p.titre || f.nom.replace(/\.[a-z0-9]+$/i, ''), artiste: p.artiste || '' };
    }).filter(Boolean);
    if (liste.length) musique = { ...liste[0], pistes: liste };
  }

  const { results: blocs } = await env.DB.prepare('SELECT id, type, ref FROM blocs WHERE actif = 1 ORDER BY ordre, id').all();
  const theme = r.theme && r.theme !== 'auto' ? (r.theme === 'aucun' ? '' : r.theme) : themeDuJour(now);
  const live = actif(r.live_actif, false) ? { texte: r.live_texte || 'En direct', lien: r.live_lien || '' } : null;

  return json({
    mauruuru: mauruuru || 0, statut: r.statut || '', evenement, banniere, musique,
    statuts: actif(r.statut_hasard, false) ? lireJSON(r.statuts, []).filter(Boolean) : null,
    livre: actif(r.livre_actif), contact: actif(r.contact_actif),
    live, theme, blocs, disposition: r.disposition === 'liens' ? 'liens' : 'infos', legal: { nom: r.legal_nom || 'Landry', email: r.legal_email || '' }
  }, { headers: { 'cache-control': 'public, max-age=15' } });
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
  if (!actif(await reglage(env, 'livre_actif'))) return json({ messages: [], desactive: true });
  const { results } = await env.DB.prepare("SELECT id, nom, texte, cree, reactions FROM messages WHERE statut = 'ok' ORDER BY cree DESC LIMIT 30").all();
  return json({ messages: results }, { headers: { 'cache-control': 'public, max-age=30' } });
}

async function livreEcrire(request, env, ctx) {
  let c; try { c = await request.json(); } catch { return erreur('format'); }
  if (c.site) return json({ ok: true }); // piège à robots
  if (!actif(await reglage(env, 'livre_actif'))) return erreur('desactive', 403);
  const nom = nettoyer(c.nom, 30), texte = nettoyer(c.texte, 200);
  if (!nom || !texte) return erreur('vide');
  if (/(https?:\/\/|www\.)/i.test(nom + ' ' + texte)) return erreur('liens');
  if (await tropTot(env, 'l:' + await empreinte(request, env), 60_000)) return erreur('trop-vite', 429);
  await env.DB.prepare("INSERT INTO messages (nom, texte, cree, statut) VALUES (?, ?, ?, 'attente')").bind(nom, texte, Date.now()).run();
  notifier(env, ctx, `Livre d'or : ${nom}`, texte);
  return json({ ok: true });
}

async function reagir(request, env) {
  let c; try { c = await request.json(); } catch { return erreur('format'); }
  const id = +c.id;
  if (!id) return erreur('id');
  if (await tropTot(env, `r:${id}:` + await empreinte(request, env), 365 * 864e5)) {
    return json({ reactions: (await env.DB.prepare('SELECT reactions FROM messages WHERE id = ?').bind(id).first('reactions')) || 0, deja: true });
  }
  const r = await env.DB.prepare("UPDATE messages SET reactions = reactions + 1 WHERE id = ? AND statut = 'ok' RETURNING reactions").bind(id).first('reactions');
  return json({ reactions: r || 0 });
}

async function contact(request, env, ctx) {
  let c; try { c = await request.json(); } catch { return erreur('format'); }
  if (c.site) return json({ ok: true });
  if (!actif(await reglage(env, 'contact_actif'))) return erreur('desactive', 403);
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
    'SELECT id, nom, legende, type FROM fichiers WHERE galerie = 1 AND album = 0 AND mdp IS NULL AND (expire IS NULL OR expire > ?) ORDER BY ordre, cree DESC'
  ).bind(now).all();
  const { results: cadres } = await env.DB.prepare("SELECT cle, valeur FROM reglages WHERE cle LIKE 'cadre:f:%'").all();
  const parId = Object.fromEntries(cadres.map(c => [c.cle.slice(8), lireCadre(c.valeur)]));
  return json({ photos: results.map(f => ({ ...f, url: urlFichier(f), cadre: parId[f.id] || null })) }, { headers: { 'cache-control': 'public, max-age=30' } });
}

async function photosAccueil(env) {
  const { results } = await env.DB.prepare(
    "SELECT r.cle AS cle, f.id AS id, f.nom AS nom, f.mdp AS mdp, f.expire AS expire, f.album AS album FROM reglages r JOIN fichiers f ON f.id = r.valeur WHERE r.cle LIKE 'photo:%'"
  ).all();
  const now = Date.now(), photos = {};
  for (const r of results) if (fichierPublic(r, now) && !r.album) photos[r.cle.slice(6)] = urlFichier(r);
  const { results: cs } = await env.DB.prepare("SELECT cle, valeur FROM reglages WHERE cle LIKE 'cadre:%' AND cle NOT LIKE 'cadre:f:%'").all();
  const cadres = {};
  for (const c of cs) { const k = c.cle.slice(6); if (photos[k]) cadres[k] = lireCadre(c.valeur); }
  return json({ photos, cadres }, { headers: { 'cache-control': 'public, max-age=30' } });
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

/* ================= Album privé ================= */

async function albumConnexion(request, env) {
  let c; try { c = await request.json(); } catch { return erreur('format'); }
  const mdpStocke = await reglage(env, 'album_mdp');
  if (!mdpStocke) return erreur("L'album n'est pas encore ouvert.", 404);
  if (await tropTot(env, 'a:' + await empreinte(request, env), 1500)) return erreur('Doucement… réessaie dans une seconde.', 429);
  if (!(await mdpCorrect(String(c.mdp || ''), mdpStocke))) return erreur('Mot de passe incorrect.', 401);
  return json({ ok: true }, { headers: { 'set-cookie': cookieAlbum(await jetonAlbum(env, mdpStocke), 30 * 86400) } });
}
async function albumListe(request, env) {
  if (!(await reglage(env, 'album_mdp'))) return json({ ferme: true, photos: [] });
  if (!(await albumOuvert(request, env))) return erreur('verrouillé', 401);
  const { results } = await env.DB.prepare("SELECT id, nom, legende, type FROM fichiers WHERE album = 1 AND (expire IS NULL OR expire > ?) ORDER BY ordre, cree DESC").bind(Date.now()).all();
  return json({ photos: results.map(f => ({ ...f, url: urlFichier(f) })) }, { headers: { 'cache-control': 'private, no-store' } });
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

  if (f.album && !(await albumOuvert(request, env))) {
    return pageSimple('Photo privée', '<p>Cette photo fait partie de mon album privé.</p><a class="btn" href="/album">Ouvrir l\'album</a>', 403);
  }
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
  h.set('cache-control', protege || f.expire || f.album ? 'private, no-store' : 'public, max-age=3600');
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
  if ((await stockageUtilise(env)) + taille > STOCKAGE_LIMITE) return erreur('Stockage presque plein (10 Go) : supprime des fichiers avant d\'en envoyer de nouveaux.', 507);
  const p = new URL(request.url).searchParams;
  const nom = nettoyer(p.get('nom') || 'fichier', 120).replace(/[\\/]/g, '-') || 'fichier';
  const type = nettoyer(request.headers.get('content-type') || 'application/octet-stream', 100);
  const id = aleatoire(8);
  const cle = `f/${id}/${nom}`;
  await env.FICHIERS.put(cle, request.body, { httpMetadata: { contentType: type } });
  const mdp = request.headers.get('x-mdp');
  const expire = entierOuNull(p.get('expire'));
  await env.DB.prepare('INSERT INTO fichiers (id, nom, cle, type, taille, cree, mdp, expire, galerie, legende, ordre, vu_galerie) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, \'\', 0, 0)')
    .bind(id, nom, cle, type, taille, Date.now(), mdp ? await hacher(mdp) : null, expire).run();
  return json({ ok: true, id, url: urlCourte({ id }) });
}

/* ================= Nettoyage (chaque nuit + bouton dans l'admin) ================= */

async function nettoyerExpires(env) {
  const now = Date.now();
  const { results } = await env.DB.prepare('SELECT id, cle FROM fichiers WHERE expire IS NOT NULL AND expire <= ?').bind(now).all();
  if (env.FICHIERS && results.length) await env.FICHIERS.delete(results.map(f => f.cle));
  if (results.length) {
    const ids = results.map(f => f.id);
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM fichiers WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids),
      env.DB.prepare(`DELETE FROM reglages WHERE cle LIKE 'photo:%' AND valeur IN (${ids.map(() => '?').join(',')})`).bind(...ids)
    ]);
  }
  // Les messages de contact sont gardés un an au plus (comme indiqué dans les mentions légales)
  await env.DB.prepare('DELETE FROM contacts WHERE cree < ?').bind(now - 365 * 864e5).run();
  // Les traces anti-spam de plus de 2 jours ne servent plus (sauf les réactions, gardées un an)
  await env.DB.prepare("DELETE FROM limites WHERE dernier < ? AND cle NOT LIKE 'r:%'").bind(now - 2 * 864e5).run();
  await env.DB.prepare("DELETE FROM limites WHERE dernier < ?").bind(now - 366 * 864e5).run();
  return { supprimes: results.length };
}

/* ================= Google : robots.txt et plan du site ================= */

const ROBOTS = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /album
Disallow: /f/

Sitemap: https://landrypf.com/sitemap.xml
`;
async function planDuSite(env) {
  const pages = [['/', '1.0', 'weekly'], ['/bio', '0.9', 'weekly'], ['/galerie', '0.7', 'weekly'], ['/mentions', '0.2', 'yearly']];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(([u, p, f]) => `  <url><loc>https://landrypf.com${u}</loc><changefreq>${f}</changefreq><priority>${p}</priority></url>`).join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
}

/* ================= Admin ================= */

async function adminLire(env) {
  const depuis = jourTahiti(Date.now() - 29 * 86400e3);
  const DB = env.DB;
  const [compteurs, reglages, attente, valides, liens, courts, fichiers, contacts, stats] = await Promise.all([
    DB.prepare('SELECT nom, valeur FROM compteurs').all(),
    DB.prepare('SELECT cle, valeur FROM reglages').all(),
    DB.prepare("SELECT id, nom, texte, cree FROM messages WHERE statut = 'attente' ORDER BY cree DESC").all(),
    DB.prepare("SELECT id, nom, texte, cree, reactions FROM messages WHERE statut = 'ok' ORDER BY cree DESC LIMIT 100").all(),
    DB.prepare('SELECT id, titre, sous_titre, url, icone, ordre, actif, clics, debut, fin FROM liens ORDER BY ordre, id').all(),
    DB.prepare('SELECT code, url, clics, cree FROM raccourcis ORDER BY cree DESC').all(),
    DB.prepare('SELECT id, nom, type, taille, cree, telechargements, (mdp IS NOT NULL) AS protege, expire, galerie, legende, ordre, vu_galerie, album FROM fichiers ORDER BY cree DESC').all(),
    DB.prepare('SELECT id, nom, email, message, cree, lu FROM contacts ORDER BY cree DESC LIMIT 100').all(),
    DB.prepare('SELECT jour, cle, valeur FROM stats_jour WHERE jour >= ? ORDER BY jour').bind(depuis).all()
  ]);
  const { results: blocs } = await DB.prepare('SELECT id, url, type, ref, ordre, actif FROM blocs ORDER BY ordre, id').all();
  const r = Object.fromEntries(reglages.results.map(x => [x.cle, x.valeur]));
  const photos = {};
  const cadres = {};
  for (const [k, v] of Object.entries(r)) {
    if (k.startsWith('photo:')) photos[k.slice(6)] = v;
    if (k.startsWith('cadre:')) cadres[k.slice(6)] = lireCadre(v);
  }
  return json({
    compteurs: Object.fromEntries(compteurs.results.map(x => [x.nom, x.valeur])),
    statut: r.statut || '',
    evenement: { titre: r.evt_titre || '', date: +r.evt_date || null, lien: r.evt_lien || '' },
    attente: attente.results, valides: valides.results,
    liens: liens.results, courts: courts.results,
    fichiers: fichiers.results.map(f => ({ ...f, protege: !!f.protege, url: urlFichier(f), court: urlCourte(f) })),
    stockage_utilise: fichiers.results.reduce((a, f) => a + f.taille, 0), stockage_max: STOCKAGE_MAX,
    statuts: lireJSON(r.statuts, r.statut ? [r.statut] : []), statut_hasard: actif(r.statut_hasard, false),
    blocs,
    playlist: (() => { const p = lireJSON(r.playlist, null); return Array.isArray(p) ? p : (r.musique_id ? [{ id: r.musique_id, titre: r.musique_titre || '', artiste: r.musique_artiste || '' }] : []); })(),
    live: { actif: actif(r.live_actif, false), lien: r.live_lien || '', texte: r.live_texte || '' },
    theme: r.theme || 'auto', theme_du_jour: themeDuJour(), disposition: r.disposition === 'liens' ? 'liens' : 'infos',
    legal: { nom: r.legal_nom || '', email: r.legal_email || '' },
    album_ouvert: !!r.album_mdp,
    accueil_textes: lireJSON(r.accueil_textes, {}),
    site: {
      livre_actif: actif(r.livre_actif), contact_actif: actif(r.contact_actif),
      banniere_active: actif(r.banniere_active, false), banniere_texte: r.banniere_texte || '', banniere_lien: r.banniere_lien || '',
      banniere_debut: +r.banniere_debut || null, banniere_fin: +r.banniere_fin || null,
      musique_active: actif(r.musique_active, false), musique_id: r.musique_id || '', musique_titre: r.musique_titre || '', musique_artiste: r.musique_artiste || ''
    },
    contacts: contacts.results, photos, cadres, stats: stats.results, stockage: !!env.FICHIERS, notifications: !!env.NTFY_TOPIC
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

    // --- Phrases « En ce moment » ---
    case 'statuts': {
      const liste = (Array.isArray(c.liste) ? c.liste : []).map(x => nettoyer(x, 120)).filter(Boolean).slice(0, 50);
      await DB.batch([
        DB.prepare("INSERT INTO reglages (cle, valeur) VALUES ('statuts', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").bind(JSON.stringify(liste)),
        DB.prepare("INSERT INTO reglages (cle, valeur) VALUES ('statut', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").bind(liste[0] || ''),
        DB.prepare("INSERT INTO reglages (cle, valeur) VALUES ('statut_hasard', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").bind(c.hasard ? '1' : '0')
      ]);
      break;
    }

    // --- Textes de la page d'accueil ---
    case 'accueil_textes': {
      const propres = {};
      for (const [cle, max] of Object.entries(TEXTES_ACCUEIL)) {
        const v = c.textes && c.textes[cle];
        if (!v) continue;
        propres[cle] = cle === 'tour_titre' ? nettoyerTexte(v, max).replace(/\n{2,}/g, '\n') : nettoyer(v, max);
      }
      await ecrireReglage(env, 'accueil_textes', JSON.stringify(propres));
      break;
    }

    // --- Réglages du site (interrupteurs, bannière, musique) ---
    case 'reglages_site': {
      const v = (b) => (b ? '1' : '0');
      const lienBanniere = c.banniere_lien ? urlValide(c.banniere_lien) : '';
      if (c.banniere_lien && !lienBanniere) return erreur('Le lien de la bannière doit commencer par https:// ou /');
      if (c.banniere_active && !nettoyer(c.banniere_texte, 140)) return erreur('Écris le texte de la bannière.');
      const paires = [
        ['livre_actif', v(c.livre_actif)], ['contact_actif', v(c.contact_actif)],
        ['banniere_active', v(c.banniere_active)], ['banniere_texte', nettoyer(c.banniere_texte, 140)], ['banniere_lien', lienBanniere || ''],
        ['banniere_debut', String(entierOuNull(c.banniere_debut) || '')], ['banniere_fin', String(entierOuNull(c.banniere_fin) || '')],
        ['musique_active', v(c.musique_active)]
      ];
      await DB.batch(paires.map(([k, val]) => DB.prepare('INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').bind(k, val)));
      break;
    }

    // --- Playlist du lecteur ---
    case 'playlist': {
      const pistes = (Array.isArray(c.pistes) ? c.pistes : []).slice(0, 30).map(p => ({ id: String(p.id || ''), titre: nettoyer(p.titre, 80), artiste: nettoyer(p.artiste, 80) })).filter(p => p.id);
      if (pistes.length) {
        const { results } = await DB.prepare(`SELECT id, type, mdp, expire, album FROM fichiers WHERE id IN (${pistes.map(() => '?').join(',')})`).bind(...pistes.map(p => p.id)).all();
        const ok = new Set(results.filter(f => String(f.type).startsWith('audio/') && fichierPublic(f) && !f.album).map(f => f.id));
        const refus = pistes.find(p => !ok.has(p.id));
        if (refus) return erreur('Un des morceaux est protégé, expire ou n\'est pas un fichier audio.');
      }
      await ecrireReglage(env, 'playlist', JSON.stringify(pistes));
      break;
    }

    // --- Badge « en direct » ---
    case 'live': {
      const lien = c.lien ? urlValide(c.lien) : '';
      if (c.lien && !lien) return erreur('Le lien du direct doit commencer par https://');
      await DB.batch([['live_actif', c.actif ? '1' : '0'], ['live_lien', lien || ''], ['live_texte', nettoyer(c.texte, 40)]]
        .map(([k, val]) => DB.prepare('INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').bind(k, val)));
      break;
    }

    // --- Disposition de la bio ---
    case 'disposition':
      if (!['infos', 'liens'].includes(c.valeur)) return erreur('Disposition inconnue.');
      await ecrireReglage(env, 'disposition', c.valeur);
      break;

    // --- Thème saisonnier ---
    case 'theme':
      if (!THEMES.has(c.valeur)) return erreur('Thème inconnu.');
      await ecrireReglage(env, 'theme', c.valeur);
      break;

    // --- Mentions légales ---
    case 'legal': {
      const email = nettoyer(c.email, 120);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erreur("L'adresse e-mail n'a pas l'air correcte.");
      await DB.batch([['legal_nom', nettoyer(c.nom, 60)], ['legal_email', email]]
        .map(([k, val]) => DB.prepare('INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').bind(k, val)));
      break;
    }

    // --- Blocs intégrés (Instagram, TikTok, YouTube, Spotify, SoundCloud) ---
    case 'bloc_ajouter': {
      const b = analyserBloc(c.url);
      if (!b) return erreur("Ce lien n'est pas reconnu. Colle le lien d'une publication Instagram, d'une vidéo TikTok ou YouTube, ou d'un titre Spotify ou SoundCloud.");
      const max = (await DB.prepare('SELECT MAX(ordre) AS m FROM blocs').first('m')) || 0;
      await DB.prepare('INSERT INTO blocs (url, type, ref, ordre, cree) VALUES (?, ?, ?, ?, ?)').bind(String(c.url).trim().slice(0, 400), b.type, b.ref, max + 1, Date.now()).run();
      break;
    }
    case 'bloc_basculer':
      await DB.prepare('UPDATE blocs SET actif = 1 - actif WHERE id = ?').bind(c.id).run();
      break;
    case 'bloc_supprimer':
      await DB.prepare('DELETE FROM blocs WHERE id = ?').bind(c.id).run();
      break;

    // --- Réordonner par glisser-déposer ---
    case 'ordonner': {
      const tables = { liens: ['liens', ''], blocs: ['blocs', ''], galerie: ['fichiers', ' AND galerie = 1'], album: ['fichiers', ' AND album = 1'] };
      const t = tables[c.cible];
      if (!t || !Array.isArray(c.ids)) return erreur('Ordre invalide.');
      await DB.batch(c.ids.slice(0, 500).map((id, k) => DB.prepare(`UPDATE ${t[0]} SET ordre = ? WHERE id = ?${t[1]}`).bind(k + 1, id)));
      break;
    }

    // --- Album privé ---
    case 'album_mdp': {
      if (c.fermer) { await DB.prepare("DELETE FROM reglages WHERE cle = 'album_mdp'").run(); break; }
      const mdp = String(c.mdp || '');
      if (mdp.length < 4) return erreur('Choisis un mot de passe d\'au moins 4 caractères.');
      await ecrireReglage(env, 'album_mdp', await hacher(mdp));
      break;
    }

    // --- Nettoyage manuel ---
    case 'nettoyer':
      return json({ ok: true, ...(await nettoyerExpires(env)) });

    // --- Galerie : photos à valider ---
    case 'galerie_decider': {
      const f = await DB.prepare('SELECT type FROM fichiers WHERE id = ?').bind(c.id).first();
      if (!f) return erreur('Fichier introuvable.');
      const vers = c.vers || (c.ajouter ? 'galerie' : '');
      if (vers === 'galerie' || vers === 'album') {
        if (!String(f.type).startsWith('image/')) return erreur('Seules les images peuvent aller dans la galerie ou l\'album.');
        const col = vers === 'galerie' ? 'galerie' : 'album';
        const ordre = ((await DB.prepare(`SELECT MAX(ordre) AS m FROM fichiers WHERE ${col} = 1`).first('m')) || 0) + 1;
        await DB.prepare(`UPDATE fichiers SET galerie = ?, album = ?, vu_galerie = 1, ordre = ? WHERE id = ?`).bind(vers === 'galerie' ? 1 : 0, vers === 'album' ? 1 : 0, ordre, c.id).run();
      } else {
        await DB.prepare('UPDATE fichiers SET vu_galerie = 1 WHERE id = ?').bind(c.id).run();
      }
      break;
    }

    // --- Fichiers ---
    case 'fichier_modifier': {
      const f = await DB.prepare('SELECT id, type FROM fichiers WHERE id = ?').bind(c.id).first();
      if (!f) return erreur('Fichier introuvable.');
      const champs = [], valeurs = [];
      if ('nom' in c) {
        const nom = nettoyer(c.nom, 120).replace(/[\\/]/g, '-');
        if (!nom) return erreur('Le nom ne peut pas être vide.');
        champs.push('nom = ?'); valeurs.push(nom);
      }
      if ('legende' in c) { champs.push('legende = ?'); valeurs.push(nettoyer(c.legende, 120)); }
      if ('expire' in c) { champs.push('expire = ?'); valeurs.push(entierOuNull(c.expire)); }
      if ('galerie' in c) {
        if (c.galerie && !String(f.type).startsWith('image/')) return erreur('Seules les images peuvent aller dans la galerie.');
        champs.push('galerie = ?', 'vu_galerie = 1'); valeurs.push(c.galerie ? 1 : 0);
        if (c.galerie) { champs.push('ordre = ?'); valeurs.push(((await DB.prepare('SELECT MAX(ordre) AS m FROM fichiers WHERE galerie = 1').first('m')) || 0) + 1); }
      }
      if ('album' in c) {
        if (c.album && !String(f.type).startsWith('image/')) return erreur("Seules les images peuvent aller dans l'album privé.");
        champs.push('album = ?', 'vu_galerie = 1'); valeurs.push(c.album ? 1 : 0);
        if (c.album) { champs.push('galerie = 0'); }
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
        DB.prepare("DELETE FROM reglages WHERE cle LIKE 'photo:%' AND valeur = ?").bind(c.id),
        DB.prepare('DELETE FROM reglages WHERE cle = ?').bind('cadre:f:' + c.id)
      ]);
      break;
    }

    // --- Recadrage (emplacement de l'accueil ou photo de la galerie) ---
    case 'cadrage': {
      const cible = String(c.cible || '');
      if (!EMPLACEMENTS.has(cible) && !/^f:[\w-]{1,40}$/.test(cible)) return erreur('Photo inconnue.');
      if (c.effacer) { await DB.prepare('DELETE FROM reglages WHERE cle = ?').bind('cadre:' + cible).run(); break; }
      const cadre = lireCadre(JSON.stringify(c));
      if (!cadre) return erreur('Recadrage invalide.');
      if (!cible.startsWith('f:')) delete cadre.a;
      await ecrireReglage(env, 'cadre:' + cible, JSON.stringify(cadre));
      break;
    }

    // --- Photos de la page d'accueil ---
    case 'photo_accueil': {
      if (!EMPLACEMENTS.has(c.emplacement)) return erreur('Emplacement inconnu.');
      await DB.prepare('DELETE FROM reglages WHERE cle = ?').bind('cadre:' + c.emplacement).run(); // nouvelle photo : recadrage remis à zéro
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

async function exporter(env) {
  const tables = ['compteurs', 'reglages', 'messages', 'liens', 'raccourcis', 'stats_jour', 'fichiers', 'contacts', 'blocs'];
  const donnees = {};
  for (const t of tables) donnees[t] = (await env.DB.prepare(`SELECT * FROM ${t}`).all()).results;
  // On ne met pas les mots de passe (même chiffrés) dans la sauvegarde
  donnees.reglages = donnees.reglages.filter(r => r.cle !== 'album_mdp');
  donnees.fichiers = donnees.fichiers.map(({ mdp, ...f }) => ({ ...f, protege: !!mdp }));
  const jour = jourTahiti();
  return new Response(JSON.stringify({ site: 'landrypf.com', date: new Date().toISOString(), note: 'Les fichiers eux-mêmes (photos, sons…) restent dans le stockage R2 et ne sont pas inclus.', donnees }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="landry-sauvegarde-${jour}.json"`, 'cache-control': 'no-store' }
  });
}

/* ================= Page d'accueil personnalisée ================= */

async function pageAccueil(request, env) {
  const reponse = await env.ASSETS.fetch(request);
  if (!reponse.ok || !(reponse.headers.get('content-type') || '').includes('text/html')) return reponse;
  let textes = {};
  try { textes = lireJSON(await reglage(env, 'accueil_textes'), {}); } catch {}
  if (!Object.keys(textes).length) return reponse;
  const h = new Headers(reponse.headers);
  h.delete('etag'); h.set('cache-control', 'no-cache');
  return new HTMLRewriter().on('[data-txt]', {
    element(el) {
      const cle = el.getAttribute('data-txt'), v = textes[cle];
      if (!v) return;
      if (cle === 'tour_titre') el.setInnerContent(String(v).split(/\n+/).map(echappe).join('<br>'), { html: true });
      else el.setInnerContent(String(v));
    }
  }).transform(new Response(reponse.body, { status: reponse.status, headers: h }));
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
        if (pathname === '/api/livredor/reagir' && m === 'POST') return await reagir(request, env);
        if (pathname === '/api/album' && m === 'GET') return await albumListe(request, env);
        if (pathname === '/api/album' && m === 'POST') return await albumConnexion(request, env);
        if (pathname === '/api/album/sortie' && m === 'POST') return json({ ok: true }, { headers: { 'set-cookie': cookieAlbum('', 0) } });
        if (pathname === '/api/liens' && m === 'GET') return await liensBio(env);
        if (pathname === '/api/vue' && m === 'POST') return await vue(request, env);
        if (pathname === '/api/galerie' && m === 'GET') return await galerie(env);
        if (pathname === '/api/photos-accueil' && m === 'GET') return await photosAccueil(env);
        if (pathname === '/api/admin' || pathname === '/api/fichiers' || pathname.startsWith('/api/admin/')) {
          const refus = await gardeAdmin(request, env, ctx); if (refus) return refus;
          if (pathname === '/api/admin/export' && m === 'GET') return await exporter(env);
          // L'admin peut voir les photos de l'album dans son interface
          if (pathname === '/api/admin/album' && m === 'POST') return json({ ok: true }, { headers: { 'set-cookie': cookieAlbum(await jetonAlbum(env, (await reglage(env, 'album_mdp')) || 'admin', 864e5), 86400) } });
          if (pathname === '/api/fichiers' && m === 'PUT') return await envoyerFichier(request, env);
          if (pathname === '/api/admin' && m === 'GET') return await adminLire(env);
          if (pathname === '/api/admin' && m === 'POST') return await adminEcrire(request, env);
        }
        return erreur('introuvable', 404);
      }

      if ((pathname === '/' || pathname === '/index.html') && (m === 'GET' || m === 'HEAD')) return await pageAccueil(request, env);

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
    if (pathname === '/sitemap.xml') return planDuSite(env);
    if (pathname === '/robots.txt') return new Response(ROBOTS, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
    const reponse = await env.ASSETS.fetch(request);
    // Page introuvable : la jolie page 404 (avec le bon code pour Google)
    if (reponse.status === 404 && (m === 'GET' || m === 'HEAD')) {
      const page = await env.ASSETS.fetch(new Request(new URL('/404', request.url)));
      return new Response(page.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return reponse;
  },

  // Chaque nuit : suppression des fichiers expirés et des vieilles traces anti-spam
  async scheduled(event, env, ctx) {
    ctx.waitUntil(nettoyerExpires(env));
  }
};
