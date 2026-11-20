/* Menu "Tire-moi" : un bout de tissu tifaifai qui pend en haut de l'écran et se déroule. */
(() => {
  const T = {
    fr: { menu: 'Menu', accueil: 'Accueil', galerie: 'Galerie', album: 'Album 🔒', liens: 'Mes liens' },
    en: { menu: 'Menu', accueil: 'Home', galerie: 'Gallery', album: 'Album 🔒', liens: 'My links' },
    ty: { menu: 'Menu', accueil: 'Fare', galerie: 'Galerie', album: 'Album 🔒', liens: 'Mes liens' }
  };
  const pages = [
    { cle: 'accueil', href: '/' },
    { cle: 'galerie', href: '/galerie' },
    { cle: 'album', href: '/album' },
    { cle: 'liens', href: '/bio' }
  ];
  const ici = /bio/.test(location.pathname) ? 'liens' : /galerie/.test(location.pathname) ? 'galerie' : /album/.test(location.pathname) ? 'album' : /^\/(index(\.html)?)?$/.test(location.pathname) ? 'accueil' : '';

  const css = `
  .tire{position:fixed;top:0;right:max(14px,3vw);z-index:100;font:600 15px/1.2 "Instrument Sans",system-ui,sans-serif;filter:drop-shadow(0 6px 10px rgba(0,0,0,.22))}
  .tire-tissu{position:relative;width:118px;background:var(--menu-fond,#fff);color:var(--menu-texte,#B3212E);padding:12px 0 22px;transform-origin:50% 0;
    -webkit-mask:conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) 50%/16px 100%;
            mask:conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) 50%/16px 100%}
  .tire-tissu::before{content:"";position:absolute;inset:6px 7px 18px;border:2px dashed currentColor;opacity:.35;border-radius:4px;pointer-events:none}
  .tire-liste{list-style:none;margin:0;padding:0 12px;display:grid;gap:2px;max-height:0;overflow:hidden;transition:max-height .55s cubic-bezier(.3,1.25,.5,1),padding .3s}
  .tire.ouvert .tire-liste{max-height:260px;padding-top:8px;padding-bottom:8px}
  .tire-liste a{display:flex;align-items:center;justify-content:center;min-height:44px;padding:6px;color:inherit;text-decoration:none;border-radius:8px;text-align:center}
  .tire-liste a:hover{background:color-mix(in srgb,currentColor 10%,transparent)}
  .tire-liste a[aria-current]{background:color-mix(in srgb,currentColor 16%,transparent)}
  .tire-liste a:focus-visible,.tire button:focus-visible{outline:3px solid currentColor;outline-offset:-4px}
  .tire button{all:unset;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:100%;min-height:48px;cursor:pointer;border-radius:8px}
  .tire .fleche{width:14px;height:14px;transition:transform .35s}
  .tire.ouvert .fleche{transform:rotate(180deg)}
  @keyframes tire-balance{0%{transform:rotate(0)}30%{transform:rotate(5deg)}60%{transform:rotate(-3deg)}85%{transform:rotate(1deg)}100%{transform:rotate(0)}}
  .tire.bouge .tire-tissu{animation:tire-balance .8s ease}
  @media (prefers-reduced-motion:reduce){.tire-liste,.tire .fleche{transition:none}.tire.bouge .tire-tissu{animation:none}}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const nav = document.createElement('nav');
  nav.className = 'tire';
  nav.setAttribute('aria-label', 'Menu');
  nav.innerHTML = `
    <div class="tire-tissu">
      <ul class="tire-liste" id="tire-liste">
        ${pages.map(p => `<li><a href="${p.href}" data-cle="${p.cle}"${p.cle === ici ? ' aria-current="page"' : ''}></a></li>`).join('')}
      </ul>
      <button type="button" aria-expanded="false" aria-controls="tire-liste">
        <span class="tire-label"></span>
        <svg class="fleche" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>`;
  document.body.appendChild(nav);

  const bouton = nav.querySelector('button');
  const liens = nav.querySelectorAll('.tire-liste a');
  const balance = () => { nav.classList.remove('bouge'); void nav.offsetWidth; nav.classList.add('bouge'); };
  const ouvrir = (oui) => {
    nav.classList.toggle('ouvert', oui);
    bouton.setAttribute('aria-expanded', String(oui));
    liens.forEach(a => a.tabIndex = oui ? 0 : -1);
    balance();
  };
  liens.forEach(a => a.tabIndex = -1);
  bouton.addEventListener('click', () => ouvrir(!nav.classList.contains('ouvert')));
  document.addEventListener('click', e => { if (!nav.contains(e.target) && nav.classList.contains('ouvert')) ouvrir(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('ouvert')) { ouvrir(false); bouton.focus(); } });

  // Petit balancement pour se faire remarquer, une fois
  setTimeout(balance, 3800);

  const langue = (l) => {
    const t = T[l] || T.fr;
    nav.querySelector('.tire-label').textContent = t.menu;
    liens.forEach(a => a.textContent = t[a.dataset.cle]);
  };
  langue(document.documentElement.lang || 'fr');
  window.menuLangue = langue;

  /* Bannière d'annonce (réglée depuis l'admin) */
  const cssB = `
  .banniere{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 14px);translate:-50% 0;z-index:95;width:max-content;max-width:min(560px,92vw);
    display:flex;align-items:center;gap:6px;padding:6px 6px 6px 16px;border-radius:999px;background:#12303A;color:#fff;
    font:600 15px/1.3 "Instrument Sans",system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);animation:banniere-entre .6s cubic-bezier(.2,1.3,.4,1) 1.2s both}
  .banniere a,.banniere span.txt{color:inherit;text-decoration:none;padding:6px 4px;overflow-wrap:anywhere}
  .banniere a{text-decoration:underline;text-underline-offset:3px}
  .banniere button{all:unset;flex:none;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;cursor:pointer;font-size:18px;line-height:1}
  .banniere button:hover{background:rgba(255,255,255,.15)}
  .banniere a:focus-visible,.banniere button:focus-visible{outline:3px solid #fff;outline-offset:2px;border-radius:999px}
  @keyframes banniere-entre{from{translate:-50% 140%;opacity:0}}
  @media (prefers-reduced-motion:reduce){.banniere{animation:none}}`;
  /* Thème saisonnier (réglé dans l'admin, ou automatique selon la date) */
  const THEMES = {
    heiva: { texte: 'Heiva i Tahiti ! 🌺', objets: ['🌺', '🌼', '🌸', '🍃'] },
    noel: { texte: 'Joyeux Noël 🎄', objets: ['✨', '⭐', '❄️', '🎁'] },
    nouvel_an: { texte: 'Bonne année ! 🎉', confettis: ['#B3212E', '#FFC93C', '#2EC4C6', '#FFFFFF', '#F26B38'] }
  };
  const appliquerTheme = (nom) => {
    const th = THEMES[nom]; if (!th) return;
    document.documentElement.classList.add('theme-' + nom);
    const cleT = 'theme-vu:' + nom;
    try { if (sessionStorage.getItem(cleT)) return; sessionStorage.setItem(cleT, '1'); } catch {}
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const st = document.createElement('style');
    st.textContent = `.fete{position:fixed;top:-40px;z-index:96;pointer-events:none;font-size:22px;animation:fete-tombe linear forwards}
      .fete.confetti{width:8px;height:14px;border-radius:2px}
      @keyframes fete-tombe{to{transform:translate(var(--dx),110vh) rotate(var(--r))}}
      .fete-message{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 64px);translate:-50% 0;z-index:97;background:#fff;color:#B3212E;font:700 16px/1.2 "Instrument Sans",system-ui,sans-serif;padding:10px 18px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.25);animation:fete-msg 4.5s ease forwards;white-space:nowrap;pointer-events:none}
      @keyframes fete-msg{0%{opacity:0;translate:-50% -20px}12%,80%{opacity:1;translate:-50% 0}100%{opacity:0;translate:-50% -10px}}`;
    document.head.appendChild(st);
    const msg = document.createElement('div'); msg.className = 'fete-message'; msg.textContent = th.texte; msg.setAttribute('role', 'status');
    setTimeout(() => { document.body.appendChild(msg); setTimeout(() => msg.remove(), 4700); }, 900);
    for (let i = 0; i < 34; i++) {
      const f = document.createElement('div'); f.className = 'fete' + (th.confettis ? ' confetti' : ''); f.setAttribute('aria-hidden', 'true');
      if (th.confettis) f.style.background = th.confettis[i % th.confettis.length]; else f.textContent = th.objets[i % th.objets.length];
      f.style.left = Math.random() * 100 + 'vw';
      f.style.setProperty('--dx', (Math.random() * 140 - 70) + 'px');
      f.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
      f.style.animationDuration = (4 + Math.random() * 3).toFixed(2) + 's';
      f.style.animationDelay = (0.6 + Math.random() * 2.5).toFixed(2) + 's';
      document.body.appendChild(f); f.addEventListener('animationend', () => f.remove());
    }
  };

  fetch('/api/infos').then(r => r.ok ? r.json() : null).then(d => {
    if (d && d.theme) appliquerTheme(d.theme);
    const b = d && d.banniere; if (!b || !b.texte) return;
    const cleB = 'banniere-fermee:' + b.texte;
    try { if (sessionStorage.getItem(cleB)) return; } catch {}
    const st = document.createElement('style'); st.textContent = cssB; document.head.appendChild(st);
    const el = document.createElement('div'); el.className = 'banniere'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Annonce');
    const txt = document.createElement(b.lien ? 'a' : 'span'); txt.className = 'txt'; txt.textContent = b.texte;
    if (b.lien) { txt.href = b.lien; if (/^https?:/.test(b.lien)) { txt.target = '_blank'; txt.rel = 'noopener'; } }
    const x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', "Fermer l'annonce"); x.textContent = '✕';
    x.addEventListener('click', () => { el.remove(); try { sessionStorage.setItem(cleB, '1'); } catch {} });
    el.append(txt, x); document.body.appendChild(el);
  }).catch(() => {});
})();
