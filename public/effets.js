/* Petits effets partagés par les pages :
   - boutons « élastiques » qui suivent un peu la souris (ou le doigt) ;
   - lettres qui sautent au survol (tout élément avec data-saut, découpé en .saut) ;
   - son discret au clic, coupé par défaut, avec un bouton 🔈 en bas à gauche. */
(() => {
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Boutons élastiques ---------- */
  const ELASTIQUES = '.pilule, .mes-liens, .liens a, .petit-btn, .boutons a';
  const st = document.createElement('style');
  st.textContent = `
  .elastique { transition: translate .55s cubic-bezier(.3,1.8,.4,1), scale .55s cubic-bezier(.3,1.8,.4,1) !important; }
  .elastique.tire-el { transition: translate .12s ease-out, scale .12s ease-out !important; }
  .son-btn { position: fixed; left: 14px; bottom: 14px; z-index: 95; width: 44px; height: 44px; border-radius: 50%; border: 0; cursor: pointer;
    background: rgba(255,253,248,.92); color: #B3212E; display: grid; place-items: center; box-shadow: 0 4px 12px rgba(0,0,0,.18); }
  .son-btn svg { width: 22px; height: 22px; }
  .son-btn:focus-visible { outline: 3px solid #B3212E; outline-offset: 3px; }
  .son-btn .barre { transition: opacity .2s; }
  .son-btn[aria-pressed="true"] .barre { opacity: 0; }
  .son-btn[aria-pressed="false"] .ondes { opacity: 0; }
  .mot { display: inline-block; white-space: nowrap; }
  .saut { display: inline-block; transition: translate .45s cubic-bezier(.3,1.9,.5,1), rotate .45s cubic-bezier(.3,1.9,.5,1), scale .45s cubic-bezier(.3,1.9,.5,1); }
  @media (prefers-reduced-motion: reduce) { .elastique, .saut { transition: none !important; } }`;
  document.head.appendChild(st);

  if (!calme) {
    const relacher = (b) => { b.classList.remove('tire-el'); b.style.translate = ''; b.style.scale = ''; };
    document.addEventListener('pointermove', (e) => {
      const b = e.target.closest && e.target.closest(ELASTIQUES);
      document.querySelectorAll('.tire-el').forEach(x => { if (x !== b) relacher(x); });
      if (!b) return;
      b.classList.add('elastique', 'tire-el');
      const r = b.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      b.style.translate = `${(dx * 6).toFixed(1)}px ${(dy * 4).toFixed(1)}px`;
      b.style.scale = `${(1 + Math.abs(dx) * .045).toFixed(3)} ${(1 - Math.abs(dx) * .03 + Math.abs(dy) * .03).toFixed(3)}`;
    }, { passive: true });
    document.addEventListener('pointerout', (e) => {
      const b = e.target.closest && e.target.closest(ELASTIQUES);
      if (b && !b.contains(e.relatedTarget)) relacher(b);
    });
    // Au doigt : petit « boing » quand on appuie
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      const b = e.target.closest && e.target.closest(ELASTIQUES); if (!b) return;
      b.classList.add('elastique'); b.style.scale = '1.06 .94';
      setTimeout(() => { b.style.scale = ''; }, 140);
    }, { passive: true });
  }

  /* ---------- Lettres qui sautent ---------- */
  // Découpe un titre en mots (insécables) et en lettres, sans toucher aux petites notes manuscrites
  window.enLettres = (el) => {
    if (!el || el.dataset.saut !== undefined) return;
    const marche = (n) => [...n.childNodes].forEach(c => {
      if (c.nodeType === 3) {
        const f = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach(morceau => {
          if (!morceau) return;
          if (/^\s+$/.test(morceau)) { f.append(morceau); return; }
          const mot = document.createElement('span'); mot.className = 'mot'; mot.setAttribute('aria-hidden', 'true');
          [...morceau].forEach(ch => { const sp = document.createElement('span'); sp.className = 'saut'; sp.textContent = ch; mot.append(sp); });
          f.append(mot);
        });
        c.replaceWith(f);
      } else if (c.nodeType === 1 && !c.classList.contains('note') && c.tagName !== 'BR') marche(c);
    });
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    marche(el); el.dataset.saut = '';
  };
  if (!calme) document.addEventListener('pointerover', (e) => {
    const l = e.target.closest && e.target.closest('.saut'); if (!l) return;
    const zone = l.closest('[data-saut]'); if (!zone) return;
    const lettres = [...zone.querySelectorAll('.saut')], i = lettres.indexOf(l);
    [-2, -1, 0, 1, 2].forEach(d => {
      const s = lettres[i + d]; if (!s) return;
      const k = [1, .45, .15][Math.abs(d)], sens = Math.random() < .5 ? -1 : 1;
      s.style.translate = `0 ${(-0.16 * k).toFixed(3)}em`;
      s.style.rotate = `${(sens * 10 * k).toFixed(1)}deg`;
      s.style.scale = (1 + 0.1 * k).toFixed(3);
      clearTimeout(s._t); s._t = setTimeout(() => { s.style.translate = s.style.rotate = s.style.scale = ''; }, 260);
    });
  });

  /* ---------- Son discret au clic (coupé par défaut) ---------- */
  let actif = false; try { actif = localStorage.getItem('son') === '1'; } catch {}
  let ctx = null;
  const audio = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
  // « Pop » : une petite bulle qui descend
  const pop = () => {
    const a = audio(), t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(760, t); o.frequency.exponentialRampToValueAtTime(240, t + .09);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.18, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + .13);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + .15);
  };
  // Corde de ukulélé (synthèse Karplus-Strong), une note au hasard dans un accord de do
  const NOTES = [392, 523.25, 659.25, 440];
  const uke = () => {
    const a = audio(), f = NOTES[Math.floor(Math.random() * NOTES.length)], n = Math.round(a.sampleRate / f);
    const duree = 1.1, buf = a.createBuffer(1, Math.round(a.sampleRate * duree), a.sampleRate), d = buf.getChannelData(0);
    const ligne = new Float32Array(n).map(() => Math.random() * 2 - 1);
    for (let i = 0; i < d.length; i++) { const j = i % n; const v = ligne[j]; ligne[j] = .996 * .5 * (v + ligne[(j + 1) % n]); d[i] = v; }
    const s = a.createBufferSource(), g = a.createGain(); g.gain.value = .14;
    s.buffer = buf; s.connect(g).connect(a.destination); s.start();
  };
  const ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><g class="ondes"><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11"/></g><path class="barre" d="M16 9l5 6M21 9l-5 6"/></svg>';
  const bouton = document.createElement('button');
  bouton.type = 'button'; bouton.className = 'son-btn'; bouton.innerHTML = ICONE;
  const maj = () => { bouton.setAttribute('aria-pressed', String(actif)); bouton.setAttribute('aria-label', actif ? 'Couper le son' : 'Activer le son'); };
  maj();
  bouton.addEventListener('click', () => { actif = !actif; try { localStorage.setItem('son', actif ? '1' : '0'); } catch {} maj(); if (actif) uke(); });
  const poser = () => document.body.appendChild(bouton);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', poser) : poser();

  document.addEventListener('click', (e) => {
    if (!actif || e.target.closest('.son-btn')) return;
    const cible = e.target.closest('a, button, [role="button"]'); if (!cible) return;
    try { cible.matches('.pilule, .liens a, .boutons a') ? uke() : pop(); } catch { return; }
    // Lien vers une autre page du site : on laisse le son démarrer avant de partir
    if (cible.tagName === 'A' && !e.defaultPrevented && cible.target !== '_blank' && cible.origin === location.origin && !e.metaKey && !e.ctrlKey) {
      e.preventDefault(); setTimeout(() => { location.href = cible.href; }, 140);
    }
  }, true);
})();
