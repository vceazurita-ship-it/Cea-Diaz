import * as THREE from 'three';

/* =========================================================================
 *  Los muñecos de la serie, en 3D.
 *
 *  Dibujados como en el anime de Oliver y Benji: **sombreado de tres tonos**
 *  (luz, media y sombra, sin degradados, como una cel pintada a mano) y el
 *  **contorno de tinta** alrededor de cada pieza. Las proporciones son las
 *  de la serie —piernas largas, cintura estrecha, hombros marcados y la
 *  cabeza grande— y la equipación va con todo: cuello y puños del segundo
 *  color, dorsal con nombre a la espalda, pantalón con perneras, medias con
 *  su franja, botas con sus rayas y, si toca, el brazalete de capitán.
 *
 *  La cabeza es un sprite con el SVG de `PenaltyArt`: las caras que Víctor
 *  dio por buenas, igual en el cromo, en la ficha y en 3D.
 *
 *  Los usan el estadio de los penaltis y el campo de la Liga de los Cromos,
 *  para que Oliver sea el mismo Oliver en los dos juegos. El frente del
 *  muñeco es +z. Las posturas son ángulos de las articulaciones, en
 *  radianes, y se pueden pedir fotograma a fotograma.
 * ========================================================================= */

export interface Muneco {
  root: THREE.Group;
  body: THREE.Group;
  hips: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  head: THREE.Sprite;
  sombra: THREE.Mesh;
}

/** Cómo va vestido. */
export interface Ropa {
  kit: string;
  shorts: string;
  socks: string;
  band: string;
  skin: string;
  bare?: boolean;
  guantes?: string;
  mangaLarga?: boolean;
  dorsal?: THREE.Texture;
  /** El segundo color: cuello, puños y rayas del pantalón. Si falta, la franja de las medias. */
  trim?: string;
  /** El brazalete de capitán, en el brazo izquierdo. */
  capitan?: boolean;
  /** Las rayas de los hombros, como las amarillas de Benji. */
  hombreras?: string;
  /**
   * El contorno de tinta. Vale la pena de cerca; desde la grada de la Liga
   * no se ve y cuesta el doble de dibujo, así que allí se apaga.
   */
  contorno?: boolean;
}

export type Pose = 'espera' | 'carrera' | 'golpeo' | 'portero' | 'estirada' | 'celebra' | 'lamento';

/**
 * Quien monta la escena guarda cada geometría y cada material para soltarlos
 * al cerrar: el muñeco se los pide a él.
 */
export interface Taller {
  geo<T extends THREE.BufferGeometry>(g: T): T;
  mat<T extends THREE.Material>(m: T): T;
}

/** Suave al entrar y al salir. */
export const suave = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
export const lerp = THREE.MathUtils.lerp;

/* ---------------------------------------------------------------------------
 * El estilo: tres tonos y tinta
 * ------------------------------------------------------------------------- */

/**
 * La rampa del sombreado: sombra, media y luz, a saltos. Es una textura de
 * cuatro píxeles que comparten todos los muñecos y no se suelta nunca.
 */
let rampa: THREE.DataTexture | null = null;
function rampaToon(): THREE.DataTexture {
  if (!rampa) {
    rampa = new THREE.DataTexture(new Uint8Array([95, 170, 255, 255]), 4, 1, THREE.RedFormat);
    rampa.minFilter = THREE.NearestFilter;
    rampa.magFilter = THREE.NearestFilter;
    rampa.generateMipmaps = false;
    rampa.needsUpdate = true;
  }
  return rampa;
}

/** El grosor de la tinta, en metros del muñeco. */
const TINTA = 0.011;
const COLOR_TINTA = '#1b1424';

/**
 * El contorno: la misma pieza, un pelo más gorda por sus normales, de color
 * tinta y vista por dentro. Es el truco de siempre de los dibujos en 3D.
 */
function materialTinta(t: Taller): THREE.MeshBasicMaterial {
  const m = t.mat(new THREE.MeshBasicMaterial({ color: COLOR_TINTA, side: THREE.BackSide }));
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n  transformed += normalize(normal) * ${TINTA.toFixed(4)};`,
    );
  };
  m.customProgramCacheKey = () => `tinta-${TINTA}`;
  return m;
}

/* ---------------------------------------------------------------------------
 * El muñeco
 * ------------------------------------------------------------------------- */

/** Un perfil de torno, centrado en su caja para que la tinta crezca parejo. */
function torno(t: Taller, perfil: [number, number][], lados = 20): THREE.LatheGeometry {
  const g = t.geo(new THREE.LatheGeometry(perfil.map(([r, y]) => new THREE.Vector2(r, y)), lados));
  g.center();
  return g;
}

/** Un muñeco de la serie: cuerpo de anime a tres tonos, tinta y la cabeza dibujada. */
export function crearMuneco(t: Taller, ropa: Ropa): Muneco {
  const conTinta = ropa.contorno !== false;
  const tinta = conTinta ? materialTinta(t) : null;
  const toon = (color: string) => t.mat(new THREE.MeshToonMaterial({ color, gradientMap: rampaToon() }));
  const kit = toon(ropa.kit);
  const piel = toon(ropa.skin);
  const shorts = toon(ropa.shorts);
  const medias = toon(ropa.socks);
  const franja = toon(ropa.band);
  const trim = toon(ropa.trim ?? ropa.band);
  const bota = toon('#17181e');
  const blanco = toon('#f4f4f2');

  /** Una pieza: con sombra, y con su tinta si toca. */
  const pieza = (geo: THREE.BufferGeometry, mat: THREE.Material, padre: THREE.Object3D, sombra = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = sombra;
    if (tinta) m.add(new THREE.Mesh(geo, tinta));
    padre.add(m);
    return m;
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Cadera, a 0,9 m. Todo lo de arriba cuelga de aquí.
  const hips = new THREE.Group();
  hips.position.y = 0.9;
  body.add(hips);

  /* ------------------------------------------------------------ el tronco */

  // El pantalón: la cintura, con las rayas del segundo color a los lados.
  const cintura = pieza(t.geo(new THREE.CylinderGeometry(0.19, 0.225, 0.2, 18)), shorts, hips);
  cintura.scale.z = 0.72;
  cintura.position.y = 0.05;
  for (const s of [-1, 1]) {
    const raya = pieza(t.geo(new THREE.BoxGeometry(0.02, 0.2, 0.06)), trim, hips, false);
    raya.position.set(s * 0.212, 0.04, 0);
    raya.rotation.z = s * 0.16;
  }

  // El torso de la serie: estrecho de cintura y ancho de pecho.
  const torsoGeo = torno(t, [
    [0.165, 0],
    [0.172, 0.08],
    [0.2, 0.2],
    [0.222, 0.32],
    [0.215, 0.42],
    [0.17, 0.5],
    [0.08, 0.54],
  ]);
  const torso = pieza(torsoGeo, kit, hips);
  torso.scale.z = 0.62;
  torso.position.y = 0.36;

  // El dorsal, pegado a la espalda: nombre y número.
  if (ropa.dorsal) {
    const parche = new THREE.Mesh(
      t.geo(new THREE.CylinderGeometry(0.214, 0.206, 0.3, 16, 1, true, Math.PI - 0.75, 1.5)),
      t.mat(new THREE.MeshToonMaterial({ map: ropa.dorsal, gradientMap: rampaToon() })),
    );
    parche.scale.z = 0.64;
    parche.position.y = 0.38;
    hips.add(parche);
  }

  // El cuello de la camiseta, del segundo color, y el cuello de verdad.
  const cuelloCamiseta = pieza(t.geo(new THREE.TorusGeometry(0.078, 0.02, 8, 20)), trim, hips, false);
  cuelloCamiseta.rotation.x = Math.PI / 2;
  cuelloCamiseta.scale.y = 0.8;
  cuelloCamiseta.position.set(0, 0.625, 0.005);
  const cuello = pieza(t.geo(new THREE.CylinderGeometry(0.052, 0.058, 0.12, 12)), piel, hips, false);
  cuello.position.y = 0.67;

  /* ------------------------------------------------------------ los brazos */

  const brazo = (s: number) => {
    const hombro = new THREE.Group();
    hombro.position.set(s * 0.25, 0.56, 0);
    const deltoides = pieza(t.geo(new THREE.SphereGeometry(0.085, 14, 10)), ropa.bare ? piel : kit, hombro);
    deltoides.scale.set(1.05, 0.95, 0.95);
    if (ropa.hombreras) {
      const raya = pieza(t.geo(new THREE.BoxGeometry(0.035, 0.02, 0.17)), toon(ropa.hombreras), hombro, false);
      raya.position.set(0, 0.075, 0);
    }
    if (ropa.bare) {
      pieza(t.geo(new THREE.CapsuleGeometry(0.055, 0.18, 4, 10)), piel, hombro).position.y = -0.14;
    } else {
      const manga = pieza(t.geo(new THREE.CylinderGeometry(0.078, 0.068, ropa.mangaLarga ? 0.24 : 0.17, 14)), kit, hombro);
      manga.position.y = ropa.mangaLarga ? -0.12 : -0.08;
      if (!ropa.mangaLarga) {
        const puno = pieza(t.geo(new THREE.CylinderGeometry(0.07, 0.07, 0.028, 14)), trim, hombro, false);
        puno.position.y = -0.165;
        pieza(t.geo(new THREE.CapsuleGeometry(0.047, 0.1, 4, 10)), piel, hombro).position.y = -0.22;
      }
      if (ropa.capitan && s > 0) {
        const brazalete = pieza(t.geo(new THREE.CylinderGeometry(0.081, 0.078, 0.045, 14)), toon('#fbbf24'), hombro, false);
        brazalete.position.y = -0.1;
      }
    }
    const codo = new THREE.Group();
    codo.position.y = -0.29;
    hombro.add(codo);
    const ante = pieza(t.geo(new THREE.CapsuleGeometry(0.045, 0.19, 4, 10)), ropa.mangaLarga ? kit : piel, codo);
    ante.position.y = -0.13;
    if (ropa.guantes) {
      // Los guantes de portero: gordos, con su puño.
      const guante = toon(ropa.guantes);
      const puno = pieza(t.geo(new THREE.CylinderGeometry(0.058, 0.062, 0.06, 12)), guante, codo, false);
      puno.position.y = -0.25;
      const mano = pieza(t.geo(new THREE.SphereGeometry(0.085, 14, 10)), guante, codo);
      mano.scale.set(1, 1.25, 0.72);
      mano.position.y = -0.33;
    } else {
      const mano = pieza(t.geo(new THREE.SphereGeometry(0.055, 12, 10)), piel, codo);
      mano.scale.set(0.9, 1.15, 0.75);
      mano.position.y = -0.3;
    }
    hips.add(hombro);
    return [hombro, codo] as const;
  };
  const [armL, foreL] = brazo(-1);
  const [armR, foreR] = brazo(1);

  /* ------------------------------------------------------------ las piernas */

  const pierna = (s: number) => {
    const cadera = new THREE.Group();
    cadera.position.set(s * 0.105, 0, 0);
    // La pernera del pantalón, que va con la pierna.
    const pernera = pieza(t.geo(new THREE.CylinderGeometry(0.105, 0.118, 0.17, 14)), shorts, cadera);
    pernera.position.y = -0.07;
    // Muslo largo de anime, que se afina hacia la rodilla.
    const muslo = pieza(torno(t, [[0.07, 0], [0.078, 0.12], [0.085, 0.28], [0.08, 0.36]], 14), piel, cadera);
    muslo.position.y = -0.24;
    const rodilla = new THREE.Group();
    rodilla.position.y = -0.44;
    cadera.add(rodilla);
    pieza(t.geo(new THREE.SphereGeometry(0.066, 12, 10)), piel, rodilla, false);
    // La media, con gemelo y tobillo fino.
    const media = pieza(torno(t, [[0.05, 0], [0.058, 0.1], [0.075, 0.24], [0.07, 0.34]], 14), medias, rodilla);
    media.position.y = -0.21;
    // La franja de arriba de la media, doble, como las de la serie.
    const f1 = pieza(t.geo(new THREE.CylinderGeometry(0.073, 0.074, 0.04, 14)), franja, rodilla, false);
    f1.position.y = -0.07;
    const f2 = pieza(t.geo(new THREE.CylinderGeometry(0.075, 0.075, 0.018, 14)), franja, rodilla, false);
    f2.position.y = -0.12;
    // La bota: redonda de punta, con suela y las tres rayas.
    const pie = pieza(t.geo(new THREE.CapsuleGeometry(0.056, 0.15, 4, 12)), bota, rodilla);
    pie.rotation.x = Math.PI / 2;
    pie.scale.set(1.05, 1, 0.72);
    pie.position.set(0, -0.415, 0.055);
    const suela = pieza(t.geo(new THREE.BoxGeometry(0.09, 0.014, 0.23)), toon('#52525b'), rodilla, false);
    suela.position.set(0, -0.455, 0.055);
    for (let i = 0; i < 3; i += 1) {
      const raya = new THREE.Mesh(t.geo(new THREE.BoxGeometry(0.012, 0.05, 0.016)), blanco);
      raya.position.set(s * 0.058, -0.415, 0.03 + i * 0.03);
      raya.rotation.x = -0.5;
      rodilla.add(raya);
    }
    hips.add(cadera);
    return [cadera, rodilla] as const;
  };
  const [legL, shinL] = pierna(-1);
  const [legR, shinR] = pierna(1);

  // La cabeza de la serie, algo más grande que la vida: así es en el anime.
  const head = new THREE.Sprite(t.mat(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.05 })));
  head.scale.set(0.78, 1.03, 1);
  head.center.set(0.5, 0.5);
  head.position.y = 0.97;
  hips.add(head);

  const sombra = new THREE.Mesh(
    t.geo(new THREE.CircleGeometry(0.45, 24)),
    t.mat(new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.32, depthWrite: false })),
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.y = 0.012;
  root.add(sombra);

  root.scale.setScalar(0.86);
  return { root, body, hips, legL, legR, shinL, shinR, armL, armR, foreL, foreR, head, sombra };
}

/** Las posturas: articulaciones en radianes. */
export function posar(m: Muneco, pose: Pose, t: number) {
  const set = (g: THREE.Group, x: number, z = 0) => {
    g.rotation.x = x;
    g.rotation.z = z;
  };
  m.hips.position.y = 0.9;
  m.hips.rotation.set(0, 0, 0);
  if (pose === 'espera') {
    const r = Math.sin(t * 2.2) * 0.03;
    set(m.legL, 0.05);
    set(m.legR, -0.08);
    set(m.shinL, 0.05);
    set(m.shinR, 0.12);
    set(m.armL, 0.1, -0.18 - r);
    set(m.armR, -0.05, 0.18 + r);
    set(m.foreL, -0.3);
    set(m.foreR, -0.3);
    m.hips.rotation.x = 0.06;
    m.hips.position.y = 0.9 + r * 0.4;
  } else if (pose === 'carrera') {
    const c = Math.sin(t * 16);
    set(m.legL, c * 0.8);
    set(m.legR, -c * 0.8);
    set(m.shinL, 0.4 + Math.max(0, -c) * 0.9);
    set(m.shinR, 0.4 + Math.max(0, c) * 0.9);
    set(m.armL, -c * 0.7, -0.15);
    set(m.armR, c * 0.7, 0.15);
    set(m.foreL, -0.9);
    set(m.foreR, -0.9);
    m.hips.rotation.x = 0.18;
    m.hips.position.y = 0.9 + Math.abs(c) * 0.04;
  } else if (pose === 'golpeo') {
    // t de 0 a 1: la pierna de golpeo va atrás y luego pega y sigue.
    const atras = suave(clamp01(t / 0.45));
    const pega = suave(clamp01((t - 0.45) / 0.55));
    set(m.legR, lerp(0.9, -1.25, pega) * (0.4 + atras * 0.6));
    set(m.shinR, lerp(1.6, 0.1, pega));
    set(m.legL, -0.25);
    set(m.shinL, 0.25);
    set(m.armL, 0.2, lerp(-0.4, -1.1, pega));
    set(m.armR, -0.6, lerp(0.6, 0.9, pega));
    set(m.foreL, -0.4);
    set(m.foreR, -0.5);
    m.hips.rotation.x = lerp(0.1, -0.12, pega);
  } else if (pose === 'portero') {
    // Piernas abiertas, rodillas flexionadas, brazos abiertos y el bote.
    const b = Math.abs(Math.sin(t * 5.5));
    set(m.legL, -0.35, -0.32);
    set(m.legR, -0.35, 0.32);
    set(m.shinL, 0.65);
    set(m.shinR, 0.65);
    set(m.armL, -0.6, -0.95);
    set(m.armR, -0.6, 0.95);
    set(m.foreL, -0.5);
    set(m.foreR, -0.5);
    m.hips.rotation.x = 0.28;
    m.hips.position.y = 0.78 + b * 0.05;
  } else if (pose === 'estirada') {
    // Todo el cuerpo en línea, los brazos por encima de la cabeza.
    set(m.legL, 0.1, -0.2);
    set(m.legR, -0.1, 0.25);
    set(m.shinL, 0.2);
    set(m.shinR, 0.1);
    set(m.armL, 0, -2.9);
    set(m.armR, 0, 2.9);
    set(m.foreL, 0);
    set(m.foreR, 0);
    m.hips.position.y = 0.9;
  } else if (pose === 'celebra') {
    const s = Math.sin(t * 9);
    set(m.legL, -0.2 + s * 0.2);
    set(m.legR, 0.2 - s * 0.2);
    set(m.shinL, 0.5);
    set(m.shinR, 0.5);
    set(m.armL, 0, -2.7 + s * 0.2);
    set(m.armR, 0, 2.7 - s * 0.2);
    set(m.foreL, 0);
    set(m.foreR, 0);
    m.hips.position.y = 0.9 + Math.abs(s) * 0.18;
  } else if (pose === 'lamento') {
    set(m.legL, 0.05);
    set(m.legR, -0.05);
    set(m.shinL, 0.05);
    set(m.shinR, 0.05);
    set(m.armL, -2.2, -0.5);
    set(m.armR, -2.2, 0.5);
    set(m.foreL, -1.8);
    set(m.foreR, -1.8);
    m.hips.rotation.x = 0.35;
  }
}
