/* Admin installée sur le téléphone (Android) : « Partager → Admin » envoie des photos ou fichiers
   directement dans un nouveau transfert. Ce petit programme reçoit le partage, garde les fichiers
   le temps d'ouvrir l'admin, puis l'admin les récupère. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'POST' || url.pathname !== '/admin/partage') return;
  e.respondWith((async () => {
    const donnees = await e.request.formData();
    const cache = await caches.open('partage');
    for (const k of await cache.keys()) await cache.delete(k);
    let i = 0;
    for (const f of donnees.getAll('fichiers')) {
      if (!(f instanceof File) || !f.size) continue;
      await cache.put(`/partage/${i++}`, new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-nom': encodeURIComponent(f.name || 'fichier') } }));
    }
    const texte = [donnees.get('titre'), donnees.get('texte'), donnees.get('lien')].filter(Boolean).join(' ');
    return Response.redirect(`/admin?partage=${i}${texte ? '&texte=' + encodeURIComponent(texte.slice(0, 200)) : ''}#outils/transferts`, 303);
  })());
});
