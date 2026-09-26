import * as THREE from 'three';

import { clamp01, crearMuneco, lerp, posar, suave, type Muneco, type Pose } from '@/components/games/penalty3d/muneco';
import {
  azar,
  texturaBalon,
  texturaBrillo,
  texturaCielo,
  texturaDorsal,
  texturaPublico,
  texturaRed,
  texturaSvg,
  texturaVallas,
} from '@/components/games/penalty3d/texturas';

/* =========================================================================
 *  El partido de la Liga de los Cromos, en un estadio en 3D.
 *
 *  Como el estadio de los penaltis, es una clase suelta, sin React: monta el
 *  campo entero con sus dos porterías, las gradas y los focos, pone a los
 *  once del campograma con las caras de sus cromos y a los once del rival, y
 *  cuenta cada jugada cuando el componente se la pide. **Las reglas no
 *  viven aquí**: el desenlace llega ya decidido por `lib/ligaCromos.ts` y la
 *  escena sólo lo enseña —el pase, el regate, la entrada, el paradón—, lo
 *  mejor que sabe.
 *
 *  Medidas de verdad, en metros: 105 × 68. El campo va a lo largo de la x;
 *  los de casa atacan hacia +x, así que la portería rival está en x = 52,5 y
 *  la propia en x = −52,5. La z crece hacia la cámara de la tele, que mira
 *  desde la banda, como en las retransmisiones.
 * ========================================================================= */

const LARGO = 105;
const ANCHO = 68;
const MX = LARGO / 2;
const MZ = ANCHO / 2;
const PORTERIA = { ancho: 7.32, alto: 2.44, fondo: 2 };
/** Los muñecos, algo más grandes que la vida: vistos desde la grada, si no, son hormigas. */
const ESCALA = 1.45;
const RADIO_BALON = 0.24;

type Linea = 'por' | 'def' | 'med' | 'del';

/** Un jugador de casa: su puesto del campograma y lo que se lee de él. */
export interface Ficha3D {
  id: string;
  line: Linea;
  /** Coordenadas del campograma: x de banda a banda, y de la portería propia a la rival. */
  x: number;
  y: number;
  nombre: string;
  dorsal: string;
  media: number;
  capitan: boolean;
  quimica: number;
  /** La cabeza de la serie, en SVG, y el color de piel de brazos y piernas. */
  cara: string;
  piel: string;
}

export interface Reparto3D {
  casa: {
    kit: string;
    shorts: string;
    socks: string;
    tinta: string;
    portero: string;
    fichas: Ficha3D[];
  };
  rival: {
    kit: string;
    shorts: string;
    tinta: string;
    portero: string;
    /** Once cabezas en SVG; la primera es la del portero. */
    caras: string[];
    pieles: string[];
    /** Quién es su estrella, para el letrero del que ataca. */
    estrella: string;
  };
  /** Pares de puestos con química: las líneas verdes del césped. */
  enlaces: [string, string][];
  grada: string[];
  vallas: { texto: string; fondo: string; tinta: string }[];
}

export type Escena = 'previa' | 'ataque' | 'defensa';
export type AccionId = 'tiro' | 'pase' | 'regate' | 'entrada' | 'presion' | 'portero';

/** Una jugada ya decidida, tal como hay que contarla. */
export interface Accion {
  tipo: 'ataque' | 'defensa';
  id: AccionId;
  de: string;
  a?: string;
  bien: boolean;
  gol: boolean;
}

/** Lo que se marca en el césped mientras se elige. */
export interface Marca {
  de: string;
  a?: string;
  id: AccionId;
  color: string;
}

interface Jugador {
  m: Muneco;
  id: string;
  casa: boolean;
  line: Linea;
  /** Coordenadas del campograma, para recolocarlo en cada escena. */
  cx: number;
  cy: number;
  meta: THREE.Vector3;
  vel: number;
  /** Adónde mira, en radianes; se gira hacia ahí poco a poco. */
  rumbo: number;
  /** Una postura impuesta por la jugada, con su tiempo; si no, corre o espera. */
  pose: Pose | null;
  poseT: number;
  /** Tirado al suelo: 0 de pie, 1 en plancha. Y hacia qué lado del mundo. */
  suelo: number;
  sueloHacia: THREE.Vector3;
  fase: number;
  etiqueta?: THREE.Sprite;
  aro?: THREE.Mesh;
}

interface Paso {
  dur: number;
  ini?: () => void;
  cada?: (k: number) => void;
}

interface Particula {
  obj: THREE.Sprite | THREE.Mesh;
  v: THREE.Vector3;
  vida: number;
  edad: number;
  gira?: THREE.Vector3;
}

/** Los once del rival, en el dibujo del campograma: un 4-4-2 de toda la vida. */
const RIVAL_PUESTOS: { line: Linea; x: number; y: number }[] = [
  { line: 'por', x: 50, y: 6 },
  { line: 'def', x: 13, y: 26 },
  { line: 'def', x: 37, y: 21 },
  { line: 'def', x: 63, y: 21 },
  { line: 'def', x: 87, y: 26 },
  { line: 'med', x: 13, y: 53 },
  { line: 'med', x: 38, y: 47 },
  { line: 'med', x: 62, y: 47 },
  { line: 'med', x: 87, y: 53 },
  { line: 'del', x: 36, y: 83 },
  { line: 'del', x: 64, y: 83 },
];
/** El que lleva el peligro cuando atacan: el segundo delantero. */
const ESTRELLA = 10;

/** Dónde se pone cada uno, según lo que esté pasando. `y` del campograma → x del mundo. */
function hondo(escena: Escena, casa: boolean, atacaCasa: boolean, line: Linea, y: number): number {
  // Se calcula como si fuera de casa, mirando a +x, y el rival lo refleja.
  const ataca = casa === atacaCasa;
  let x: number;
  if (line === 'por') x = escena === 'previa' ? -49 : ataca ? -40 : -50.3;
  else if (escena === 'previa') x = -50 + y * 0.5;
  else if (ataca) x = -20 + y * 0.6;
  else x = -50 + y * 0.42;
  return casa ? x : -x;
}

export class Partido3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private host: HTMLElement;
  private frame = 0;
  private reloj = new THREE.Clock();
  private tiempo = 0;
  private vivo = true;
  private observador?: ResizeObserver;
  private tirar: THREE.Texture[] = [];
  private geometrias: THREE.BufferGeometry[] = [];
  private materiales: THREE.Material[] = [];

  private casa: Jugador[] = [];
  private rival: Jugador[] = [];
  private balon!: THREE.Mesh;
  private sombraBalon!: THREE.Mesh;
  private conductor: Jugador | null = null;
  private brillo!: THREE.Texture;
  private vallas!: THREE.Texture;
  private publico: THREE.Mesh[] = [];
  private publicoSalta = 0;
  private flash!: THREE.PointLight;
  private redes: { mesh: THREE.Mesh; base: Float32Array; lado: 1 | -1; golpe: { z: number; y: number; f: number } }[] = [];
  private quimica: { mesh: THREE.Mesh; a: Jugador; b: Jugador }[] = [];
  private puntos!: THREE.Group;
  private particulas: Particula[] = [];

  private escena: Escena = 'previa';
  private atacaCasa = true;
  private etiquetas: 'todas' | 'marcadas' = 'todas';
  private marcadas = new Set<string>();
  private guion: Paso[] = [];
  private pasoI = 0;
  private pasoT = 0;
  private alAcabar: (() => void) | null = null;
  private cam = { foco: new THREE.Vector3(), dist: 44, orbita: 0.35 };
  private camMeta = { foco: new THREE.Vector3(), dist: 44 };
  private sigueBalon = false;
  private temblor = 0;
  private finalDe: 'gana' | 'empata' | 'pierde' | null = null;

  constructor(host: HTMLElement, private reparto: Reparto3D) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const lienzo = this.renderer.domElement;
    lienzo.style.display = 'block';
    lienzo.style.width = '100%';
    lienzo.style.height = '100%';
    host.appendChild(lienzo);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 600);
    this.scene.fog = new THREE.Fog('#0b1426', 120, 320);
    this.brillo = this.propia(texturaBrillo());

    this.montarLuz();
    this.montarCampo();
    this.montarPorteria(1);
    this.montarPorteria(-1);
    this.montarGradas();
    this.montarJugadores();
    this.montarBalon();
    this.montarPuntos();
    this.preparar('previa');

    this.ajustar();
    this.observador = new ResizeObserver(() => this.ajustar());
    this.observador.observe(host);

    const bucle = () => {
      if (!this.vivo) return;
      this.frame = requestAnimationFrame(bucle);
      this.paso();
    };
    bucle();
  }

  /* ---------------------------------------------------------------- montaje */

  private propia<T extends THREE.Texture>(t: T): T {
    this.tirar.push(t);
    return t;
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometrias.push(g);
    return g;
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.materiales.push(m);
    return m;
  }

  private montarLuz() {
    const cielo = new THREE.Mesh(
      this.geo(new THREE.SphereGeometry(400, 24, 16)),
      this.mat(new THREE.MeshBasicMaterial({ map: this.propia(texturaCielo()), side: THREE.BackSide, fog: false })),
    );
    this.scene.add(cielo);

    const r = azar(21);
    const estrellas = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i += 1) {
      const a = r() * Math.PI * 2;
      const e = 0.3 + r() * 1.1;
      estrellas[i * 3] = Math.cos(a) * Math.cos(e) * 360;
      estrellas[i * 3 + 1] = Math.sin(e) * 360;
      estrellas[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 360;
    }
    const g = this.geo(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(estrellas, 3));
    this.scene.add(new THREE.Points(g, this.mat(new THREE.PointsMaterial({ color: '#dbe7ff', size: 1.2, fog: false }))));

    this.scene.add(new THREE.HemisphereLight('#c3d4f7', '#1d4d25', 1.15));
    const sol = new THREE.DirectionalLight('#fff6e8', 2.2);
    sol.position.set(-30, 60, 40);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    Object.assign(sol.shadow.camera, { left: -62, right: 62, top: 45, bottom: -45, near: 10, far: 160 });
    sol.shadow.bias = -0.0008;
    this.scene.add(sol, sol.target);
    const contra = new THREE.DirectionalLight('#9fc1ff', 0.7);
    contra.position.set(40, 30, -50);
    this.scene.add(contra);

    this.flash = new THREE.PointLight('#ffd27a', 0, 30, 2);
    this.scene.add(this.flash);
  }

  /** El césped, pintado entero en un lienzo con sus líneas a medida. */
  private montarCampo() {
    const margen = 5;
    const px = 14;
    const W = (LARGO + margen * 2) * px;
    const H = (ANCHO + margen * 2) * px;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d')!;
    const X = (x: number) => (x + MX + margen) * px;
    const Z = (z: number) => (z + MZ + margen) * px;

    // Franjas de cortacésped, a lo ancho.
    const franja = (LARGO + margen * 2) / 22;
    for (let i = 0; i < 22; i += 1) {
      g.fillStyle = i % 2 === 0 ? '#2f8f3f' : '#28803a';
      g.fillRect(i * franja * px, 0, franja * px + 1, H);
    }
    const r = azar(5);
    for (let i = 0; i < 40000; i += 1) {
      g.fillStyle = r() < 0.5 ? 'rgba(18,70,28,0.16)' : 'rgba(120,200,110,0.09)';
      g.fillRect(r() * W, r() * H, 2, 2 + r() * 3);
    }
    // Las bocas de gol, gastadas.
    for (const s of [-1, 1]) {
      const grad = g.createRadialGradient(X(s * (MX - 3)), Z(0), 0, X(s * (MX - 3)), Z(0), 6 * px);
      grad.addColorStop(0, 'rgba(120,98,60,0.3)');
      grad.addColorStop(1, 'rgba(120,98,60,0)');
      g.fillStyle = grad;
      g.fillRect(X(s * (MX - 3)) - 6 * px, Z(0) - 6 * px, 12 * px, 12 * px);
    }

    g.strokeStyle = 'rgba(250,250,245,0.92)';
    g.lineWidth = Math.max(2, 0.14 * px);
    g.strokeRect(X(-MX), Z(-MZ), LARGO * px, ANCHO * px);
    g.beginPath();
    g.moveTo(X(0), Z(-MZ));
    g.lineTo(X(0), Z(MZ));
    g.stroke();
    g.beginPath();
    g.arc(X(0), Z(0), 9.15 * px, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#fbfbf6';
    const punto = (x: number) => {
      g.beginPath();
      g.arc(X(x), Z(0), 0.25 * px, 0, Math.PI * 2);
      g.fill();
    };
    punto(0);
    for (const s of [-1, 1]) {
      const linea = (x: number) => X(s * x);
      g.strokeRect(Math.min(linea(MX), linea(MX - 16.5)), Z(-20.16), 16.5 * px, 40.32 * px);
      g.strokeRect(Math.min(linea(MX), linea(MX - 5.5)), Z(-9.16), 5.5 * px, 18.32 * px);
      punto(s * (MX - 11));
      const a = Math.acos(5.5 / 9.15);
      g.beginPath();
      if (s > 0) g.arc(X(MX - 11), Z(0), 9.15 * px, Math.PI - a, Math.PI + a);
      else g.arc(X(-MX + 11), Z(0), 9.15 * px, -a, a);
      g.stroke();
      for (const t of [-1, 1]) {
        g.beginPath();
        g.arc(X(s * MX), Z(t * MZ), 1 * px, 0, Math.PI * 2);
        g.stroke();
      }
    }

    const tex = this.propia(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const cesped = new THREE.Mesh(
      this.geo(new THREE.PlaneGeometry(LARGO + margen * 2, ANCHO + margen * 2)),
      this.mat(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })),
    );
    cesped.rotation.x = -Math.PI / 2;
    cesped.receiveShadow = true;
    this.scene.add(cesped);

    const fuera = new THREE.Mesh(
      this.geo(new THREE.PlaneGeometry(400, 400)),
      this.mat(new THREE.MeshStandardMaterial({ color: '#23703a', roughness: 1 })),
    );
    fuera.rotation.x = -Math.PI / 2;
    fuera.position.y = -0.02;
    this.scene.add(fuera);
  }

  private montarPorteria(lado: 1 | -1) {
    const blanco = this.mat(new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35, metalness: 0.2 }));
    const x = lado * MX;
    const medio = PORTERIA.ancho / 2;
    const palo = this.geo(new THREE.CylinderGeometry(0.08, 0.08, PORTERIA.alto, 12));
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(palo, blanco);
      p.position.set(x, PORTERIA.alto / 2, s * medio);
      p.castShadow = true;
      this.scene.add(p);
    }
    const larguero = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.08, 0.08, PORTERIA.ancho + 0.16, 12)), blanco);
    larguero.rotation.x = Math.PI / 2;
    larguero.position.set(x, PORTERIA.alto, 0);
    larguero.castShadow = true;
    this.scene.add(larguero);

    const red = (rep: [number, number]) =>
      this.mat(
        new THREE.MeshStandardMaterial({
          map: this.propia(texturaRed(rep)),
          transparent: true,
          alphaTest: 0.25,
          side: THREE.DoubleSide,
          roughness: 0.9,
        }),
      );
    // El fondo, con vértices que se empujan: es el que se hincha con el gol.
    const fondoGeo = this.geo(new THREE.PlaneGeometry(PORTERIA.ancho, PORTERIA.alto, 24, 10));
    const fondo = new THREE.Mesh(fondoGeo, red([28, 10]));
    fondo.rotation.y = lado > 0 ? -Math.PI / 2 : Math.PI / 2;
    fondo.position.set(x + lado * PORTERIA.fondo, PORTERIA.alto / 2, 0);
    this.scene.add(fondo);
    this.redes.push({
      mesh: fondo,
      base: Float32Array.from(fondoGeo.attributes.position.array as Float32Array),
      lado,
      golpe: { z: 0, y: 0, f: 0 },
    });
    const techo = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(PORTERIA.fondo, PORTERIA.ancho)), red([8, 28]));
    techo.rotation.x = -Math.PI / 2;
    techo.position.set(x + (lado * PORTERIA.fondo) / 2, PORTERIA.alto, 0);
    this.scene.add(techo);
    for (const s of [-1, 1]) {
      const lat = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(PORTERIA.fondo, PORTERIA.alto)), red([8, 10]));
      lat.position.set(x + (lado * PORTERIA.fondo) / 2, PORTERIA.alto / 2, s * medio);
      this.scene.add(lat);
    }
  }

  private montarGradas() {
    const hormigon = this.mat(new THREE.MeshStandardMaterial({ color: '#1b2334', roughness: 0.9 }));
    const grada = (ancho: number, seed: number) => {
      const g = new THREE.Group();
      const tex = this.propia(texturaPublico(this.reparto.grada, seed));
      tex.repeat.set(ancho / 36, 3);
      const m = new THREE.Mesh(
        this.geo(new THREE.PlaneGeometry(ancho, 30)),
        this.mat(new THREE.MeshStandardMaterial({ map: tex, roughness: 1, color: '#aab3c5', emissive: '#141b2a', emissiveIntensity: 0.4 })),
      );
      m.rotation.x = -0.6;
      m.position.set(0, 10, -12);
      g.add(m);
      this.publico.push(m);
      const muro = new THREE.Mesh(this.geo(new THREE.BoxGeometry(ancho, 2.6, 0.8)), hormigon);
      muro.position.set(0, 1.3, 0);
      g.add(muro);
      const techo = new THREE.Mesh(this.geo(new THREE.BoxGeometry(ancho, 0.6, 12)), hormigon);
      techo.position.set(0, 23, -18);
      techo.rotation.x = 0.12;
      g.add(techo);
      const borde = new THREE.Mesh(this.geo(new THREE.BoxGeometry(ancho, 0.25, 0.25)), this.mat(new THREE.MeshBasicMaterial({ color: '#fef3c7' })));
      borde.position.set(0, 22.4, -12.2);
      g.add(borde);
      return g;
    };
    const lados: [number, number, number, number, number][] = [
      // ancho, x, z, giro, semilla. La de la banda de la cámara no se monta: taparía el campo.
      [130, 0, -(MZ + 9), 0, 3],
      [90, MX + 11, 0, -Math.PI / 2, 7],
      [90, -(MX + 11), 0, Math.PI / 2, 9],
    ];
    for (const [ancho, x, z, giro, seed] of lados) {
      const g = grada(ancho, seed);
      g.position.set(x, 0, z);
      g.rotation.y = giro;
      this.scene.add(g);
    }

    this.vallas = this.propia(texturaVallas(this.reparto.vallas));
    this.vallas.repeat.set(3, 1);
    const valla = (largo: number, x: number, z: number, giro: number) => {
      const m = new THREE.Mesh(
        this.geo(new THREE.BoxGeometry(largo, 1, 0.15)),
        this.mat(new THREE.MeshBasicMaterial({ map: this.vallas, toneMapped: false })),
      );
      m.position.set(x, 0.5, z);
      m.rotation.y = giro;
      this.scene.add(m);
    };
    valla(LARGO + 6, 0, -(MZ + 4), 0);
    valla(LARGO + 6, 0, MZ + 4, Math.PI);
    valla(ANCHO - 6, MX + 5, 0, -Math.PI / 2);
    valla(ANCHO - 6, -(MX + 5), 0, Math.PI / 2);

    const torreMat = this.mat(new THREE.MeshStandardMaterial({ color: '#2a3244', roughness: 0.6, metalness: 0.4 }));
    const glow = this.mat(
      new THREE.SpriteMaterial({ map: this.brillo, color: '#fff7df', blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    const panelMat = this.mat(new THREE.MeshBasicMaterial({ color: '#fffbea', toneMapped: false }));
    for (const [x, z] of [
      [-(MX + 20), -(MZ + 20)],
      [MX + 20, -(MZ + 20)],
      [-(MX + 20), MZ + 20],
      [MX + 20, MZ + 20],
    ]) {
      const torre = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.5, 0.9, 44, 8)), torreMat);
      torre.position.set(x, 22, z);
      this.scene.add(torre);
      const panel = new THREE.Mesh(this.geo(new THREE.BoxGeometry(10, 5, 0.6)), panelMat);
      panel.position.set(x, 45, z);
      panel.lookAt(0, 0, 0);
      this.scene.add(panel);
      const s = new THREE.Sprite(glow);
      s.position.set(x, 45, z);
      s.scale.set(40, 40, 1);
      this.scene.add(s);
    }
  }

  /** Un letrero sobre la cabeza: el nombre, la media, la química y el brazalete. */
  private letrero(texto: string, media: number | null, opts: { capitan?: boolean; quimica?: number; peligro?: boolean }) {
    const W = 360;
    const H = 110;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d')!;
    const caja = (x: number, y: number, w: number, h: number, r: number) => {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };
    g.font = '900 38px system-ui, "Segoe UI", Arial, sans-serif';
    const ancho = Math.min(W - 20, g.measureText(texto).width + (media !== null ? 96 : 36) + (opts.capitan ? 44 : 0));
    const x0 = (W - ancho) / 2;
    caja(x0, 8, ancho, 62, 16);
    g.fillStyle = opts.peligro ? 'rgba(190,18,60,0.92)' : 'rgba(11,18,32,0.88)';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = opts.peligro ? '#fecdd3' : 'rgba(255,255,255,0.35)';
    g.stroke();
    let x = x0 + 16;
    g.textBaseline = 'middle';
    if (opts.capitan) {
      g.fillStyle = '#fcd34d';
      g.beginPath();
      g.arc(x + 16, 39, 16, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#241a14';
      g.font = '900 22px system-ui, "Segoe UI", Arial, sans-serif';
      g.textAlign = 'center';
      g.fillText('C', x + 16, 40);
      x += 42;
    }
    g.textAlign = 'left';
    g.fillStyle = '#ffffff';
    g.font = '900 38px system-ui, "Segoe UI", Arial, sans-serif';
    g.fillText(texto, x, 41, ancho - (x - x0) - (media !== null ? 80 : 16));
    if (media !== null) {
      caja(x0 + ancho - 72, 16, 60, 46, 10);
      g.fillStyle = '#fcd34d';
      g.fill();
      g.fillStyle = '#241a14';
      g.textAlign = 'center';
      g.fillText(String(media), x0 + ancho - 42, 41);
    }
    // La química: puntitos verdes debajo.
    for (let i = 0; i < (opts.quimica ?? 0); i += 1) {
      g.fillStyle = '#4ade80';
      g.beginPath();
      g.arc(W / 2 + (i - ((opts.quimica ?? 1) - 1) / 2) * 22, 90, 8, 0, Math.PI * 2);
      g.fill();
    }
    const tex = this.propia(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(this.mat(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })));
    s.scale.set(5.4, 1.65, 1);
    s.center.set(0.5, 0);
    s.renderOrder = 20;
    this.scene.add(s);
    return s;
  }

  private montarJugadores() {
    const { casa, rival } = this.reparto;
    const taller = { geo: <T extends THREE.BufferGeometry>(g: T) => this.geo(g), mat: <T extends THREE.Material>(m: T) => this.mat(m) };
    const aroGeo = this.geo(new THREE.RingGeometry(1.25, 1.65, 40));

    const nuevo = (m: Muneco, id: string, esCasa: boolean, line: Linea, cx: number, cy: number, i: number): Jugador => {
      m.root.scale.setScalar(0.86 * ESCALA);
      this.scene.add(m.root);
      return {
        m,
        id,
        casa: esCasa,
        line,
        cx,
        cy,
        meta: new THREE.Vector3(),
        vel: 7,
        rumbo: esCasa ? Math.PI / 2 : -Math.PI / 2,
        pose: null,
        poseT: 0,
        suelo: 0,
        sueloHacia: new THREE.Vector3(0, 0, 1),
        fase: i * 0.77,
      };
    };

    casa.fichas.forEach((f, i) => {
      const portero = f.line === 'por';
      const dorsal = this.propia(
        texturaDorsal({ kit: portero ? casa.portero : casa.kit, tinta: casa.tinta, nombre: f.nombre, numero: f.dorsal }),
      );
      const m = crearMuneco(taller, {
        kit: portero ? casa.portero : casa.kit,
        shorts: casa.shorts,
        socks: portero ? casa.portero : casa.socks,
        band: casa.tinta,
        skin: f.piel,
        guantes: portero ? '#facc15' : undefined,
        mangaLarga: portero,
        dorsal,
      });
      const j = nuevo(m, f.id, true, f.line, f.x, f.y, i);
      j.etiqueta = this.letrero(f.nombre, f.media, { capitan: f.capitan, quimica: f.quimica });
      const aro = new THREE.Mesh(
        aroGeo,
        this.mat(new THREE.MeshBasicMaterial({ color: '#fcd34d', transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false })),
      );
      aro.rotation.x = -Math.PI / 2;
      aro.visible = false;
      aro.renderOrder = 5;
      this.scene.add(aro);
      j.aro = aro;
      this.casa.push(j);
    });

    RIVAL_PUESTOS.forEach((p, i) => {
      const portero = p.line === 'por';
      const m = crearMuneco(taller, {
        kit: portero ? rival.portero : rival.kit,
        shorts: rival.shorts,
        socks: portero ? rival.portero : rival.kit,
        band: rival.tinta,
        skin: rival.pieles[i] ?? '#e7b590',
        guantes: portero ? '#facc15' : undefined,
        mangaLarga: portero,
      });
      const j = nuevo(m, `rival-${i}`, false, p.line, p.x, p.y, i + 11);
      if (i === ESTRELLA) j.etiqueta = this.letrero(`★ ${rival.estrella}`, null, { peligro: true });
      this.rival.push(j);
    });

    // Las cabezas llegan un instante después: son SVG que hay que pintar.
    const todas = [...casa.fichas.map((f) => f.cara), ...rival.caras];
    void Promise.all(todas.map((svg) => texturaSvg(svg))).then((texs) => {
      if (!this.vivo) {
        texs.forEach((t) => t.dispose());
        return;
      }
      texs.forEach((t, i) => {
        this.propia(t);
        const j = i < this.casa.length ? this.casa[i] : this.rival[i - this.casa.length];
        if (!j) return;
        const mat = j.m.head.material as THREE.SpriteMaterial;
        mat.map = t;
        mat.needsUpdate = true;
      });
    });

    // Las líneas de química: dos vecinos del mismo club, encendidos en verde.
    const verde = this.mat(
      new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
    );
    const plano = this.geo(new THREE.PlaneGeometry(1, 0.55));
    for (const [a, b] of this.reparto.enlaces) {
      const ja = this.casa.find((j) => j.id === a);
      const jb = this.casa.find((j) => j.id === b);
      if (!ja || !jb) continue;
      const mesh = new THREE.Mesh(plano, verde);
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 4;
      this.scene.add(mesh);
      this.quimica.push({ mesh, a: ja, b: jb });
    }
  }

  private montarBalon() {
    this.balon = new THREE.Mesh(
      this.geo(new THREE.SphereGeometry(RADIO_BALON, 28, 18)),
      this.mat(new THREE.MeshStandardMaterial({ map: this.propia(texturaBalon()), roughness: 0.45 })),
    );
    this.balon.castShadow = true;
    this.scene.add(this.balon);
    this.sombraBalon = new THREE.Mesh(
      this.geo(new THREE.CircleGeometry(0.3, 20)),
      this.mat(new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.4, depthWrite: false })),
    );
    this.sombraBalon.rotation.x = -Math.PI / 2;
    this.scene.add(this.sombraBalon);
    this.ponerBalon(new THREE.Vector3(0, RADIO_BALON, 0));
  }

  /** Los puntitos de lo que va a pasar: el pase y el tiro, dibujados antes de elegir. */
  private montarPuntos() {
    this.puntos = new THREE.Group();
    const dot = this.mat(
      new THREE.SpriteMaterial({ map: this.brillo, color: '#ffffff', transparent: true, depthWrite: false, depthTest: false }),
    );
    for (let i = 0; i < 28; i += 1) {
      const s = new THREE.Sprite(dot);
      s.scale.setScalar(0.9);
      s.renderOrder = 15;
      this.puntos.add(s);
    }
    this.puntos.visible = false;
    this.scene.add(this.puntos);
  }

  private ponerBalon(p: THREE.Vector3) {
    const antes = this.balon.position.clone();
    this.balon.position.copy(p);
    const d = p.clone().sub(antes);
    this.balon.rotation.x += d.z / RADIO_BALON;
    this.balon.rotation.z -= d.x / RADIO_BALON;
    this.sombraBalon.position.set(p.x, 0.03, p.z);
    const alto = Math.max(0, p.y - RADIO_BALON);
    this.sombraBalon.scale.setScalar(1 + alto * 0.15);
    (this.sombraBalon.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.4 - alto * 0.05);
  }

  /* -------------------------------------------------------------- órdenes */

  private todos() {
    return [...this.casa, ...this.rival];
  }

  private buscar(id: string | undefined): Jugador | undefined {
    return id ? this.todos().find((j) => j.id === id) : undefined;
  }

  private estrella() {
    return this.rival[ESTRELLA];
  }

  private portero(casa: boolean) {
    return (casa ? this.casa : this.rival).find((j) => j.line === 'por') ?? (casa ? this.casa[0] : this.rival[0]);
  }

  /**
   * Coloca a todos para lo que toca: la presentación, un ataque de casa o
   * uno del rival. Se van a su sitio corriendo, que da vida, y el balón se
   * lo lleva el que lo tiene.
   */
  preparar(escena: Escena, conBalon?: string) {
    this.escena = escena;
    this.finalDe = null;
    this.guion = [];
    this.atacaCasa = escena !== 'defensa';
    const lleva = escena === 'defensa' ? this.estrella() : this.buscar(conBalon);
    for (const j of this.todos()) {
      j.pose = null;
      j.suelo = 0;
      j.vel = 8;
      const x = hondo(escena, j.casa, this.atacaCasa, j.line, j.cy);
      const z = (j.cx - 50) * 0.58 * (j.casa ? 1 : -1);
      j.meta.set(x, 0, escena === 'previa' ? z : z * 0.85);
    }
    if (escena === 'previa') {
      for (const j of this.todos()) {
        j.m.root.position.copy(j.meta);
        j.rumbo = j.casa ? Math.PI / 2 : -Math.PI / 2;
      }
      this.conductor = null;
      this.ponerBalon(new THREE.Vector3(0, RADIO_BALON, 0));
      this.etiquetas = 'todas';
    } else {
      // Entre jugada y jugada hay corte de cámara, como en la tele: cada uno
      // aparece a unos pasos de su sitio y llega trotando.
      for (const j of this.todos()) {
        const atras = j.casa === this.atacaCasa ? -3 : 3;
        j.m.root.position.set(j.meta.x + (j.casa ? atras : -atras), 0, j.meta.z);
      }
      this.etiquetas = 'marcadas';
      // El que lleva el peligro, más adelantado.
      if (escena === 'defensa') this.estrella().meta.set(-24, 0, 4);
      this.conductor = lleva ?? null;
      if (escena === 'ataque' && lleva) lleva.meta.x = Math.max(lleva.meta.x, 4);
    }
    this.sigueBalon = false;
    this.camMeta.foco.set(escena === 'ataque' ? 22 : escena === 'defensa' ? -26 : 0, 0, 0);
    this.camMeta.dist = escena === 'previa' ? 80 : 44;
    this.resaltar([], null);
    this.puntos.visible = false;
  }

  /** Las opciones de la jugada, marcadas en el césped; la que está en foco, con su trayectoria. */
  resaltar(marcas: Marca[], foco: number | null) {
    this.marcadas = new Set(marcas.flatMap((m) => [m.de, m.a].filter((x): x is string => Boolean(x))));
    for (const j of this.casa) {
      if (!j.aro) continue;
      const i = marcas.findIndex((m) => m.de === j.id);
      const recibe = marcas.find((m) => m.a === j.id);
      j.aro.visible = i >= 0 || Boolean(recibe);
      const mat = j.aro.material as THREE.MeshBasicMaterial;
      const m = i >= 0 ? marcas[i] : recibe;
      if (m) mat.color.set(m.color);
      mat.opacity = foco === null || i === foco || (recibe && marcas[foco] === recibe) ? 0.95 : 0.3;
      j.aro.userData.foco = foco !== null && (i === foco || marcas[foco] === recibe);
    }
    const m = foco !== null ? marcas[foco] : undefined;
    if (!m) {
      this.puntos.visible = false;
      return;
    }
    const de = this.buscar(m.de);
    if (!de) return;
    const tramos: [THREE.Vector3, THREE.Vector3, number][] = [];
    const desde = de.meta.clone();
    const puerta = new THREE.Vector3(MX, 1, 0);
    if (m.id === 'pase') {
      const a = this.buscar(m.a);
      if (a) {
        tramos.push([desde, a.meta.clone(), 3]);
        tramos.push([a.meta.clone(), puerta, 2]);
      }
    } else if (m.id === 'tiro' || m.id === 'regate') {
      tramos.push([desde, puerta, m.id === 'tiro' ? 3 : 1]);
    } else {
      const e = this.estrella();
      tramos.push([desde, e.meta.clone(), 0.5]);
    }
    const n = this.puntos.children.length;
    const porTramo = Math.floor(n / Math.max(1, tramos.length));
    this.puntos.children.forEach((s, i) => {
      const t = Math.min(tramos.length - 1, Math.floor(i / porTramo));
      const [a, b, h] = tramos[t];
      const k = ((i % porTramo) + 0.5) / porTramo;
      const p = a.clone().lerp(b, k);
      p.y = 0.4 + h * 4 * k * (1 - k);
      s.position.copy(p);
      s.userData.k = i / n;
      ((s as THREE.Sprite).material as THREE.SpriteMaterial).color.set(m.color);
    });
    this.puntos.visible = true;
  }

  /** Qué jugador de casa hay bajo el dedo, si hay alguno marcado. */
  jugadorEn(px: number, py: number): string | null {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    let mejor: { id: string; d: number } | null = null;
    for (const j of this.casa) {
      if (!this.marcadas.has(j.id)) continue;
      const p = j.m.root.position.clone();
      p.y = 1.3;
      p.project(this.camera);
      const sx = ((p.x + 1) / 2) * w;
      const sy = ((1 - p.y) / 2) * h;
      const d = Math.hypot(sx - px, sy - py);
      if (d < Math.max(44, w * 0.07) && (!mejor || d < mejor.d)) mejor = { id: j.id, d };
    }
    return mejor?.id ?? null;
  }

  /* --------------------------------------------------------- las jugadas */

  private pies(j: Jugador, delante = 0.9): THREE.Vector3 {
    const p = j.m.root.position;
    return new THREE.Vector3(p.x + Math.sin(j.rumbo) * delante, RADIO_BALON, p.z + Math.cos(j.rumbo) * delante);
  }

  private mirarA(j: Jugador, p: THREE.Vector3) {
    const d = p.clone().sub(j.m.root.position);
    if (d.lengthSq() > 0.01) j.rumbo = Math.atan2(d.x, d.z);
  }

  private cercano(de: THREE.Vector3, lista: Jugador[]) {
    return lista.reduce((a, b) => (b.m.root.position.distanceTo(de) < a.m.root.position.distanceTo(de) ? b : a));
  }

  /** Un vuelo del balón: de aquí a allí, con su parábola. */
  private vuelo(de: THREE.Vector3, a: THREE.Vector3, alto: number) {
    return (k: number) => {
      const p = de.clone().lerp(a, k);
      p.y = lerp(de.y, a.y, k) + alto * 4 * k * (1 - k);
      return p;
    };
  }

  /** Un golpeo: el muñeco pega y el balón sale hacia `a`. */
  private golpeo(j: Jugador, a: THREE.Vector3, alto: number, dur: number, alGolpe?: () => void): Paso[] {
    let vuelo: (k: number) => THREE.Vector3 = () => a;
    return [
      {
        dur: 0.28,
        ini: () => {
          j.pose = 'golpeo';
          j.meta.copy(j.m.root.position);
          this.mirarA(j, a);
        },
        cada: (k) => {
          j.poseT = k * 0.5;
        },
      },
      {
        dur,
        ini: () => {
          this.conductor = null;
          vuelo = this.vuelo(this.pies(j, 0.7), a, alto);
          alGolpe?.();
          this.sigueBalon = true;
        },
        cada: (k) => {
          j.poseT = 0.5 + Math.min(1, k * 3) * 0.5;
          if (k > 0.35) j.pose = null;
          this.ponerBalon(vuelo(suave(Math.min(1, k * 1.05))));
        },
      },
    ];
  }

  /** El portero se tira: hacia dónde y cuánto, con `k` de 0 a 1. */
  private estirada(p: Jugador, hacia: THREE.Vector3, k: number) {
    p.pose = 'estirada';
    p.suelo = suave(Math.min(1, k * 1.6));
    p.sueloHacia.copy(hacia).sub(p.m.root.position).setY(0).normalize();
  }

  /** El remate a puerta: gol, parada o fuera. */
  private remate(tirador: Jugador, lado: 1 | -1, desenlace: 'gol' | 'parada' | 'fuera', alGolpe?: () => void, alLlegar?: () => void): Paso[] {
    const portero = this.portero(lado < 0);
    const z = (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random() * 1.5);
    const y = 0.5 + Math.random() * 1.5;
    const destino =
      desenlace === 'gol'
        ? new THREE.Vector3(lado * (MX + 1.4), y, z)
        : desenlace === 'parada'
          ? new THREE.Vector3(lado * (MX - 1.1), 1.1, z * 0.7)
          : new THREE.Vector3(lado * (MX + 4), y + 1.4, z > 0 ? 6.5 : -6.5);
    const pasos = this.golpeo(tirador, destino, desenlace === 'fuera' ? 2.4 : 1.4, 0.75, alGolpe);
    const vuela = pasos[1];
    const cada = vuela.cada!;
    vuela.cada = (k) => {
      cada(k);
      this.camMeta.dist = lerp(this.camMeta.dist, 30, 0.05);
      // El portero reacciona: se tira al balón si para, al otro lado si no.
      if (k > 0.2) {
        const hacia = desenlace === 'parada' ? destino : new THREE.Vector3(lado * MX, 0, -z * 0.6);
        this.estirada(portero, hacia, (k - 0.2) / 0.8);
        portero.meta.z = lerp(portero.meta.z, hacia.z * 0.7, 0.08);
      }
    };
    pasos.push({
      dur: 0.05,
      ini: () => {
        alLlegar?.();
        if (desenlace === 'gol') this.golEn(lado, destino);
        if (desenlace === 'parada') this.conductor = null;
      },
    });
    return pasos;
  }

  private golEn(lado: 1 | -1, en: THREE.Vector3) {
    const red = this.redes.find((r) => r.lado === lado);
    if (red) red.golpe = { z: en.z, y: en.y - PORTERIA.alto / 2, f: 1 };
    this.flash.position.set(lado * (MX + 1), 1.5, en.z);
    this.flash.intensity = 60;
    this.temblor = 0.8;
    this.publicoSalta = 2.5;
    const colores = lado > 0 ? [this.reparto.casa.kit, '#fcd34d', '#ffffff', '#4ade80'] : [this.reparto.rival.kit, '#ffffff'];
    this.confeti(new THREE.Vector3(lado * (MX - 4), 8, en.z), colores);
  }

  private confeti(en: THREE.Vector3, colores: string[]) {
    const geo = this.geo(new THREE.PlaneGeometry(0.35, 0.22));
    for (let i = 0; i < 90; i += 1) {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: colores[i % colores.length], side: THREE.DoubleSide, transparent: true }),
      );
      m.position.copy(en).add(new THREE.Vector3((Math.random() - 0.5) * 10, Math.random() * 4, (Math.random() - 0.5) * 10));
      this.scene.add(m);
      this.particulas.push({
        obj: m,
        v: new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 5, (Math.random() - 0.5) * 6),
        vida: 2.5 + Math.random(),
        edad: 0,
        gira: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0),
      });
    }
  }

  /** La celebración: el que marca corre al córner y los suyos detrás; los otros, cabizbajos. */
  private celebrar(goleador: Jugador): Paso {
    const suyos = goleador.casa ? this.casa : this.rival;
    const otros = goleador.casa ? this.rival : this.casa;
    const corner = new THREE.Vector3(goleador.casa ? MX - 8 : -(MX - 8), 0, MZ - 10);
    return {
      dur: 2.4,
      ini: () => {
        this.sigueBalon = false;
        goleador.pose = null;
        goleador.meta.copy(corner);
        goleador.vel = 9;
        suyos
          .filter((j) => j !== goleador && j.line !== 'por')
          .forEach((j, i) => {
            j.pose = null;
            j.vel = 8;
            j.meta.copy(corner).add(new THREE.Vector3(Math.cos(i) * (3 + (i % 3)), 0, -Math.abs(Math.sin(i)) * (3 + (i % 4))));
          });
        otros.forEach((j) => {
          j.meta.copy(j.m.root.position);
          if (j.line !== 'por') j.pose = 'lamento';
        });
        this.camMeta.dist = 26;
      },
      cada: (k) => {
        this.camMeta.foco.lerp(goleador.m.root.position, 0.1);
        if (goleador.m.root.position.distanceTo(corner) < 1.2 || k > 0.55) {
          goleador.pose = 'celebra';
          goleador.poseT = this.tiempo;
          this.mirarA(goleador, this.camera.position);
        }
      },
    };
  }

  /** Un robo: el nuestro se queda la pelota y levanta los brazos. */
  private robo(j: Jugador): Paso {
    return {
      dur: 1.3,
      ini: () => {
        this.conductor = j;
        j.suelo = 0;
        j.pose = 'celebra';
        j.meta.copy(j.m.root.position);
        this.estrella().pose = 'lamento';
        this.camMeta.dist = 30;
      },
      cada: (k) => {
        j.poseT = this.tiempo;
        if (k > 0.6) j.pose = null;
      },
    };
  }

  /** La jugada decidida, contada. La promesa se cumple cuando acaba de verse. */
  jugar(a: Accion, cbs: { alChutar?: () => void; alResolver?: () => void } = {}): Promise<void> {
    const pasos: Paso[] = [];
    const de = this.buscar(a.de);
    if (!de) {
      cbs.alResolver?.();
      return Promise.resolve();
    }
    this.resaltar([], null);
    this.puntos.visible = false;
    this.etiquetas = 'marcadas';
    this.marcadas = new Set([a.de, a.a].filter((x): x is string => Boolean(x)));
    const sigue = () => {
      this.sigueBalon = true;
    };

    if (a.tipo === 'ataque') {
      const defensas = this.rival.filter((j) => j.line !== 'por');
      pasos.push({
        dur: 0.4,
        ini: () => {
          this.conductor = de;
          de.meta.copy(de.m.root.position);
          this.camMeta.dist = 40;
          sigue();
        },
      });
      if (a.id === 'pase') {
        const recibe = this.buscar(a.a) ?? de;
        const hueco = new THREE.Vector3(Math.min(MX - 16, recibe.m.root.position.x + 9), RADIO_BALON, recibe.m.root.position.z * 0.55);
        const corta = this.cercano(hueco, defensas);
        const llega = a.bien ? hueco : hueco.clone().lerp(corta.m.root.position, 0.3).setY(RADIO_BALON);
        pasos.push({
          dur: 0.01,
          ini: () => {
            recibe.meta.copy(hueco);
            recibe.vel = 9;
            if (!a.bien) {
              corta.meta.copy(llega);
              corta.vel = 12;
            }
          },
        });
        pasos.push(...this.golpeo(de, llega, 2.2, 1.0, cbs.alChutar));
        if (a.bien) {
          pasos.push({
            dur: 0.25,
            ini: () => {
              this.conductor = recibe;
              recibe.meta.copy(recibe.m.root.position).add(new THREE.Vector3(2, 0, 0));
            },
          });
          pasos.push(...this.remate(recibe, 1, 'gol', cbs.alChutar, cbs.alResolver), this.celebrar(recibe));
        } else {
          pasos.push(...this.despeje(corta, cbs));
        }
      } else if (a.id === 'regate') {
        const hasta = new THREE.Vector3(Math.min(MX - 14, de.m.root.position.x + 14), 0, de.m.root.position.z * 0.5);
        const sale = this.cercano(hasta, defensas);
        pasos.push({
          dur: 1.35,
          ini: () => {
            this.conductor = de;
            de.meta.copy(hasta);
            de.vel = 8;
            sale.meta.copy(de.m.root.position.clone().lerp(hasta, 0.55));
            sale.vel = 9;
          },
          cada: (k) => {
            if (k > 0.55) {
              if (a.bien) {
                // Se tira al suelo y no la toca: el nuestro sigue.
                this.estirada(sale, de.m.root.position.clone().add(new THREE.Vector3(0, 0, 3)), (k - 0.55) / 0.45);
              } else {
                this.conductor = sale;
                de.meta.copy(de.m.root.position);
                de.pose = 'lamento';
              }
            }
          },
        });
        if (a.bien) pasos.push(...this.remate(de, 1, 'gol', cbs.alChutar, cbs.alResolver), this.celebrar(de));
        else pasos.push(...this.despeje(sale, cbs));
      } else {
        // Disparo desde donde está, tras dos zancadas.
        const hasta = new THREE.Vector3(Math.min(MX - 22, de.m.root.position.x + 5), 0, de.m.root.position.z * 0.8);
        pasos.push({
          dur: 0.6,
          ini: () => {
            this.conductor = de;
            de.meta.copy(hasta);
          },
        });
        pasos.push(...this.remate(de, 1, a.bien ? 'gol' : 'parada', cbs.alChutar, cbs.alResolver));
        pasos.push(a.bien ? this.celebrar(de) : this.blocaje());
      }
    } else {
      const estrella = this.estrella();
      const portero = this.portero(true);
      pasos.push({
        dur: 0.3,
        ini: () => {
          this.conductor = estrella;
          sigue();
          this.camMeta.dist = 40;
        },
      });
      const encuentro = new THREE.Vector3(-34, 0, estrella.m.root.position.z * 0.5);
      if (a.id === 'portero') {
        pasos.push({
          dur: 1.2,
          ini: () => {
            estrella.meta.copy(new THREE.Vector3(-38, 0, 2));
            estrella.vel = 9;
          },
        });
        const final = a.bien ? 'parada' : a.gol ? 'gol' : 'fuera';
        pasos.push(...this.remate(estrella, -1, final, cbs.alChutar, cbs.alResolver));
        pasos.push(a.gol ? this.celebrar(estrella) : a.bien ? this.robo(portero) : this.suspiro());
      } else {
        const entra = a.id === 'entrada';
        pasos.push({
          dur: 1.25,
          ini: () => {
            estrella.meta.copy(encuentro);
            estrella.vel = 8;
            de.meta.copy(encuentro.clone().add(new THREE.Vector3(-1.2, 0, 0.6)));
            de.vel = entra ? 9 : 11;
          },
          cada: (k) => {
            if (entra && k > 0.6) this.estirada(de, estrella.m.root.position, (k - 0.6) / 0.4);
            if (a.bien && k > 0.8) this.conductor = de;
          },
        });
        if (a.bien) {
          pasos.push(this.robo(de));
        } else {
          pasos.push({
            dur: 0.7,
            ini: () => {
              this.conductor = estrella;
              estrella.meta.copy(new THREE.Vector3(-40, 0, 1));
              if (!entra) de.pose = 'lamento';
            },
          });
          pasos.push(...this.remate(estrella, -1, a.gol ? 'gol' : 'fuera', cbs.alChutar, cbs.alResolver));
          pasos.push(a.gol ? this.celebrar(estrella) : this.suspiro());
        }
      }
      // En defensa, el desenlace se canta al acabar el duelo si no ha habido remate.
      if (a.bien && a.id !== 'portero') {
        const robo = pasos[pasos.length - 1];
        const ini = robo.ini;
        robo.ini = () => {
          ini?.();
          cbs.alResolver?.();
        };
      }
    }

    return new Promise((resolve) => {
      this.guion = pasos;
      this.pasoI = 0;
      this.pasoT = 0;
      this.alAcabar = resolve;
      pasos[0]?.ini?.();
    });
  }

  /** El defensa rival se la queda y la manda lejos. */
  private despeje(j: Jugador, cbs: { alChutar?: () => void; alResolver?: () => void }): Paso[] {
    const lejos = new THREE.Vector3(-4, RADIO_BALON, -MZ + 6);
    const pasos = this.golpeo(j, lejos, 9, 1.4);
    pasos[0].ini = ((ini) => () => {
      this.conductor = j;
      ini?.();
      cbs.alResolver?.();
    })(pasos[0].ini);
    pasos.push({ dur: 0.5, ini: () => (this.camMeta.dist = 50) });
    return pasos;
  }

  /** El portero rival la bloca y la guarda. */
  private blocaje(): Paso {
    const p = this.portero(false);
    return {
      dur: 1.2,
      ini: () => {
        this.sigueBalon = false;
        this.camMeta.foco.copy(p.m.root.position);
      },
      cada: (k) => {
        p.suelo = 1 - suave(k);
        this.ponerBalon(p.m.root.position.clone().add(new THREE.Vector3(0, 1.1 * (1 - p.suelo * 0.6), 0)));
      },
    };
  }

  /** El remate se va fuera: ¡uf! */
  private suspiro(): Paso {
    return { dur: 1.1, ini: () => (this.sigueBalon = false) };
  }

  /** Al pitido final: los de casa celebran, o se quedan a la espera, o cabizbajos. */
  final(r: 'gana' | 'empata' | 'pierde') {
    this.preparar('previa');
    this.finalDe = r;
    this.etiquetas = 'todas';
    // Los de casa, en corro en el círculo central; los del rival, a un lado.
    const casa: Pose = r === 'gana' ? 'celebra' : r === 'pierde' ? 'lamento' : 'espera';
    const rival: Pose = r === 'pierde' ? 'celebra' : r === 'gana' ? 'lamento' : 'espera';
    this.casa.forEach((j, i) => {
      const a = (i / this.casa.length) * Math.PI * 2;
      j.meta.set(Math.cos(a) * 5, 0, Math.sin(a) * 5);
      j.m.root.position.copy(j.meta);
      j.rumbo = Math.atan2(-j.meta.x, -j.meta.z) + Math.PI;
      j.pose = casa;
    });
    this.rival.forEach((j, i) => {
      j.meta.set(20 + (i % 4) * 3, 0, -12 + Math.floor(i / 4) * 5);
      j.m.root.position.copy(j.meta);
      j.rumbo = -Math.PI / 2;
      j.pose = rival;
    });
    if (r === 'gana') this.confeti(new THREE.Vector3(0, 14, 0), [this.reparto.casa.kit, '#fcd34d', '#ffffff', '#4ade80']);
  }

  /* ----------------------------------------------------------- el reloj */

  private paso() {
    // Con un aparato lento, mejor saltar algún fotograma que ver la jugada a cámara lenta.
    const dt = Math.min(0.1, this.reloj.getDelta());
    this.tiempo += dt;
    const t = this.tiempo;

    this.vallas.offset.x = (this.vallas.offset.x + dt * 0.05) % 1;
    if (this.publicoSalta > 0) this.publicoSalta = Math.max(0, this.publicoSalta - dt);
    this.publico.forEach((m, i) => {
      const salto = this.publicoSalta > 0 ? Math.abs(Math.sin(t * 14 + i)) * 0.5 * Math.min(1, this.publicoSalta) : Math.sin(t * 2 + i) * 0.03;
      m.position.y = 10 + salto;
    });

    // El guion de la jugada.
    if (this.guion.length) {
      const p = this.guion[this.pasoI];
      this.pasoT += dt;
      p?.cada?.(clamp01(this.pasoT / p.dur));
      if (p && this.pasoT >= p.dur) {
        this.pasoI += 1;
        this.pasoT = 0;
        const sig = this.guion[this.pasoI];
        if (sig) sig.ini?.();
        else {
          this.guion = [];
          const fin = this.alAcabar;
          this.alAcabar = null;
          fin?.();
        }
      }
    }

    // Los jugadores: corren a su sitio o esperan mirando al balón.
    for (const j of this.todos()) this.pasoJugador(j, dt, t);

    if (this.conductor) {
      const c = this.conductor;
      const moviendo = c.m.root.position.distanceTo(c.meta) > 0.2;
      const toque = moviendo ? Math.abs(Math.sin(t * 8)) * 0.35 : 0;
      this.ponerBalon(this.pies(c, 0.85 + toque));
    }

    // Las líneas de química siguen a los suyos, y sólo se ven en la presentación.
    for (const q of this.quimica) {
      const a = q.a.m.root.position;
      const b = q.b.m.root.position;
      q.mesh.visible = this.escena === 'previa' && !this.finalDe;
      q.mesh.position.set((a.x + b.x) / 2, 0.06, (a.z + b.z) / 2);
      q.mesh.scale.x = Math.max(0.01, a.distanceTo(b) - 2);
      q.mesh.rotation.z = -Math.atan2(b.z - a.z, b.x - a.x);
      (q.mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 4) * 0.25;
    }

    // Los puntitos laten hacia delante.
    if (this.puntos.visible) {
      this.puntos.children.forEach((s) => {
        const k = ((s.userData.k as number) - t * 0.35) % 1;
        s.scale.setScalar(0.55 + (k < 0 ? k + 1 : k) * 0.6);
      });
    }

    this.pasoRedes(dt);
    this.pasoParticulas(dt);
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 90);
    this.pasoCamara(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private pasoJugador(j: Jugador, dt: number, t: number) {
    const root = j.m.root;
    const falta = j.meta.clone().sub(root.position).setY(0);
    const d = falta.length();
    const corre = d > 0.25 && j.suelo < 0.2 && j.pose !== 'lamento' && j.pose !== 'celebra';
    if (corre) {
      const paso = Math.min(d, j.vel * dt);
      root.position.addScaledVector(falta.normalize(), paso);
      const rumbo = Math.atan2(falta.x, falta.z);
      j.rumbo = anguloHacia(j.rumbo, rumbo, dt * 10);
    } else if (j.suelo >= 0.2 && d > 0.1) {
      // En plancha también se avanza: el portero vuela y el defensa se desliza.
      root.position.addScaledVector(falta.normalize(), Math.min(d, j.vel * 0.7 * dt));
    } else if (!j.pose && !this.guion.length) {
      // Quieto, se gira hacia el balón.
      const b = this.balon.position.clone().sub(root.position);
      j.rumbo = anguloHacia(j.rumbo, Math.atan2(b.x, b.z), dt * 4);
    }
    root.rotation.y = j.rumbo;

    if (j.pose === 'golpeo') posar(j.m, 'golpeo', j.poseT);
    else if (j.pose === 'celebra' || j.pose === 'lamento') posar(j.m, j.pose, t + j.fase);
    else if (j.pose) posar(j.m, j.pose, t);
    else if (corre) posar(j.m, 'carrera', (t + j.fase) * Math.min(1, j.vel / 9));
    else posar(j.m, j.line === 'por' && this.escena !== 'previa' ? 'portero' : 'espera', t + j.fase);

    // En plancha: el cuerpo entero cae hacia el lado.
    if (j.suelo > 0.001) {
      const derecha = new THREE.Vector3(Math.cos(j.rumbo), 0, -Math.sin(j.rumbo));
      const lado = Math.sign(j.sueloHacia.dot(derecha)) || 1;
      j.m.body.rotation.z = -lado * j.suelo * 1.3;
      (j.m.head.material as THREE.SpriteMaterial).rotation = -lado * j.suelo * 1.3;
    } else if (j.m.body.rotation.z !== 0) {
      j.m.body.rotation.z = 0;
      (j.m.head.material as THREE.SpriteMaterial).rotation = 0;
    }

    if (j.etiqueta) {
      const ver = this.etiquetas === 'todas' || this.marcadas.has(j.id) || (!j.casa && this.escena === 'defensa');
      j.etiqueta.visible = ver && !this.finalDe;
      j.etiqueta.position.set(root.position.x, 3.1, root.position.z);
    }
    if (j.aro?.visible) {
      j.aro.position.set(root.position.x, 0.05, root.position.z);
      const k = j.aro.userData.foco ? 1 + Math.sin(t * 6) * 0.12 : 1;
      j.aro.scale.setScalar(k);
    }
  }

  private pasoRedes(dt: number) {
    for (const r of this.redes) {
      const g = r.golpe;
      if (g.f <= 0.001 && !r.mesh.userData.sucia) continue;
      g.f = Math.max(0, g.f - dt * 0.8);
      const pos = r.mesh.geometry.attributes.position as THREE.BufferAttribute;
      const k = g.f * (0.7 + Math.sin(this.tiempo * 18) * 0.3 * g.f);
      // El plano está girado: su x local es la z del mundo, con signo según el lado.
      const zLocal = r.lado > 0 ? g.z : -g.z;
      for (let i = 0; i < pos.count; i += 1) {
        const x = r.base[i * 3];
        const y = r.base[i * 3 + 1];
        const d2 = (x - zLocal) ** 2 + (y - g.y) ** 2 * 1.6;
        pos.setZ(i, r.base[i * 3 + 2] - Math.exp(-d2 / 1.4) * k * 1.1);
      }
      pos.needsUpdate = true;
      r.mesh.userData.sucia = g.f > 0.001;
    }
  }

  private pasoParticulas(dt: number) {
    for (let i = this.particulas.length - 1; i >= 0; i -= 1) {
      const p = this.particulas[i];
      p.edad += dt;
      if (p.edad >= p.vida) {
        this.scene.remove(p.obj);
        (p.obj.material as THREE.Material).dispose();
        this.particulas.splice(i, 1);
        continue;
      }
      p.v.y -= 6 * dt;
      p.v.multiplyScalar(0.985);
      p.obj.position.addScaledVector(p.v, dt);
      if (p.gira) {
        p.obj.rotation.x += p.gira.x * dt;
        p.obj.rotation.y += p.gira.y * dt;
      }
      if (p.obj.position.y < 0.05) {
        p.obj.position.y = 0.05;
        p.v.set(0, 0, 0);
      }
      (p.obj.material as THREE.MeshBasicMaterial).opacity = 1 - Math.max(0, (p.edad / p.vida - 0.7) / 0.3);
    }
  }

  /** La cámara de la tele: desde la banda, siguiendo el balón, y girando en la presentación. */
  private pasoCamara(dt: number) {
    const aspect = this.camera.aspect || 1;
    const estrecha = aspect < 1.1 ? 1.35 / Math.max(0.6, aspect) : 1;
    if (this.escena === 'previa' && !this.guion.length) {
      this.cam.orbita += dt * (this.finalDe ? 0.18 : 0.07);
      const R = (this.finalDe ? 34 : 64) * Math.min(1.6, estrecha);
      const alto = this.finalDe ? 14 : 30;
      const a = Math.sin(this.cam.orbita) * 0.9;
      this.camera.position.set(Math.sin(a) * R, alto, Math.cos(a) * R);
      this.cam.foco.set(0, 0, 0);
      this.camera.lookAt(this.cam.foco);
      return;
    }
    if (this.sigueBalon) {
      const b = this.balon.position;
      this.camMeta.foco.set(b.x, 0, b.z * 0.7);
    }
    this.cam.foco.lerp(this.camMeta.foco, 1 - Math.pow(0.02, dt));
    this.cam.dist = lerp(this.cam.dist, this.camMeta.dist * estrecha, 1 - Math.pow(0.1, dt));
    const f = this.cam.foco;
    const d = this.cam.dist;
    const shake = this.temblor;
    this.temblor = Math.max(0, this.temblor - dt * 1.5);
    this.camera.position.set(
      f.x * 0.9 + (Math.random() - 0.5) * shake,
      d * 0.58 + (Math.random() - 0.5) * shake,
      f.z * 0.4 + d,
    );
    this.camera.lookAt(f.x, 0, f.z);
  }

  private ajustar() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.vivo = false;
    cancelAnimationFrame(this.frame);
    this.observador?.disconnect();
    this.particulas.forEach((p) => {
      this.scene.remove(p.obj);
      (p.obj.material as THREE.Material).dispose();
    });
    this.tirar.forEach((t) => t.dispose());
    this.geometrias.forEach((g) => g.dispose());
    this.materiales.forEach((m) => m.dispose());
    this.renderer.dispose();
    // Suelta el contexto de WebGL ya: el navegador sólo deja unos pocos.
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

/** Gira un ángulo hacia otro por el camino corto. */
function anguloHacia(de: number, a: number, k: number): number {
  let d = a - de;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return de + d * Math.min(1, k);
}
