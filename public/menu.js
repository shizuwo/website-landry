/* Menu "Tire-moi" : un bout de tissu tifaifai qui pend en haut de l'écran et se déroule. */
(() => {
  const T = {
    fr: { menu: 'Menu', accueil: 'Accueil', galerie: 'Galerie', liens: 'Mes liens' },
    en: { menu: 'Menu', accueil: 'Home', galerie: 'Gallery', liens: 'My links' },
    ty: { menu: 'Menu', accueil: 'Fare', galerie: 'Galerie', liens: 'Mes liens' }
  };
  const pages = [
    { cle: 'accueil', href: './' },
    { cle: 'galerie', href: 'galerie.html' },
    { cle: 'liens', href: 'bio.html' }
  ];
  const ici = /bio/.test(location.pathname) ? 'liens' : /galerie/.test(location.pathname) ? 'galerie' : 'accueil';

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
})();
