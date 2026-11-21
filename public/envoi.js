/* Envoi de gros fichiers en morceaux (jusqu'à 5 Go), avec reprise.
   - Chaque morceau est réessayé tout seul si la connexion coupe (et attend le retour du réseau).
   - Si la page est fermée en plein envoi, il suffit de renvoyer le même fichier au même endroit :
     les morceaux déjà partis sont sautés.
   - Le CRC32 est calculé ici, pour que le serveur puisse fabriquer le .zip sans rien recalculer.
   Utilisé par l'admin (transferts) et par la page publique de dépôt (/d/…). */
(() => {
  const MORCEAU = 16 * 1024 * 1024;   // 16 Mo par morceau
  const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crcAjouter = (c, b) => { for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return c; };
  const pause = (ms) => new Promise(r => setTimeout(r, ms));
  const enLigne = () => navigator.onLine ? Promise.resolve() : new Promise(r => addEventListener('online', r, { once: true }));
  const memoire = {
    lire: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    ecrire: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    effacer: (k) => { try { localStorage.removeItem(k); } catch {} }
  };

  const appel = async (url, options = {}, entetes = {}) => {
    const r = await fetch(url, { ...options, headers: { ...entetes, ...(options.headers || {}) } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.erreur || 'Erreur ' + r.status); e.statut = r.status; throw e; }
    return d;
  };
  // Un morceau, avec suivi de progression (XHR) et nouvelles tentatives
  const envoyerMorceau = (url, blob, entetes, surProgression) => new Promise((ok, ko) => {
    const x = new XMLHttpRequest(); x.open('PUT', url);
    Object.entries(entetes).forEach(([k, v]) => x.setRequestHeader(k, v));
    x.upload.onprogress = (e) => { if (e.lengthComputable) surProgression(e.loaded); };
    x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch {} if (x.status === 200) ok(d); else { const e = new Error(d.erreur || 'Erreur ' + x.status); e.statut = x.status; ko(e); } };
    x.onerror = () => ko(new Error('connexion perdue'));
    x.send(blob);
  });

  window.Envoi = {
    /* base : '/api/admin/transfert/abc12345' ou '/d/abc12345' ; entetes : { 'x-cle': … } pour l'admin */
    async fichier(fichier, { base, entetes = {}, de = '', progression = () => {}, apercu = true } = {}) {
      const cle = `envoi:${base}:${fichier.name}:${fichier.size}:${fichier.lastModified}`;
      let etat = memoire.lire(cle);
      if (!etat) {
        let d;
        for (let essai = 1; ; essai++) {
          try {
            d = await appel(base + '/fichier', { method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ nom: fichier.name, type: fichier.type || 'application/octet-stream', taille: fichier.size, de }) }, entetes);
            break;
          } catch (e) { if (e.statut !== 429 || essai >= 6) throw e; await pause(800 * essai); }   // « doucement » : on patiente un peu
        }
        etat = { fid: d.fid, parts: [], nom: fichier.name, base, debut: Date.now() };
        memoire.ecrire(cle, etat);
      }
      const total = Math.max(1, Math.ceil(fichier.size / MORCEAU)), faits = new Map(etat.parts.map(p => [p.partNumber, p]));
      let crc = 0xFFFFFFFF, envoye = 0;
      for (let n = 1; n <= total; n++) {
        const morceau = fichier.slice((n - 1) * MORCEAU, n * MORCEAU);
        crc = crcAjouter(crc, new Uint8Array(await morceau.arrayBuffer()));
        if (faits.has(n)) { envoye += morceau.size; progression(envoye / fichier.size); continue; }
        for (let essai = 1; ; essai++) {
          await enLigne();
          try {
            const r = await envoyerMorceau(`${base}/fichier/${etat.fid}/${n}`, morceau, entetes, (l) => progression((envoye + l) / fichier.size));
            faits.set(n, { partNumber: n, etag: r.etag }); etat.parts = [...faits.values()]; memoire.ecrire(cle, etat);
            break;
          } catch (e) {
            if (e.statut === 404) { memoire.effacer(cle); throw new Error('envoi expiré, recommence'); }
            if (e.statut && e.statut < 500 && e.statut !== 429) throw e;
            if (essai >= 8) throw new Error('connexion trop instable, réessaie plus tard (l\'envoi reprendra où il en était)');
            await pause(Math.min(30000, 1000 * 2 ** essai));
          }
        }
        envoye += morceau.size; progression(envoye / fichier.size);
      }
      await appel(`${base}/fichier/${etat.fid}/fin`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parts: [...faits.values()], crc: (crc ^ 0xFFFFFFFF) >>> 0 }) }, entetes);
      memoire.effacer(cle);
      if (apercu) { try { const v = await Envoi.vignette(fichier); if (v) await fetch(`${base}/apercu/${etat.fid}`, { method: 'PUT', headers: { ...entetes, 'content-type': 'image/jpeg' }, body: v }); } catch {} }
      return etat.fid;
    },
    // Envois interrompus pour cette destination (pour proposer de les reprendre)
    enAttente(base) {
      const l = [];
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(`envoi:${base}:`)) l.push(memoire.lire(k)); } } catch {}
      return l.filter(Boolean);
    },
    // Petite vignette JPEG (360 px) pour les photos et les vidéos
    async vignette(fichier, cote = 360) {
      let source, l, h;
      if (fichier.type.startsWith('image/')) { source = await createImageBitmap(fichier, { imageOrientation: 'from-image' }); l = source.width; h = source.height; }
      else if (fichier.type.startsWith('video/')) {
        const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = URL.createObjectURL(fichier);
        await new Promise((ok, ko) => { v.onloadeddata = ok; v.onerror = ko; setTimeout(ko, 8000); });
        v.currentTime = Math.min(1, (v.duration || 2) / 3);
        await new Promise((ok) => { v.onseeked = ok; setTimeout(ok, 3000); });
        source = v; l = v.videoWidth; h = v.videoHeight;
      } else return null;
      if (!l || !h) return null;
      const k = Math.min(1, cote / Math.max(l, h)), c = document.createElement('canvas');
      c.width = Math.round(l * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
      if (source.src) URL.revokeObjectURL(source.src);
      return new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
    },
    // Retire la position GPS (et les métadonnées EXIF) d'une photo JPEG ; redessine la photo si son sens en dépendait
    async sansGPS(fichier) {
      if (!/^image\/jpe?g$/i.test(fichier.type) || fichier.size > 60e6) return fichier;
      try {
        const b = new Uint8Array(await fichier.arrayBuffer());
        if (b[0] !== 0xFF || b[1] !== 0xD8) return fichier;
        const garder = [b.subarray(0, 2)]; let i = 2, retire = false, orientation = 1;
        while (i + 4 <= b.length && b[i] === 0xFF) {
          const m = b[i + 1], l = (b[i + 2] << 8) | b[i + 3];
          if (m === 0xDA) { garder.push(b.subarray(i)); break; }
          const seg = b.subarray(i, i + 2 + l);
          if (m === 0xE1 && String.fromCharCode(...seg.subarray(4, 8)) === 'Exif') {
            const d = new DataView(seg.buffer, seg.byteOffset + 10), le = d.getUint16(0) === 0x4949;
            const ifd = d.getUint32(4, le), n = d.getUint16(ifd, le);
            for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (d.getUint16(e, le) === 0x0112) orientation = d.getUint16(e + 8, le); }
          }
          if (m === 0xE1 || m === 0xED) retire = true; else garder.push(seg);
          i += 2 + l;
        }
        if (!retire) return fichier;
        const opts = { type: fichier.type, lastModified: fichier.lastModified };
        if (orientation > 1) {
          const img = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
          return new File([await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95))], fichier.name, opts);
        }
        return new File(garder, fichier.name, opts);
      } catch { return fichier; }
    }
  };
})();
