/* Recadrage des photos (accueil + galerie).
   Un cadrage = { x, y } le point visé en %, { z } le zoom (1 = photo entière), { a } le format (galerie).
   La photo remplit son cadre (object-fit: cover), on la décale vers le point visé puis on zoome autour de lui. */
(() => {
  const FORMATS = { orig: null, '1': 1, '4/5': 0.8, '4/3': 4 / 3 };
  window.CADRE = {
    FORMATS,
    // Format (largeur / hauteur) d'une photo de galerie ; les photos très hautes sont limitées pour tenir à l'écran
    ratio(c, nw, nh) {
      const f = c && FORMATS[c.a];
      if (f) return f;
      return nw && nh ? Math.max(nw / nh, 0.66) : 0.8;
    },
    appliquer(img, c) {
      const x = c ? c.x : 50, y = c ? c.y : 50, z = c ? c.z : 1;
      img.style.objectFit = 'cover';
      img.style.objectPosition = `${x}% ${y}%`;
      img.style.transformOrigin = `${x}% ${y}%`;
      img.style.transform = z > 1 ? `scale(${z})` : '';
    }
  };
})();
