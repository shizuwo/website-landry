// Worker du site de Landry : sert les pages (dossier public) et gère
// le compteur Mauruuru, le livre d'or, les liens de la bio, les liens courts et l'admin.

const json = (data, init = {}) => Response.json(data, init);
const nettoyer = (s, max) => String(s || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Codes de liens courts interdits (déjà utilisés par le site)
const RESERVES = new Set(['bio', 'admin', 'api', 'go', 'l', 'index', 'menu', 'favicon', 'partage', 'site', 'apple-touch-icon', 'icone-192', 'icone-512', 'monde', 'robots', 'sitemap']);
const ICONES = new Set(['instagram', 'tiktok', 'youtube', 'facebook', 'snapchat', 'spotify', 'x', 'whatsapp', 'email', 'boutique', 'monde', 'lien']);

function urlValide(u) {
  const s = String(u || '').trim();
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(s)) return s;
  try {
    const x = new URL(s);
    return (x.protocol === 'https:' || x.protocol === 'http:') ? x.toString() : null;
  } catch { return null; }
}

// Empreinte anonyme du visiteur (l'IP n'est jamais stockée telle quelle)
async function empreinte(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || 'inconnu';
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + (env.SEL || 'tiare')));
  return [...new Uint8Array(h)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Limite : renvoie true si ce visiteur a déjà agi il y a moins de `ms`
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

const compteur = (env, nom) => env.DB.prepare('SELECT valeur FROM compteurs WHERE nom = ?').bind(nom).first('valeur');

/* ---------- Public ---------- */

async function infos(env) {
  const [mauruuru, statut] = await Promise.all([
    compteur(env, 'mauruuru'),
    env.DB.prepare("SELECT valeur FROM reglages WHERE cle = 'statut'").first('valeur')
  ]);
  return json({ mauruuru: mauruuru || 0, statut: statut || '' }, { headers: { 'cache-control': 'public, max-age=15' } });
}

async function mauruuru(request, env) {
  if (await tropTot(env, 'm:' + await empreinte(request, env), 10_000)) {
    return json({ mauruuru: (await compteur(env, 'mauruuru')) || 0, limite: true });
  }
  const r = await env.DB.prepare(
    "INSERT INTO compteurs (nom, valeur) VALUES ('mauruuru', 1) ON CONFLICT(nom) DO UPDATE SET valeur = valeur + 1 RETURNING valeur"
  ).first('valeur');
  return json({ mauruuru: r });
}

async function livreLire(env) {
  const { results } = await env.DB.prepare(
    "SELECT nom, texte, cree FROM messages WHERE statut = 'ok' ORDER BY cree DESC LIMIT 30"
  ).all();
  return json({ messages: results }, { headers: { 'cache-control': 'public, max-age=30' } });
}

async function livreEcrire(request, env) {
  let corps;
  try { corps = await request.json(); } catch { return json({ erreur: 'format' }, { status: 400 }); }
  if (corps.site) return json({ ok: true }); // piège à robots
  const nom = nettoyer(corps.nom, 30), texte = nettoyer(corps.texte, 200);
  if (!nom || !texte) return json({ erreur: 'vide' }, { status: 400 });
  if (/(https?:\/\/|www\.)/i.test(nom + ' ' + texte)) return json({ erreur: 'liens' }, { status: 400 });
  if (await tropTot(env, 'l:' + await empreinte(request, env), 60_000)) return json({ erreur: 'trop-vite' }, { status: 429 });
  await env.DB.prepare("INSERT INTO messages (nom, texte, cree, statut) VALUES (?, ?, ?, 'attente')").bind(nom, texte, Date.now()).run();
  return json({ ok: true });
}

// Les liens visibles sur la page bio (sans l'adresse : on passe par /l/<id> pour compter les clics)
async function liensBio(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, titre, sous_titre, icone FROM liens WHERE actif = 1 ORDER BY ordre, id'
  ).all();
  return json({ liens: results }, { headers: { 'cache-control': 'public, max-age=20' } });
}

async function ouvrirLienBio(id, env, ctx) {
  const url = await env.DB.prepare('SELECT url FROM liens WHERE id = ? AND actif = 1').bind(id).first('url');
  if (!url) return null;
  ctx.waitUntil(env.DB.prepare('UPDATE liens SET clics = clics + 1 WHERE id = ?').bind(id).run().catch(() => {}));
  return Response.redirect(url, 302);
}

async function ouvrirLienCourt(code, env, ctx) {
  const url = await env.DB.prepare('SELECT url FROM raccourcis WHERE code = ?').bind(code).first('url');
  if (!url) return null;
  ctx.waitUntil(env.DB.prepare('UPDATE raccourcis SET clics = clics + 1 WHERE code = ?').bind(code).run().catch(() => {}));
  return Response.redirect(url, 302);
}

/* ---------- Admin ---------- */

async function adminLire(env) {
  const [compteurs, statut, attente, valides, liens, courts] = await Promise.all([
    env.DB.prepare('SELECT nom, valeur FROM compteurs').all(),
    env.DB.prepare("SELECT valeur FROM reglages WHERE cle = 'statut'").first('valeur'),
    env.DB.prepare("SELECT id, nom, texte, cree FROM messages WHERE statut = 'attente' ORDER BY cree DESC").all(),
    env.DB.prepare("SELECT id, nom, texte, cree FROM messages WHERE statut = 'ok' ORDER BY cree DESC LIMIT 50").all(),
    env.DB.prepare('SELECT id, titre, sous_titre, url, icone, ordre, actif, clics FROM liens ORDER BY ordre, id').all(),
    env.DB.prepare('SELECT code, url, clics, cree FROM raccourcis ORDER BY cree DESC').all()
  ]);
  return json({
    compteurs: Object.fromEntries(compteurs.results.map(r => [r.nom, r.valeur])),
    statut: statut || '', attente: attente.results, valides: valides.results,
    liens: liens.results, courts: courts.results
  });
}

const erreur = (msg) => json({ erreur: msg }, { status: 400 });

async function adminEcrire(request, env) {
  const c = await request.json();
  const DB = env.DB;
  switch (c.action) {
    case 'statut':
      await DB.prepare("INSERT INTO reglages (cle, valeur) VALUES ('statut', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur")
        .bind(nettoyer(c.valeur, 120)).run();
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
      if (!titre) return erreur('Donne un titre au lien.');
      if (!url) return erreur("L'adresse doit commencer par https:// (ou mailto: pour un e-mail).");
      if (c.action === 'lien_ajouter') {
        const max = (await DB.prepare('SELECT MAX(ordre) AS m FROM liens').first('m')) || 0;
        await DB.prepare('INSERT INTO liens (titre, sous_titre, url, icone, ordre) VALUES (?, ?, ?, ?, ?)').bind(titre, sous, url, icone, max + 1).run();
      } else {
        await DB.prepare('UPDATE liens SET titre = ?, sous_titre = ?, url = ?, icone = ? WHERE id = ?').bind(titre, sous, url, icone, c.id).run();
      }
      break;
    }
    case 'lien_supprimer':
      await DB.prepare('DELETE FROM liens WHERE id = ?').bind(c.id).run();
      break;
    case 'lien_basculer':
      await DB.prepare('UPDATE liens SET actif = 1 - actif WHERE id = ?').bind(c.id).run();
      break;
    case 'lien_bouger': {
      const { results } = await DB.prepare('SELECT id FROM liens ORDER BY ordre, id').all();
      const ids = results.map(r => r.id);
      const i = ids.indexOf(c.id), j = i + (c.sens < 0 ? -1 : 1);
      if (i < 0 || j < 0 || j >= ids.length) break;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await DB.batch(ids.map((id, k) => DB.prepare('UPDATE liens SET ordre = ? WHERE id = ?').bind(k + 1, id)));
      break;
    }

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

    default:
      return erreur('action inconnue');
  }
  return json({ ok: true });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const m = request.method;
    try {
      if (pathname === '/api/infos' && m === 'GET') return await infos(env);
      if (pathname === '/api/mauruuru' && m === 'POST') return await mauruuru(request, env);
      if (pathname === '/api/livredor' && m === 'GET') return await livreLire(env);
      if (pathname === '/api/livredor' && m === 'POST') return await livreEcrire(request, env);
      if (pathname === '/api/liens' && m === 'GET') return await liensBio(env);
      if (pathname === '/api/admin') {
        if (!autorise(request, env)) return json({ erreur: 'non autorisé' }, { status: 401 });
        if (m === 'GET') return await adminLire(env);
        if (m === 'POST') return await adminEcrire(request, env);
      }
      if (pathname.startsWith('/api/')) return json({ erreur: 'introuvable' }, { status: 404 });

      // Lien de la bio : /l/3
      const bio = pathname.match(/^\/l\/(\d+)\/?$/);
      if (bio) { const r = await ouvrirLienBio(+bio[1], env, ctx); if (r) return r; }

      // Lien court : /insta, /promo, /go/insta…
      const court = pathname.match(/^\/(?:go\/)?([a-z0-9][a-z0-9-]{0,39})\/?$/i);
      if (court && (m === 'GET' || m === 'HEAD')) {
        const r = await ouvrirLienCourt(court[1].toLowerCase(), env, ctx);
        if (r) return r;
      }
    } catch (err) {
      return json({ erreur: 'serveur' }, { status: 500 });
    }
    return env.ASSETS.fetch(request);
  }
};
