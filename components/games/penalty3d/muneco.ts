import * as THREE from 'three';

/* =========================================================================
 *  Los muñecos de la serie, en 3D.
 *
 *  Un cuerpo de piezas redondas —cadera, torso, brazos y piernas con sus
 *  articulaciones— y la cabeza dibujada, que es un sprite con el SVG de
 *  `PenaltyArt`. Los usan el estadio de los penaltis y el campo de la Liga
 *  de los Cromos, para que Oliver sea el mismo Oliver en los dos juegos.
 *
 *  El frente del muñeco es +z. Las posturas son ángulos de las
 *  articulaciones, en radianes, y se pueden pedir fotograma a fotograma.
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

/** Un muñeco de la serie: cuerpo de piezas redondas y la cabeza dibujada. */
export function crearMuneco(t: Taller, ropa: Ropa): Muneco {
  const std = (color: string, rough = 0.7) => t.mat(new THREE.MeshStandardMaterial({ color, roughness: rough }));
  const kit = std(ropa.kit, 0.62);
  const piel = std(ropa.skin, 0.6);
  const shorts = std(ropa.shorts, 0.7);
  const medias = std(ropa.socks, 0.8);
  const bota = std('#111318', 0.4);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Cadera, a 0,9 m. Todo lo de arriba cuelga de aquí.
  const hips = new THREE.Group();
  hips.position.y = 0.9;
  body.add(hips);

  const pantalon = new THREE.Mesh(t.geo(new THREE.CylinderGeometry(0.22, 0.24, 0.24, 14)), shorts);
  pantalon.scale.z = 0.7;
  pantalon.position.y = 0.02;
  pantalon.castShadow = true;
  hips.add(pantalon);

  const torsoMats: THREE.Material[] = [kit, kit, kit, kit, kit, kit];
  if (ropa.dorsal) {
    // La espalda (cara -z del cubo, índice 5) lleva nombre y número.
    torsoMats[5] = t.mat(new THREE.MeshStandardMaterial({ map: ropa.dorsal, roughness: 0.62 }));
  }
  const torso = new THREE.Mesh(t.geo(new THREE.BoxGeometry(0.44, 0.5, 0.25, 1, 1, 1)), torsoMats);
  torso.position.y = 0.37;
  torso.castShadow = true;
  hips.add(torso);
  const hombros = new THREE.Mesh(t.geo(new THREE.CapsuleGeometry(0.13, 0.26, 4, 10)), kit);
  hombros.rotation.z = Math.PI / 2;
  hombros.position.y = 0.58;
  hombros.scale.z = 0.9;
  hombros.castShadow = true;
  hips.add(hombros);

  const brazo = (s: number) => {
    const hombro = new THREE.Group();
    hombro.position.set(s * 0.29, 0.58, 0);
    const alto = new THREE.Mesh(t.geo(new THREE.CapsuleGeometry(0.062, 0.2, 4, 8)), ropa.bare ? piel : kit);
    alto.position.y = -0.14;
    alto.castShadow = true;
    hombro.add(alto);
    if (!ropa.mangaLarga && !ropa.bare) {
      const brazoPiel = new THREE.Mesh(t.geo(new THREE.CapsuleGeometry(0.052, 0.1, 4, 8)), piel);
      brazoPiel.position.y = -0.22;
      hombro.add(brazoPiel);
    }
    const codo = new THREE.Group();
    codo.position.y = -0.29;
    hombro.add(codo);
    const ante = new THREE.Mesh(t.geo(new THREE.CapsuleGeometry(0.052, 0.2, 4, 8)), ropa.mangaLarga ? kit : piel);
    ante.position.y = -0.13;
    ante.castShadow = true;
    codo.add(ante);
    const mano = new THREE.Mesh(
      t.geo(new THREE.SphereGeometry(ropa.guantes ? 0.1 : 0.06, 12, 10)),
      ropa.guantes ? std(ropa.guantes, 0.5) : piel,
    );
    mano.position.y = -0.3;
    mano.castShadow = true;
    codo.add(mano);
    hips.add(hombro);
    return [hombro, codo] as const;
  };
  const [armL, foreL] = brazo(-1);
  const [armR, foreR] = brazo(1);

  const pierna = (s: number) => {
    const cadera = new THREE.Group();
    cadera.position.set(s * 0.11, 0, 0);
    const muslo = new THREE.Mesh(t.geo(new THREE.CapsuleGeometry(0.08, 0.3, 4, 8)), piel);
    muslo.position.y = -0.22;
    muslo.castShadow = true;
    cadera.add(muslo);
    const rodilla = new THREE.Group();
    rodilla.position.y = -0.44;
    cadera.add(rodilla);
    const media = new THREE.Mesh(t.geo(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8)), medias);
    media.position.y = -0.2;
    media.castShadow = true;
    rodilla.add(media);
    const franja = new THREE.Mesh(t.geo(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 10)), std(ropa.band));
    franja.position.y = -0.04;
    rodilla.add(franja);
    const pie = new THREE.Mesh(t.geo(new THREE.BoxGeometry(0.12, 0.08, 0.26)), bota);
    pie.position.set(0, -0.43, 0.05);
    pie.castShadow = true;
    rodilla.add(pie);
    hips.add(cadera);
    return [cadera, rodilla] as const;
  };
  const [legL, shinL] = pierna(-1);
  const [legR, shinR] = pierna(1);

  const head = new THREE.Sprite(t.mat(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.05 })));
  head.scale.set(0.72, 0.95, 1);
  head.center.set(0.5, 0.5);
  head.position.y = 0.95;
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
