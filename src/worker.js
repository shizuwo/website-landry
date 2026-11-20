// Worker du site de Landry : sert les pages (dossier public) et gère
// le compteur Mauruuru, le livre d'or, les clics et l'espace admin.

const json = (data, init = {}) => Response.json(data, init);
const nettoyer = (s, max) => String(s || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

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

/* ---------- Routes ---------- */

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

async function adminLire(env) {
  const [compteurs, statut, attente, valides] = await Promise.all([
    env.DB.prepare('SELECT nom, valeur FROM compteurs').all(),
    env.DB.prepare("SELECT valeur FROM reglages WHERE cle = 'statut'").first('valeur'),
    env.DB.prepare("SELECT id, nom, texte, cree FROM messages WHERE statut = 'attente' ORDER BY cree DESC").all(),
    env.DB.prepare("SELECT id, nom, texte, cree FROM messages WHERE statut = 'ok' ORDER BY cree DESC LIMIT 50").all()
  ]);
  return json({
    compteurs: Object.fromEntries(compteurs.results.map(r => [r.nom, r.valeur])),
    statut: statut || '', attente: attente.results, valides: valides.results
  });
}

async function adminEcrire(request, env) {
  const { action, id, valeur } = await request.json();
  if (action === 'statut') {
    await env.DB.prepare("INSERT INTO reglages (cle, valeur) VALUES ('statut', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur")
      .bind(String(valeur || '').slice(0, 120)).run();
  } else if (action === 'valider') {
    await env.DB.prepare("UPDATE messages SET statut = 'ok' WHERE id = ?").bind(id).run();
  } else if (action === 'supprimer') {
    await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(id).run();
  } else {
    return json({ erreur: 'action inconnue' }, { status: 400 });
  }
  return json({ ok: true });
}

function lien(cible, env, ctx) {
  const url = { insta: env.INSTAGRAM_URL }[cible];
  if (!url) return new Response('Lien pas encore configuré', { status: 404 });
  ctx.waitUntil(
    env.DB.prepare('INSERT INTO compteurs (nom, valeur) VALUES (?, 1) ON CONFLICT(nom) DO UPDATE SET valeur = valeur + 1')
      .bind('clic:' + cible).run().catch(() => {})
  );
  return Response.redirect(url, 302);
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const m = request.method;
    try {
      if (pathname === '/insta' || pathname === '/go/insta') return lien('insta', env, ctx);
      if (pathname === '/api/infos' && m === 'GET') return await infos(env);
      if (pathname === '/api/mauruuru' && m === 'POST') return await mauruuru(request, env);
      if (pathname === '/api/livredor' && m === 'GET') return await livreLire(env);
      if (pathname === '/api/livredor' && m === 'POST') return await livreEcrire(request, env);
      if (pathname === '/api/admin') {
        if (!autorise(request, env)) return json({ erreur: 'non autorisé' }, { status: 401 });
        if (m === 'GET') return await adminLire(env);
        if (m === 'POST') return await adminEcrire(request, env);
      }
      if (pathname.startsWith('/api/')) return json({ erreur: 'introuvable' }, { status: 404 });
    } catch (err) {
      return json({ erreur: 'serveur' }, { status: 500 });
    }
    return env.ASSETS.fetch(request);
  }
};
