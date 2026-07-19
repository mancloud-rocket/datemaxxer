/* =====================================================================
   DATEMAXXER · design/app · glifos de los 8 arquetipos v1
   Line-art artesanal (GUIA-VISUAL §5.1), viewBox 48x48, stroke currentColor.
   Un builder por arquetipo: dibuja capas de estructura + carácter (detalle
   pequeño que lo hace propio, no un ícono de librería). Reutilizable por
   mesa.html, informe.html y CORE (apps/web) sin dependencias.

   API:
     ARQUETIPOS            -> [{slug,label}] en orden canónico
     buildGlifo(slug, opts)-> <svg> listo (opts: size=48, stroke=2, cls)
     GLIFOS[slug](g)       -> pinta los <path> dentro de un <g> dado
   Cada path es dibujable: expone getTotalLength vía setDraw() del shared.js.
   ===================================================================== */
(function (root) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  // atajos: p = path, base de trazo consistente
  const p = (g, d, extra) => el('path', Object.assign({ d, fill: 'none' }, extra || {}), g);
  const c = (g, cx, cy, r, extra) => el('circle', Object.assign({ cx, cy, r, fill: 'none' }, extra || {}), g);

  const ARQUETIPOS = [
    { slug: 'viajero',      label: 'Viajero' },
    { slug: 'intelectual',  label: 'Intelectual' },
    { slug: 'deportista',   label: 'Deportista' },
    { slug: 'creativo',     label: 'Creativo' },
    { slug: 'profesional',  label: 'Profesional' },
    { slug: 'outdoor',      label: 'Outdoor' },
    { slug: 'social',       label: 'Social' },
    { slug: 'hogareno',     label: 'Hogareño' },
  ];

  /* Cada glifo: capa estructura (trazo principal) + capa carácter (detalle
     fino con clase .car para poder atenuarlo o dibujarlo aparte). */
  const GLIFOS = {
    // montañas + sol naciente + sendero punteado que se va + avión de papel
    viajero(g) {
      p(g, 'M4 36 L17 18 L26 29 L33 20 L44 36 Z');           // cordillera
      c(g, 34, 13, 4, { class: 'car' });                      // sol
      p(g, 'M30 41 C22 39 26 35 20 34 C14 33 18 38 11 40', { class: 'car', 'stroke-dasharray': '0.5 4', 'stroke-linecap': 'round' }); // sendero
      p(g, 'M40 8 L31 12 L36 14 L34 20 L40 8 Z', { class: 'car' }); // avión de papel
    },
    // libro abierto + lomo + una idea (chispa) saliendo de la página
    intelectual(g) {
      p(g, 'M24 14 C19 10 12 10 6 12 L6 36 C12 34 19 34 24 38 C29 34 36 34 42 36 L42 12 C36 10 29 10 24 14 Z');
      p(g, 'M24 14 L24 38');                                  // lomo
      p(g, 'M10 18 L19 17 M10 23 L19 22 M10 28 L18 27', { class: 'car', 'stroke-linecap': 'round' }); // renglones izq
      p(g, 'M29 17 L38 18 M30 22 L38 23', { class: 'car', 'stroke-linecap': 'round' });               // renglones der
      p(g, 'M24 9 L24 5 M27 10 L30 7 M21 10 L18 7', { class: 'car', 'stroke-linecap': 'round' });     // chispa de idea
    },
    // mancuerna con discos y agarre moleteado
    deportista(g) {
      p(g, 'M17 24 L31 24');                                  // barra
      p(g, 'M13 15 L13 33 M20 17 L20 31', { 'stroke-linecap': 'round' });  // discos izq
      p(g, 'M35 15 L35 33 M28 17 L28 31', { 'stroke-linecap': 'round' });  // discos der
      p(g, 'M9 20 L9 28 M6 22 L6 26', { class: 'car', 'stroke-linecap': 'round' });   // topes izq
      p(g, 'M39 20 L39 28 M42 22 L42 26', { class: 'car', 'stroke-linecap': 'round' });// topes der
    },
    // pincel en diagonal con punta cargada + trazo de color que deja
    creativo(g) {
      p(g, 'M12 40 L27 25');                                  // mango
      p(g, 'M27 25 L34 18 L38 14 C41 11 44 14 41 17 L30 28 Z', { class: 'car' }); // virola + punta
      p(g, 'M12 40 C7 41 6 44 4 45 C7 43 8 42 9 37 Z');       // cerdas
      p(g, 'M8 44 C13 42 17 43 21 40', { class: 'car', 'stroke-linecap': 'round' }); // pincelada
    },
    // maletín con manija, cierre y una costura de status (línea fina)
    profesional(g) {
      p(g, 'M6 18 L42 18 L42 40 L6 40 Z');                    // cuerpo
      p(g, 'M18 18 L18 12 L30 12 L30 18');                    // manija
      p(g, 'M6 27 L42 27', { class: 'car' });                 // tapa
      p(g, 'M21 25 L27 25 L27 29 L21 29 Z', { class: 'car' });// cerradura
    },
    // carpa de montaña + poste + luna (aventura nocturna)
    outdoor(g) {
      p(g, 'M6 38 L24 10 L42 38 Z');                          // carpa
      p(g, 'M24 10 L24 38');                                  // poste central
      p(g, 'M19 38 L24 26 L29 38', { class: 'car' });         // puerta triangular
      p(g, 'M36 14 A5 5 0 1 0 40 20 A4 4 0 1 1 36 14 Z', { class: 'car' }); // luna
    },
    // tres figuras enlazadas (anfitrión al centro, un poco más alto)
    social(g) {
      c(g, 24, 15, 5);                                        // cabeza centro
      p(g, 'M14 40 C14 30 34 30 34 40');                      // torso centro
      c(g, 9, 20, 3.6, { class: 'car' });                     // cabeza izq
      p(g, 'M2 39 C2 31 12 31 13 35', { class: 'car' });      // torso izq
      c(g, 39, 20, 3.6, { class: 'car' });                    // cabeza der
      p(g, 'M46 39 C46 31 36 31 35 35', { class: 'car' });    // torso der
    },
    // casa con humo del hogar + maceta en la ventana
    hogareno(g) {
      p(g, 'M8 24 L24 10 L40 24');                            // techo
      p(g, 'M12 22 L12 40 L36 40 L36 22');                    // muros
      p(g, 'M20 40 L20 30 L28 30 L28 40');                    // puerta
      p(g, 'M32 14 L32 8 C32 5 36 5 36 8 C36 11 39 10 39 13', { class: 'car', 'stroke-linecap': 'round' }); // humo
      c(g, 24, 24, 2.4, { class: 'car' });                    // ojo de buey
    },
  };

  function buildGlifo(slug, opts = {}) {
    const size = opts.size || 48;
    const sw = opts.stroke != null ? opts.stroke : 2;
    const svg = el('svg', {
      viewBox: '0 0 48 48', width: size, height: size,
      fill: 'none', stroke: 'currentColor',
      'stroke-width': sw, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    });
    if (opts.cls) svg.setAttribute('class', opts.cls);
    svg.setAttribute('role', 'img');
    const meta = ARQUETIPOS.find(a => a.slug === slug);
    if (meta) el('title', {}, svg).textContent = meta.label;
    const g = el('g', {}, svg);
    (GLIFOS[slug] || (() => {}))(g);
    return svg;
  }

  root.ARQUETIPOS = ARQUETIPOS;
  root.GLIFOS = GLIFOS;
  root.buildGlifo = buildGlifo;
})(window);
