import * as THREE from 'three';

import type { Diana, PenaltyAim, PenaltyOutcome } from '@/lib/penalties';
import type { ShotKind } from '@/types';

import {
  CESPED,
  azar,
  texturaBalon,
  texturaBrillo,
  texturaCesped,
  texturaCielo,
  texturaDorsal,
  texturaPublico,
  texturaRed,
  texturaSvg,
  texturaVallas,
} from '@/components/games/penalty3d/texturas';

/* =========================================================================
 *  El estadio en 3D donde se tiran los penaltis contra Benji.
 *
 *  Es una clase suelta, sin React: monta la escena de Three.js en un
 *  contenedor, la anima a su ritmo y ofrece un puñado de órdenes —dónde está
 *  la mira, qué dianas hay, hacia dónde se carga Benji, chuta este tiro— que
 *  el componente `Tiro3D` va dando según juega el crío. Las reglas del
 *  penalti no viven aquí: el resultado llega ya decidido por
 *  `lib/penalties.ts` y la escena sólo lo cuenta, lo mejor que sabe.
 *
 *  Las medidas son las de verdad, en metros: portería de 7,32 × 2,44, punto
 *  a 11 m. La x crece hacia la derecha del que tira, la y hacia arriba y la
 *  z hacia la cámara: la línea de gol es z = 0 y el punto, z = 11.
 * ========================================================================= */

export const PORTERIA = { ancho: 7.32, alto: 2.44 };
const MEDIO = PORTERIA.ancho / 2;
const PUNTO_Z = 11;
const RADIO_BALON = 0.11;

/** De la portería de las reglas (0-100, arriba el 0) al mundo. */
export function aMundo(aim: PenaltyAim, z = 0): THREE.Vector3 {
  return new THREE.Vector3(-MEDIO + (aim.x / 100) * PORTERIA.ancho, PORTERIA.alto * (1 - aim.y / 100), z);
}

/** Cómo se viste un muñeco. */
export interface Equipacion {
  kit: string;
  shorts: string;
  socks: string;
  band: string;
  skin: string;
  /** Tinta del dorsal. */
  number: string;
  dorsal: string;
  nombre: string;
  bare?: boolean;
}

export interface Reparto {
  /** SVG de la cabeza del que tira, de espaldas y de frente. */
  nuca: string;
  cara: string;
  /** Y las de Benji. */
  benjiCara: string;
  benjiNuca: string;
  tirador: Equipacion;
  /** El gemelo de la Catapulta, si lo hay: el dorsal del otro. */
  gemelo?: string;
  /** Colores de la grada: los de casa, repetidos. */
  grada: string[];
  /** Lo que ponen las vallas. */
  vallas: { texto: string; fondo: string; tinta: string }[];
}

/** El tiro ya decidido, tal como hay que contarlo. */
export interface Jugada {
  /** Dónde acaba el balón, en la portería de las reglas. */
  landing: PenaltyAim;
  outcome: PenaltyOutcome;
  /** Adónde vuela Benji. */
  keeper: PenaltyAim;
  kind: ShotKind;
  /** Lo que tarda el balón en llegar, en milisegundos. */
  flight: number;
  /** Cuánto tarda Benji en arrancar después del golpeo. */
  reflejo: number;
  /** El color de la estela: el del tiro especial, o nada. */
  color?: string;
  /** Hacia dónde se curva el balón por el gesto: -1 a 1. */
  curva: number;
  /** La diana acertada, para encenderla. */
  diana?: Diana | null;
}

type Camara = 'tele' | 'repeticion';

interface Muneco {
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

/** Suave al entrar y al salir. */
const suave = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = THREE.MathUtils.lerp;

/** Una partícula: chispa, llama, confeti o hierba. */
interface Particula {
  sprite: THREE.Sprite | THREE.Mesh;
  v: THREE.Vector3;
  vida: number;
  edad: number;
  gira?: THREE.Vector3;
  crece?: number;
  gravedad: number;
  base: number;
}

export class Estadio3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private host: HTMLElement;
  private frame = 0;
  private reloj = new THREE.Clock();
  private tiempo = 0;
  private tirar: THREE.Texture[] = [];
  private geometrias: THREE.BufferGeometry[] = [];
  private materiales: THREE.Material[] = [];
  private observador?: ResizeObserver;
  private vivo = true;

  // Piezas que se mueven.
  private balon!: THREE.Mesh;
  private sombraBalon!: THREE.Mesh;
  private auraBalon!: THREE.Sprite;
  private benji!: Muneco;
  private tirador!: Muneco;
  private gemelo?: Muneco;
  private redFondo!: THREE.Mesh;
  private redBase!: Float32Array;
  private golpeRed = { x: 0, y: 0, fuerza: 0 };
  private redSucia = false;
  private mira!: THREE.Group;
  private miraAro!: THREE.Mesh;
  private miraCerco!: THREE.Mesh;
  private puntos!: THREE.Group;
  private dianas = new THREE.Group();
  private vallas!: THREE.Texture;
  private publico: THREE.Mesh[] = [];
  private focos: THREE.Sprite[] = [];
  private particulas: Particula[] = [];
  private brillo!: THREE.Texture;
  private flash!: THREE.PointLight;
  private caras: { tiradorCara?: THREE.Texture; tiradorNuca?: THREE.Texture; benjiCara?: THREE.Texture; benjiNuca?: THREE.Texture } = {};

  // Estado de la escena.
  private tell: -1 | 0 | 1 = 0;
  private carga = 0;
  private aura: THREE.Color | null = null;
  private jugada: { plan: Jugada; t0: number; speed: number; cam: Camara; fin: () => void; impacto?: () => void; golpeo?: () => void; hecho: { golpeo: boolean; impacto: boolean; fin: boolean } } | null = null;
  private temblor = 0;
  private celebra = 0;
  private camPos = new THREE.Vector3();
  private camMira = new THREE.Vector3();
  private publicoSalta = 0;

  constructor(host: HTMLElement, private reparto: Reparto) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
    this.scene.fog = new THREE.Fog('#0b1426', 55, 140);

    this.brillo = this.propia(texturaBrillo());
    this.montarLuz();
    this.montarCampo();
    this.montarPorteria();
    this.montarGradas();
    this.montarMira();
    this.scene.add(this.dianas);

    this.montarPersonajes();
    this.montarBalon();
    this.encuadre(true);

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
      this.geo(new THREE.SphereGeometry(200, 24, 16)),
      this.mat(new THREE.MeshBasicMaterial({ map: this.propia(texturaCielo()), side: THREE.BackSide, fog: false })),
    );
    this.scene.add(cielo);

    // Estrellas.
    const r = azar(11);
    const estrellas = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i += 1) {
      const a = r() * Math.PI * 2;
      const e = 0.35 + r() * 1.1;
      estrellas[i * 3] = Math.cos(a) * Math.cos(e) * 180;
      estrellas[i * 3 + 1] = Math.sin(e) * 180;
      estrellas[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 180;
    }
    const g = this.geo(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(estrellas, 3));
    this.scene.add(
      new THREE.Points(g, this.mat(new THREE.PointsMaterial({ color: '#dbe7ff', size: 0.7, sizeAttenuation: true, fog: false }))),
    );

    this.scene.add(new THREE.HemisphereLight('#b9cdf5', '#1d4d25', 1.1));
    const sol = new THREE.DirectionalLight('#fff6e8', 2.3);
    sol.position.set(-9, 22, 18);
    sol.target.position.set(0, 0, 5);
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    sol.shadow.camera.left = -12;
    sol.shadow.camera.right = 12;
    sol.shadow.camera.top = 16;
    sol.shadow.camera.bottom = -8;
    sol.shadow.camera.near = 5;
    sol.shadow.camera.far = 60;
    sol.shadow.bias = -0.0006;
    this.scene.add(sol, sol.target);

    const contra = new THREE.DirectionalLight('#9fc1ff', 0.8);
    contra.position.set(10, 12, -20);
    this.scene.add(contra);

    // El fogonazo del gol: una luz que se enciende un instante en la red.
    this.flash = new THREE.PointLight('#ffd27a', 0, 14, 2);
    this.flash.position.set(0, 1.4, -0.6);
    this.scene.add(this.flash);
  }

  private montarCampo() {
    const cesped = new THREE.Mesh(
      this.geo(new THREE.PlaneGeometry(CESPED.ancho, CESPED.fondo)),
      this.mat(new THREE.MeshStandardMaterial({ map: this.propia(texturaCesped()), roughness: 0.95, metalness: 0 })),
    );
    cesped.rotation.x = -Math.PI / 2;
    cesped.position.set(0, 0, -CESPED.detras + CESPED.fondo / 2);
    cesped.receiveShadow = true;
    this.scene.add(cesped);

    // Más allá del lienzo, más hierba lisa hasta las gradas.
    const fuera = new THREE.Mesh(
      this.geo(new THREE.PlaneGeometry(220, 220)),
      this.mat(new THREE.MeshStandardMaterial({ color: '#23703a', roughness: 1 })),
    );
    fuera.rotation.x = -Math.PI / 2;
    fuera.position.y = -0.01;
    fuera.receiveShadow = true;
    this.scene.add(fuera);
  }

  private montarPorteria() {
    const blanco = this.mat(new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35, metalness: 0.2 }));
    const palo = this.geo(new THREE.CylinderGeometry(0.06, 0.06, PORTERIA.alto + 0.06, 16));
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(palo, blanco);
      p.position.set(s * (MEDIO + 0.06), PORTERIA.alto / 2, 0);
      p.castShadow = true;
      this.scene.add(p);
    }
    const larguero = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.06, 0.06, PORTERIA.ancho + 0.24, 16)), blanco);
    larguero.rotation.z = Math.PI / 2;
    larguero.position.set(0, PORTERIA.alto + 0.03, 0);
    larguero.castShadow = true;
    this.scene.add(larguero);

    // Los tubos de atrás, más finos y grises.
    const gris = this.mat(new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.5 }));
    const tubo = (a: THREE.Vector3, b: THREE.Vector3) => {
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.025, 0.025, len, 8)), gris);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      this.scene.add(m);
    };
    for (const s of [-1, 1]) {
      tubo(new THREE.Vector3(s * MEDIO, PORTERIA.alto, 0), new THREE.Vector3(s * MEDIO, PORTERIA.alto, -1.1));
      tubo(new THREE.Vector3(s * MEDIO, PORTERIA.alto, -1.1), new THREE.Vector3(s * MEDIO, 0, -2.2));
      tubo(new THREE.Vector3(s * MEDIO, 0, -2.2), new THREE.Vector3(s * MEDIO, 0, 0));
    }
    tubo(new THREE.Vector3(-MEDIO, PORTERIA.alto, -1.1), new THREE.Vector3(MEDIO, PORTERIA.alto, -1.1));
    tubo(new THREE.Vector3(-MEDIO, 0, -2.2), new THREE.Vector3(MEDIO, 0, -2.2));

    // La red. El fondo es una malla con vértices que se pueden empujar: es la
    // que se hincha con el gol.
    const redMat = (rep: [number, number]) =>
      this.mat(
        new THREE.MeshStandardMaterial({
          map: this.propia(texturaRed(rep)),
          transparent: true,
          alphaTest: 0.25,
          side: THREE.DoubleSide,
          roughness: 0.9,
          color: '#f1f5f9',
        }),
      );

    const fondo = this.geo(new THREE.PlaneGeometry(PORTERIA.ancho, 1, 36, 14));
    const pos = fondo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      const v = pos.getY(i) + 0.5; // 0 abajo, 1 arriba
      pos.setXYZ(i, pos.getX(i), v * PORTERIA.alto, -2.2 + v * 1.1);
    }
    fondo.computeVertexNormals();
    this.redBase = Float32Array.from(pos.array as Float32Array);
    this.redFondo = new THREE.Mesh(fondo, redMat([28, 11]));
    this.scene.add(this.redFondo);

    const techo = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(PORTERIA.ancho, 1.1)), redMat([28, 4]));
    techo.rotation.x = -Math.PI / 2;
    techo.position.set(0, PORTERIA.alto, -0.55);
    this.scene.add(techo);

    for (const s of [-1, 1]) {
      const lado = this.geo(new THREE.BufferGeometry());
      // Un trapecio: línea de gol abajo, 2,2 m de fondo abajo y 1,1 arriba.
      const v = new Float32Array([0, 0, 0, 0, 0, -2.2, 0, PORTERIA.alto, -1.1, 0, 0, 0, 0, PORTERIA.alto, -1.1, 0, PORTERIA.alto, 0]);
      const uv = new Float32Array([0, 0, 1, 0, 0.5, 1, 0, 0, 0.5, 1, 0, 1]);
      lado.setAttribute('position', new THREE.BufferAttribute(v, 3));
      lado.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      lado.computeVertexNormals();
      const m = new THREE.Mesh(lado, redMat([8, 9]));
      m.position.x = s * MEDIO;
      this.scene.add(m);
    }
  }

  private montarGradas() {
    const colores = this.reparto.grada;
    const hormigon = this.mat(new THREE.MeshStandardMaterial({ color: '#1b2334', roughness: 0.9 }));

    // Tres gradas: la del fondo, detrás de la portería, y las dos de los lados.
    const grada = (ancho: number, seed: number) => {
      const g = new THREE.Group();
      const tex = this.propia(texturaPublico(colores, seed));
      // Una persona mide medio metro de ancho y cada fila, algo menos de uno.
      tex.repeat.set(ancho / 36, 2.6);
      const m = new THREE.Mesh(
        this.geo(new THREE.PlaneGeometry(ancho, 20)),
        this.mat(new THREE.MeshStandardMaterial({ map: tex, roughness: 1, color: '#aab3c5', emissive: '#141b2a', emissiveIntensity: 0.4 })),
      );
      m.rotation.x = -0.62;
      m.position.set(0, 7.2, -8);
      g.add(m);
      this.publico.push(m);
      const muro = new THREE.Mesh(this.geo(new THREE.BoxGeometry(ancho, 2.4, 0.6)), hormigon);
      muro.position.set(0, 1.2, 0);
      g.add(muro);
      // El techo, con su borde de luz.
      const techo = new THREE.Mesh(this.geo(new THREE.BoxGeometry(ancho, 0.5, 9)), hormigon);
      techo.position.set(0, 16, -12);
      techo.rotation.x = 0.12;
      g.add(techo);
      const borde = new THREE.Mesh(
        this.geo(new THREE.BoxGeometry(ancho, 0.18, 0.18)),
        this.mat(new THREE.MeshBasicMaterial({ color: '#fef3c7' })),
      );
      borde.position.set(0, 15.55, -7.6);
      g.add(borde);
      return g;
    };

    const fondo = grada(96, 3);
    fondo.position.set(0, 0, -9);
    this.scene.add(fondo);
    for (const s of [-1, 1]) {
      const lado = grada(70, s > 0 ? 5 : 9);
      lado.rotation.y = -s * Math.PI / 2;
      lado.position.set(s * 30, 0, 18);
      this.scene.add(lado);
    }

    // Las vallas: una fila detrás de la portería y otra en cada lado, con el
    // letrero corriendo.
    this.vallas = this.propia(texturaVallas(this.reparto.vallas));
    const valla = (ancho: number) => {
      const t = this.vallas;
      const m = new THREE.Mesh(
        this.geo(new THREE.BoxGeometry(ancho, 0.95, 0.12)),
        this.mat(new THREE.MeshBasicMaterial({ map: t, toneMapped: false })),
      );
      return m;
    };
    this.vallas.repeat.set(96 / (this.reparto.vallas.length * 5.2), 1);
    const detras = valla(40);
    detras.position.set(0, 0.48, -5.2);
    this.scene.add(detras);
    for (const s of [-1, 1]) {
      const v = valla(26);
      v.rotation.y = -s * Math.PI / 2;
      v.position.set(s * 14, 0.48, 4);
      this.scene.add(v);
    }

    // Las torres de focos: cuatro, con su resplandor.
    const torreMat = this.mat(new THREE.MeshStandardMaterial({ color: '#2a3244', roughness: 0.6, metalness: 0.4 }));
    const glow = this.mat(
      new THREE.SpriteMaterial({ map: this.brillo, color: '#fff7df', blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    const panelMat = this.mat(new THREE.MeshBasicMaterial({ color: '#fffbea', toneMapped: false }));
    for (const [x, z] of [
      [-34, -22],
      [34, -22],
      [-40, 34],
      [40, 34],
    ]) {
      const torre = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.35, 0.6, 30, 8)), torreMat);
      torre.position.set(x, 15, z);
      this.scene.add(torre);
      const panel = new THREE.Mesh(this.geo(new THREE.BoxGeometry(7, 3.4, 0.4)), panelMat);
      panel.position.set(x, 31, z);
      panel.lookAt(0, 0, 8);
      this.scene.add(panel);
      const s = new THREE.Sprite(glow);
      s.position.set(x, 31, z);
      s.scale.set(26, 26, 1);
      this.focos.push(s);
      this.scene.add(s);
    }
  }

  private montarMira() {
    this.mira = new THREE.Group();
    const blanca = this.mat(
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthTest: false, toneMapped: false }),
    );
    this.miraAro = new THREE.Mesh(this.geo(new THREE.RingGeometry(0.2, 0.26, 40)), blanca);
    this.mira.add(this.miraAro);
    for (let i = 0; i < 4; i += 1) {
      const raya = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(0.05, 0.16)), blanca);
      const a = (i * Math.PI) / 2;
      raya.position.set(Math.sin(a) * 0.33, Math.cos(a) * 0.33, 0);
      raya.rotation.z = -a;
      this.mira.add(raya);
    }
    const punto = new THREE.Mesh(this.geo(new THREE.CircleGeometry(0.045, 16)), blanca);
    this.mira.add(punto);
    // El cerco: adónde puede irse el balón si uno se pasa de fuerza.
    this.miraCerco = new THREE.Mesh(
      this.geo(new THREE.RingGeometry(0.93, 1, 48)),
      this.mat(
        new THREE.MeshBasicMaterial({ color: '#fb7185', transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }),
      ),
    );
    this.miraCerco.visible = false;
    this.scene.add(this.miraCerco);
    this.mira.renderOrder = 10;
    this.miraCerco.renderOrder = 10;
    this.scene.add(this.mira);

    // Los puntitos de la trayectoria prevista.
    this.puntos = new THREE.Group();
    const dot = this.mat(
      new THREE.SpriteMaterial({ map: this.brillo, color: '#ffffff', transparent: true, depthWrite: false, opacity: 0.9 }),
    );
    for (let i = 0; i < 14; i += 1) {
      const s = new THREE.Sprite(dot);
      s.scale.setScalar(0.16);
      this.puntos.add(s);
    }
    this.puntos.visible = false;
    this.scene.add(this.puntos);
  }

  /** Un muñeco de la serie: cuerpo de piezas redondas y la cabeza dibujada. */
  private muneco(ropa: { kit: string; shorts: string; socks: string; band: string; skin: string; bare?: boolean; guantes?: string; mangaLarga?: boolean; dorsal?: THREE.Texture }): Muneco {
    const std = (color: string, rough = 0.7) => this.mat(new THREE.MeshStandardMaterial({ color, roughness: rough }));
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

    const pantalon = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.22, 0.24, 0.24, 14)), shorts);
    pantalon.scale.z = 0.7;
    pantalon.position.y = 0.02;
    pantalon.castShadow = true;
    hips.add(pantalon);

    const torsoMats: THREE.Material[] = [kit, kit, kit, kit, kit, kit];
    if (ropa.dorsal) {
      // La espalda (cara -z del cubo, índice 5) lleva nombre y número.
      torsoMats[5] = this.mat(new THREE.MeshStandardMaterial({ map: ropa.dorsal, roughness: 0.62 }));
    }
    const torso = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.44, 0.5, 0.25, 1, 1, 1)), torsoMats);
    torso.position.y = 0.37;
    torso.castShadow = true;
    hips.add(torso);
    const hombros = new THREE.Mesh(this.geo(new THREE.CapsuleGeometry(0.13, 0.26, 4, 10)), kit);
    hombros.rotation.z = Math.PI / 2;
    hombros.position.y = 0.58;
    hombros.scale.z = 0.9;
    hombros.castShadow = true;
    hips.add(hombros);

    const brazo = (s: number) => {
      const hombro = new THREE.Group();
      hombro.position.set(s * 0.29, 0.58, 0);
      const alto = new THREE.Mesh(this.geo(new THREE.CapsuleGeometry(0.062, 0.2, 4, 8)), ropa.bare ? piel : kit);
      alto.position.y = -0.14;
      alto.castShadow = true;
      hombro.add(alto);
      if (!ropa.mangaLarga && !ropa.bare) {
        const brazoPiel = new THREE.Mesh(this.geo(new THREE.CapsuleGeometry(0.052, 0.1, 4, 8)), piel);
        brazoPiel.position.y = -0.22;
        hombro.add(brazoPiel);
      }
      const codo = new THREE.Group();
      codo.position.y = -0.29;
      hombro.add(codo);
      const ante = new THREE.Mesh(this.geo(new THREE.CapsuleGeometry(0.052, 0.2, 4, 8)), ropa.mangaLarga ? kit : piel);
      ante.position.y = -0.13;
      ante.castShadow = true;
      codo.add(ante);
      const mano = new THREE.Mesh(
        this.geo(new THREE.SphereGeometry(ropa.guantes ? 0.1 : 0.06, 12, 10)),
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
      const muslo = new THREE.Mesh(this.geo(new THREE.CapsuleGeometry(0.08, 0.3, 4, 8)), piel);
      muslo.position.y = -0.22;
      muslo.castShadow = true;
      cadera.add(muslo);
      const rodilla = new THREE.Group();
      rodilla.position.y = -0.44;
      cadera.add(rodilla);
      const media = new THREE.Mesh(this.geo(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8)), medias);
      media.position.y = -0.2;
      media.castShadow = true;
      rodilla.add(media);
      const franja = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 10)), std(ropa.band));
      franja.position.y = -0.04;
      rodilla.add(franja);
      const pie = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.12, 0.08, 0.26)), bota);
      pie.position.set(0, -0.43, 0.05);
      pie.castShadow = true;
      rodilla.add(pie);
      hips.add(cadera);
      return [cadera, rodilla] as const;
    };
    const [legL, shinL] = pierna(-1);
    const [legR, shinR] = pierna(1);

    const head = new THREE.Sprite(this.mat(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.05 })));
    head.scale.set(0.72, 0.95, 1);
    head.center.set(0.5, 0.5);
    head.position.y = 0.95;
    hips.add(head);

    const sombra = new THREE.Mesh(
      this.geo(new THREE.CircleGeometry(0.45, 24)),
      this.mat(new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.32, depthWrite: false })),
    );
    sombra.rotation.x = -Math.PI / 2;
    sombra.position.y = 0.012;
    root.add(sombra);

    root.scale.setScalar(0.86);
    return { root, body, hips, legL, legR, shinL, shinR, armL, armR, foreL, foreR, head, sombra };
  }

  private montarPersonajes() {
    const { tirador } = this.reparto;
    const dorsal = this.propia(
      texturaDorsal({ kit: tirador.kit, tinta: tirador.number, nombre: tirador.nombre, numero: tirador.dorsal }),
    );
    this.tirador = this.muneco({ ...tirador, dorsal });
    this.scene.add(this.tirador.root);

    if (this.reparto.gemelo) {
      const otro = this.propia(
        texturaDorsal({ kit: tirador.kit, tinta: tirador.number, nombre: tirador.nombre, numero: this.reparto.gemelo }),
      );
      this.gemelo = this.muneco({ ...tirador, dorsal: otro });
      this.scene.add(this.gemelo.root);
    }

    this.benji = this.muneco({
      kit: '#26272d',
      shorts: '#111114',
      socks: '#26272d',
      band: '#facc15',
      skin: '#f1c9a5',
      guantes: '#facc15',
      mangaLarga: true,
    });
    // Las rayas amarillas de los hombros de su camiseta.
    const amarillo = this.mat(new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.5 }));
    for (const s of [-1, 1]) {
      const raya = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.06, 0.03, 0.27)), amarillo);
      raya.position.set(s * 0.19, 0.64, 0);
      raya.rotation.z = s * 0.35;
      this.benji.hips.add(raya);
    }
    this.scene.add(this.benji.root);

    // Las cabezas llegan un instante después: son SVG que hay que pintar.
    const poner = (m: Muneco, t: THREE.Texture) => {
      (m.head.material as THREE.SpriteMaterial).map = t;
      (m.head.material as THREE.SpriteMaterial).needsUpdate = true;
    };
    void Promise.all([
      texturaSvg(this.reparto.nuca),
      texturaSvg(this.reparto.cara),
      texturaSvg(this.reparto.benjiCara),
      texturaSvg(this.reparto.benjiNuca),
    ]).then(([nuca, cara, bCara, bNuca]) => {
      if (!this.vivo) {
        [nuca, cara, bCara, bNuca].forEach((t) => t.dispose());
        return;
      }
      [nuca, cara, bCara, bNuca].forEach((t) => this.propia(t));
      this.caras = { tiradorNuca: nuca, tiradorCara: cara, benjiCara: bCara, benjiNuca: bNuca };
      poner(this.tirador, nuca);
      if (this.gemelo) poner(this.gemelo, nuca);
      poner(this.benji, bCara);
    });

    this.colocarEnEspera();
  }

  private montarBalon() {
    this.balon = new THREE.Mesh(
      this.geo(new THREE.SphereGeometry(RADIO_BALON, 32, 20)),
      this.mat(new THREE.MeshStandardMaterial({ map: this.propia(texturaBalon()), roughness: 0.45 })),
    );
    this.balon.castShadow = true;
    this.scene.add(this.balon);
    this.sombraBalon = new THREE.Mesh(
      this.geo(new THREE.CircleGeometry(0.14, 20)),
      this.mat(new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.4, depthWrite: false })),
    );
    this.sombraBalon.rotation.x = -Math.PI / 2;
    this.scene.add(this.sombraBalon);
    this.auraBalon = new THREE.Sprite(
      this.mat(
        new THREE.SpriteMaterial({ map: this.brillo, color: '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }),
      ),
    );
    this.auraBalon.scale.setScalar(0.9);
    this.scene.add(this.auraBalon);
    this.ponerBalon(new THREE.Vector3(0, RADIO_BALON, PUNTO_Z));
  }

  private ponerBalon(p: THREE.Vector3) {
    this.balon.position.copy(p);
    this.sombraBalon.position.set(p.x, 0.013, p.z);
    const alto = Math.max(0, p.y - RADIO_BALON);
    this.sombraBalon.scale.setScalar(1 + alto * 0.25);
    (this.sombraBalon.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.4 - alto * 0.1);
    this.auraBalon.position.copy(p);
  }

  /** Todos a su sitio: el que tira detrás del balón, Benji en la raya. */
  private colocarEnEspera() {
    const t = this.tirador;
    t.root.position.set(-0.7, 0, PUNTO_Z + 1.6);
    // El frente del muñeco es +z: para mirar a la portería, media vuelta.
    t.root.rotation.set(0, Math.PI - 0.34, 0);
    this.posar(t, 'espera', 0);
    if (this.gemelo) {
      this.gemelo.root.position.set(0.85, 0, PUNTO_Z + 1.7);
      this.gemelo.root.rotation.set(0, Math.PI + 0.3, 0);
      this.posar(this.gemelo, 'espera', 0);
    }
    const b = this.benji;
    b.root.position.set(0, 0, 0.25);
    b.root.rotation.set(0, 0, 0);
    b.body.rotation.set(0, 0, 0);
    b.body.position.set(0, 0, 0);
    (b.head.material as THREE.SpriteMaterial).rotation = 0;
    this.posar(b, 'portero', 0);
  }

  /** Las posturas: articulaciones en radianes. */
  private posar(m: Muneco, pose: 'espera' | 'carrera' | 'golpeo' | 'portero' | 'estirada' | 'celebra' | 'lamento', t: number) {
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

  /* -------------------------------------------------------------- órdenes */

  /** Dónde está la mira, y cómo va de fuerza. `null` la esconde. */
  setMira(
    aim: PenaltyAim | null,
    opts: { cerco?: { drift: number; up: number; open: number }; zona?: 'flojo' | 'buena' | 'pasado' | null; kind?: ShotKind } = {},
  ) {
    if (!aim) {
      this.mira.visible = false;
      this.miraCerco.visible = false;
      this.puntos.visible = false;
      return;
    }
    const p = aMundo(aim, 0.05);
    this.mira.visible = true;
    this.mira.position.copy(p);
    const color = opts.zona === 'buena' ? '#4ade80' : opts.zona === 'pasado' ? '#fb7185' : opts.zona === 'flojo' ? '#cbd5e1' : '#ffffff';
    (this.miraAro.material as THREE.MeshBasicMaterial).color.set(color);

    const cerco = opts.cerco;
    if (cerco && cerco.drift > 0.01) {
      const centro = aMundo({ x: aim.x, y: aim.y - cerco.drift * cerco.up * 0.5 }, 0.06);
      this.miraCerco.visible = true;
      this.miraCerco.position.copy(centro);
      const r = 0.3 + ((cerco.drift * cerco.open) / 100) * PORTERIA.ancho;
      this.miraCerco.scale.set(r, r * 0.8 + cerco.drift * cerco.up * 0.012, 1);
    } else {
      this.miraCerco.visible = false;
    }

    // La trayectoria prevista, con puntitos: de dónde sale y adónde va.
    const muestra = this.curva({ landing: aim, kind: opts.kind ?? 'normal', curva: 0 });
    this.puntos.visible = opts.zona !== undefined && opts.zona !== null;
    this.puntos.children.forEach((s, i) => {
      const t = (i + 1) / (this.puntos.children.length + 1);
      s.position.copy(muestra(t * 0.92));
      (s as THREE.Sprite).scale.setScalar(0.1 + t * 0.12);
    });
  }

  setDianas(dianas: Diana[]) {
    this.dianas.children.slice().forEach((c) => this.dianas.remove(c));
    for (const d of dianas) {
      const g = new THREE.Group();
      const color = d.dorada ? '#fbbf24' : '#f472b6';
      const rx = (d.r / 100) * PORTERIA.ancho;
      const ry = ((d.r / 0.45) / 100) * PORTERIA.alto;
      const aro = new THREE.Mesh(
        this.geo(new THREE.RingGeometry(0.86, 1, 48)),
        this.mat(
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, toneMapped: false }),
        ),
      );
      aro.scale.set(rx, ry, 1);
      g.add(aro);
      const relleno = new THREE.Mesh(
        this.geo(new THREE.CircleGeometry(1, 48)),
        this.mat(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide, toneMapped: false })),
      );
      relleno.scale.set(rx, ry, 1);
      g.add(relleno);
      const halo = new THREE.Sprite(
        this.mat(new THREE.SpriteMaterial({ map: this.brillo, color, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 })),
      );
      halo.scale.set(rx * 3, ry * 3, 1);
      g.add(halo);
      g.position.copy(aMundo(d, -0.12));
      g.userData = { dorada: d.dorada, fase: d.x * 0.1 };
      this.dianas.add(g);
    }
  }

  /** Hacia qué lado se carga Benji antes del tiro: el aviso. */
  setTell(side: 'izquierda' | 'centro' | 'derecha') {
    this.tell = side === 'izquierda' ? -1 : side === 'derecha' ? 1 : 0;
  }

  /** Cuánto se ha cargado el tiro (0-1): el que tira se agacha y el balón brilla. */
  setCarga(p: number, color?: string | null) {
    this.carga = clamp01(p);
    this.aura = color ? new THREE.Color(color) : null;
  }

  /** Dónde cae el balón en la pantalla, en píxeles del contenedor. */
  balonEnPantalla(): { x: number; y: number } {
    const v = this.balon.position.clone().project(this.camera);
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
  }

  /** Un punto de la pantalla, sobre el plano de la portería (0-100). */
  pantallaAPorteria(px: number, py: number): PenaltyAim {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((px / w) * 2 - 1, -(py / h) * 2 + 1), this.camera);
    const plano = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plano, hit)) return { x: 50, y: 50 };
    return {
      x: ((hit.x + MEDIO) / PORTERIA.ancho) * 100,
      y: (1 - hit.y / PORTERIA.alto) * 100,
    };
  }

  /** Vuelve todo a la espera del siguiente tiro. */
  reiniciar() {
    this.jugada = null;
    this.celebra = 0;
    this.ponerBalon(new THREE.Vector3(0, RADIO_BALON, PUNTO_Z));
    this.balon.visible = true;
    this.colocarEnEspera();
    this.golpeRed.fuerza = 0;
    this.encuadre(true);
    this.ponerCaras('tele');
  }

  /**
   * Cuenta el tiro: carrera, golpeo, vuelo, la estirada de Benji y lo que
   * pase. `speed` < 1 es la repetición a cámara lenta, con la cámara detrás
   * de la portería.
   */
  jugar(plan: Jugada, opts: { speed?: number; camara?: Camara; alGolpeo?: () => void; alLlegar?: () => void } = {}): Promise<void> {
    this.colocarEnEspera();
    this.ponerBalon(new THREE.Vector3(0, RADIO_BALON, PUNTO_Z));
    this.balon.visible = true;
    this.celebra = 0;
    this.particulas.forEach((p) => this.scene.remove(p.sprite));
    this.particulas = [];
    const cam = opts.camara ?? 'tele';
    // En la repetición, desde detrás de la red, las dianas y la mira sobran:
    // se verían flotando sobre el césped.
    this.dianas.visible = cam === 'tele';
    this.ponerCaras(cam);
    return new Promise((resolve) => {
      this.jugada = {
        plan,
        t0: this.tiempo,
        speed: opts.speed ?? 1,
        cam,
        fin: resolve,
        golpeo: opts.alGolpeo,
        impacto: opts.alLlegar,
        hecho: { golpeo: false, impacto: false, fin: false },
      };
    });
  }

  private ponerCaras(cam: Camara) {
    const poner = (m: Muneco | undefined, t?: THREE.Texture) => {
      if (!m || !t) return;
      const mat = m.head.material as THREE.SpriteMaterial;
      if (mat.map !== t) {
        mat.map = t;
        mat.needsUpdate = true;
      }
    };
    const detras = cam === 'repeticion';
    poner(this.tirador, detras ? this.caras.tiradorCara : this.caras.tiradorNuca);
    poner(this.gemelo, detras ? this.caras.tiradorCara : this.caras.tiradorNuca);
    poner(this.benji, detras ? this.caras.benjiNuca : this.caras.benjiCara);
  }

  /* ------------------------------------------------------------ el vuelo */

  /**
   * La curva del balón para un tiro: de dónde sale, por dónde pasa y dónde
   * acaba. Cada especial tiene su forma —la picadita sube, el Halcón sube y
   * cae en picado, el efecto se abre y se cierra, el cañón baila—.
   */
  private curva(p: Pick<Jugada, 'landing' | 'kind' | 'curva'>): (t: number) => THREE.Vector3 {
    const a = new THREE.Vector3(0, RADIO_BALON, PUNTO_Z);
    const b = aMundo(p.landing, 0);
    const kind = p.kind;
    const apex =
      kind === 'parabola' ? 4.2 : kind === 'halcon' ? 5.2 : kind === 'catapulta' ? 7.5 : kind === 'fuego' || kind === 'tigre' ? 0.25 : 0.8;
    const lado = kind === 'efecto' ? (b.x < 0 ? -1 : 1) * -2.4 : p.curva * 1.2;
    return (t: number) => {
      const x = lerp(a.x, b.x, t) + Math.sin(Math.PI * t) * lado;
      // Altura: la recta entre salida y llegada más la joroba del tiro. El
      // Halcón y la Catapulta suben pronto y caen tarde, en picado.
      const joroba = kind === 'halcon' || kind === 'catapulta' ? Math.sin(Math.PI * Math.pow(t, 0.62)) : Math.sin(Math.PI * t);
      const y = lerp(a.y, b.y, t) + joroba * apex;
      const z = lerp(a.z, b.z, kind === 'parabola' ? t : Math.pow(t, 0.96));
      const v = new THREE.Vector3(x, y, z);
      if (kind === 'canon') {
        v.x += Math.sin(t * 27) * 0.16 * t;
        v.y += Math.cos(t * 23) * 0.12 * t;
      }
      return v;
    };
  }

  private chispas(at: THREE.Vector3, color: string, n: number, fuerza = 4, vida = 0.7, tam = 0.18) {
    const mat = new THREE.SpriteMaterial({ map: this.brillo, color, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < n; i += 1) {
      const s = new THREE.Sprite(mat);
      s.position.copy(at);
      s.scale.setScalar(tam);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.3).normalize().multiplyScalar(fuerza * (0.4 + Math.random()));
      this.scene.add(s);
      this.particulas.push({ sprite: s, v, vida: vida * (0.6 + Math.random() * 0.6), edad: 0, gravedad: 4, base: tam, crece: -0.6 });
    }
  }

  private confeti(colores: string[]) {
    const geo = this.geo(new THREE.PlaneGeometry(0.12, 0.08));
    for (let i = 0; i < 160; i += 1) {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: colores[i % colores.length], side: THREE.DoubleSide, transparent: true }),
      );
      m.position.set((Math.random() - 0.5) * 16, 6 + Math.random() * 6, -2 + Math.random() * 10);
      this.scene.add(m);
      this.particulas.push({
        sprite: m,
        v: new THREE.Vector3((Math.random() - 0.5) * 1.5, -1 - Math.random() * 1.5, (Math.random() - 0.5) * 1.5),
        vida: 3.5 + Math.random() * 1.5,
        edad: 0,
        gira: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        gravedad: 0.3,
        base: 1,
      });
    }
  }

  /** La estela del balón en vuelo, del color de su tiro. */
  private estela(at: THREE.Vector3, color: string, kind: ShotKind) {
    const fuego = kind === 'fuego' || kind === 'tigre';
    const n = fuego ? 3 : 1;
    for (let i = 0; i < n; i += 1) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.brillo,
          color: fuego ? ['#fbbf24', '#f97316', '#dc2626'][i] : color,
          // El fuego, sin sumar luz: sumándola se quema a blanco y no parece fuego.
          blending: fuego ? THREE.NormalBlending : THREE.AdditiveBlending,
          depthWrite: false,
          opacity: fuego ? 0.8 : 0.85,
        }),
      );
      s.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, 0));
      const tam = fuego ? 0.55 : 0.34;
      s.scale.setScalar(tam);
      this.scene.add(s);
      this.particulas.push({
        sprite: s,
        v: new THREE.Vector3((Math.random() - 0.5) * 0.4, fuego ? 0.8 : 0.1, 0.5),
        vida: fuego ? 0.45 : 0.35,
        edad: 0,
        gravedad: 0,
        base: tam,
        crece: fuego ? 0.4 : -0.8,
      });
    }
  }

  /* ----------------------------------------------------------- el reloj */

  private paso() {
    const dt = Math.min(0.05, this.reloj.getDelta());
    this.tiempo += dt;
    const t = this.tiempo;

    // El letrero corre, los focos titilan, las dianas laten.
    this.vallas.offset.x = (this.vallas.offset.x + dt * 0.06) % 1;
    this.focos.forEach((f, i) => {
      const s = 24 + Math.sin(t * 1.3 + i) * 1.2;
      f.scale.set(s, s, 1);
    });
    this.dianas.children.forEach((g) => {
      const k = 1 + Math.sin(t * 4 + (g.userData.fase as number)) * 0.06;
      g.scale.set(k, k, 1);
    });
    if (this.mira.visible) {
      this.mira.rotation.z = Math.sin(t * 1.5) * 0.1;
    }

    // La grada salta cuando hay gol.
    if (this.publicoSalta > 0) this.publicoSalta = Math.max(0, this.publicoSalta - dt);
    this.publico.forEach((m, i) => {
      const salto = this.publicoSalta > 0 ? Math.abs(Math.sin(t * 14 + i)) * 0.35 * Math.min(1, this.publicoSalta) : Math.sin(t * 2 + i) * 0.02;
      (m.material as THREE.MeshStandardMaterial).map!.offset.y = salto * 0.04;
      m.position.y = 7.2 + salto;
    });

    if (this.jugada) this.pasoJugada(dt);
    else this.pasoEspera(t);

    // La red vuelve a su sitio poco a poco.
    this.pasoRed(dt);

    // Partículas.
    for (let i = this.particulas.length - 1; i >= 0; i -= 1) {
      const p = this.particulas[i];
      p.edad += dt;
      if (p.edad >= p.vida) {
        this.scene.remove(p.sprite);
        if (p.sprite instanceof THREE.Sprite) p.sprite.material.dispose();
        else (p.sprite.material as THREE.Material).dispose();
        this.particulas.splice(i, 1);
        continue;
      }
      p.v.y -= p.gravedad * dt;
      p.sprite.position.addScaledVector(p.v, dt);
      if (p.gira) {
        p.sprite.rotation.x += p.gira.x * dt;
        p.sprite.rotation.y += p.gira.y * dt;
      }
      const k = p.edad / p.vida;
      if (p.sprite instanceof THREE.Sprite) {
        p.sprite.material.opacity = 1 - k;
        const s = p.base * (1 + (p.crece ?? 0) * k);
        p.sprite.scale.setScalar(Math.max(0.01, s));
      } else if (p.sprite.position.y < 0.02) {
        p.sprite.position.y = 0.02;
        p.v.set(0, 0, 0);
        p.gira = undefined;
      }
    }

    // El fogonazo se apaga.
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 60);

    // La cámara, con su temblor.
    const shake = this.temblor > 0 ? this.temblor : 0;
    this.temblor = Math.max(0, this.temblor - dt * 1.8);
    this.camera.position.copy(this.camPos).add(
      new THREE.Vector3((Math.random() - 0.5) * shake * 0.3, (Math.random() - 0.5) * shake * 0.3, 0),
    );
    this.camera.lookAt(this.camMira);

    this.renderer.render(this.scene, this.camera);
  }

  private pasoEspera(t: number) {
    // El que tira, esperando; agachándose un poco según carga.
    this.posar(this.tirador, 'espera', t);
    this.tirador.hips.rotation.x = 0.06 + this.carga * 0.3;
    this.tirador.hips.position.y -= this.carga * 0.08;
    if (this.gemelo) this.posar(this.gemelo, 'espera', t + 1);

    // Benji bota y se carga hacia su lado. Visto desde el que tira, la
    // derecha de la pantalla es la +x.
    const b = this.benji;
    this.posar(b, 'portero', t);
    const lean = this.tell * (0.28 + Math.sin(t * 3) * 0.08);
    b.root.position.x = lerp(b.root.position.x, this.tell * 0.35, 0.08);
    b.body.rotation.z = lerp(b.body.rotation.z, -lean * 0.5, 0.1);
    (b.head.material as THREE.SpriteMaterial).rotation = b.body.rotation.z;

    // El aura del balón mientras se carga un especial.
    const aura = this.auraBalon.material as THREE.SpriteMaterial;
    if (this.aura && this.carga > 0) {
      aura.color.copy(this.aura);
      aura.opacity = 0.45 + this.carga * 0.5 + Math.sin(t * 20) * 0.1;
      this.auraBalon.scale.setScalar(0.7 + this.carga * 0.8);
    } else {
      aura.opacity = Math.max(0, aura.opacity - 0.05);
    }
    this.encuadre(false);
  }

  /** La cámara de la tele: detrás del que tira, un poco a su derecha. */
  private encuadre(inmediato: boolean) {
    const aspect = this.camera.aspect || 1;
    // Que la portería quepa entera de ancho aunque la pantalla sea estrecha.
    const destino = new THREE.Vector3(0.55, 2.1 - this.carga * 0.1, 17.8 - this.carga * 0.5);
    const mira = new THREE.Vector3(0, 0.95, 0);
    const hfov = aspect < 1 ? 35 : 44;
    const vfov = aspect < 1 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hfov / 2)) / aspect)) : 33;
    if (Math.abs(this.camera.fov - vfov) > 0.01) {
      this.camera.fov = vfov;
      this.camera.updateProjectionMatrix();
    }
    if (inmediato) {
      this.camPos.copy(destino);
      this.camMira.copy(mira);
    } else {
      this.camPos.lerp(destino, 0.08);
      this.camMira.lerp(mira, 0.08);
    }
  }

  private pasoJugada(dt: number) {
    const j = this.jugada!;
    const plan = j.plan;
    const CARRERA = 420;
    const GOLPEO = 180;
    const kick = CARRERA + GOLPEO;
    const vuelo = plan.flight;
    const tras = 1500;
    // Los ms de la jugada. Al acabar se queda congelada en su último
    // instante —Benji en el suelo, el balón en la red— hasta el siguiente.
    const bruto = (this.tiempo - j.t0) * 1000 * j.speed;
    const e = Math.min(bruto, kick + vuelo + tras);
    const t = this.tiempo;

    // ---- el que tira
    const tir = this.tirador;
    const desde = new THREE.Vector3(-0.7, 0, PUNTO_Z + 1.6);
    const hasta = new THREE.Vector3(-0.32, 0, PUNTO_Z + 0.32);
    if (e < CARRERA) {
      const k = e / CARRERA;
      tir.root.position.lerpVectors(desde, hasta, suave(k));
      tir.root.rotation.y = lerp(Math.PI - 0.34, Math.PI - 0.15, k);
      this.posar(tir, 'carrera', e / 1000);
    } else if (e < kick + 400) {
      tir.root.position.copy(hasta);
      this.posar(tir, 'golpeo', (e - CARRERA) / (GOLPEO + 200));
    } else if (plan.outcome === 'gol') {
      this.celebra += dt;
      tir.root.position.z = lerp(tir.root.position.z, hasta.z - 1.4, 0.02);
      this.posar(tir, 'celebra', this.celebra);
    } else {
      this.posar(tir, 'lamento', 0);
    }
    if (this.gemelo) {
      // En la Catapulta el gemelo hace de trampolín y el otro sale volando.
      this.posar(this.gemelo, e < kick ? 'carrera' : 'espera', e / 1000);
      if (plan.kind === 'catapulta') {
        const salto = clamp01((e - 150) / 450);
        tir.root.position.y = Math.sin(Math.PI * salto) * 1.6;
      }
    }

    // ---- el balón
    const b = this.balon.position.clone();
    if (e >= kick && !j.hecho.golpeo) {
      j.hecho.golpeo = true;
      j.golpeo?.();
      this.chispas(new THREE.Vector3(0, 0.1, PUNTO_Z), '#d9f99d', 10, 2.5, 0.5, 0.12);
    }
    const u = clamp01((e - kick) / vuelo);
    const curva = this.curva(plan);
    const llegada = aMundo(plan.landing, 0);

    if (e < kick) {
      this.ponerBalon(new THREE.Vector3(0, RADIO_BALON, PUNTO_Z));
    } else if (u < 1) {
      const p = curva(u);
      this.ponerBalon(p);
      this.balon.rotation.x -= dt * 30 * j.speed;
      this.balon.rotation.z += dt * plan.curva * 20 * j.speed;
      if (plan.color) this.estela(p, plan.color, plan.kind);
      else if (Math.random() < 0.5) this.estela(p, '#ffffff', 'normal');
      const aura = this.auraBalon.material as THREE.SpriteMaterial;
      aura.opacity = plan.color ? 0.9 : 0;
      if (plan.color) aura.color.set(plan.color);
    } else {
      // Después de llegar: según lo que haya pasado.
      if (!j.hecho.impacto) {
        j.hecho.impacto = true;
        this.alLlegar(plan, llegada);
        j.impacto?.();
      }
      const d = (e - kick - vuelo) / 1000;
      this.despues(plan, llegada, d, b);
    }

    // ---- Benji
    const bj = this.benji;
    const arranca = kick + plan.reflejo;
    const dive = 380 + vuelo * 0.35;
    const k = clamp01((e - arranca) / dive);
    const objetivo = plan.outcome === 'parada' ? aMundo(plan.landing, 0) : aMundo(plan.keeper, 0);
    if (e < arranca) {
      this.posar(bj, 'portero', t);
      bj.root.position.x = lerp(bj.root.position.x, this.tell * 0.35, 0.1);
    } else {
      this.posar(bj, 'estirada', t);
      const s = suave(k);
      const lado = Math.sign(objetivo.x) || 0;
      const alto = objetivo.y;
      // Se lanza: el cuerpo gira hacia el lado y sube hasta la altura del balón.
      const giro = lado === 0 ? 0 : -lado * lerp(0, alto > 1.3 ? 1.05 : 1.35, s);
      bj.body.rotation.z = giro;
      bj.root.position.x = lerp(this.tell * 0.35, objetivo.x - lado * 0.7, s);
      bj.body.position.y = lerp(0, lado === 0 ? Math.max(0, alto - 1.9) : Math.max(0, alto - 0.9) * 0.9, Math.sin(Math.PI * Math.min(1, s * 0.9)) * 0.4 + s * 0.6);
      if (e > arranca + dive + 250) {
        // En el suelo.
        const caida = clamp01((e - arranca - dive - 250) / 300);
        bj.body.position.y = lerp(bj.body.position.y, 0.15, caida);
      }
      (bj.head.material as THREE.SpriteMaterial).rotation = bj.body.rotation.z;
    }

    // ---- la cámara
    if (j.cam === 'tele') {
      const va = suave(clamp01((e - kick) / (vuelo + 200)));
      this.camPos.lerp(new THREE.Vector3(lerp(0.55, 0.3, va), lerp(2.1, 1.75, va), lerp(17.8, 15.2, va)), 0.12);
      this.camMira.lerp(new THREE.Vector3(0, 0.95, 0), 0.1);
    } else {
      // La repetición: desde detrás de la portería, a un lado, mirando al punto.
      this.camPos.lerp(new THREE.Vector3(4.2, 1.9, -6.2), 0.2);
      const foco = e < kick ? new THREE.Vector3(0, 0.8, PUNTO_Z) : this.balon.position.clone().lerp(new THREE.Vector3(0, 1, 0), 0.5);
      this.camMira.lerp(foco, 0.12);
      if (this.camera.fov !== 34) {
        this.camera.fov = 34;
        this.camera.updateProjectionMatrix();
      }
    }

    if (bruto >= kick + vuelo + tras && !j.hecho.fin) {
      j.hecho.fin = true;
      j.fin();
    }
  }

  private alLlegar(plan: Jugada, llegada: THREE.Vector3) {
    if (plan.outcome === 'gol') {
      this.golpeRed = { x: llegada.x, y: llegada.y, fuerza: 0.9 };
      this.flash.position.set(llegada.x, llegada.y, -0.8);
      this.flash.intensity = 60;
      this.temblor = 1;
      this.publicoSalta = 3.2;
      this.chispas(llegada.clone().setZ(-1), plan.color ?? '#fef9c3', 26, 5, 0.9, 0.22);
      if (plan.diana) this.chispas(llegada.clone().setZ(-0.2), plan.diana.dorada ? '#fbbf24' : '#f472b6', 40, 6, 1.1, 0.3);
      this.confeti([this.reparto.tirador.kit, '#facc15', '#ffffff', this.reparto.tirador.band]);
    } else if (plan.outcome === 'parada') {
      this.temblor = 0.6;
      this.chispas(llegada.clone().setZ(0.3), '#fde68a', 22, 4, 0.6, 0.2);
    } else if (plan.outcome === 'poste') {
      this.temblor = 0.8;
      this.chispas(llegada, '#e2e8f0', 30, 5, 0.6, 0.16);
    }
  }

  /** El balón después de llegar: a la red, rechazado, al palo o fuera. */
  private despues(plan: Jugada, llegada: THREE.Vector3, d: number, _antes: THREE.Vector3) {
    if (plan.outcome === 'gol') {
      // Entra, estira la red y cae.
      const k = clamp01(d / 0.25);
      const fondo = llegada.clone();
      fondo.z = lerp(0, -1.9 + (llegada.y / PORTERIA.alto) * 0.9, suave(k));
      fondo.y = d < 0.25 ? llegada.y : Math.max(RADIO_BALON, llegada.y - (d - 0.25) * (d - 0.25) * 9.8 * 0.5 * 2);
      this.ponerBalon(fondo);
    } else if (plan.outcome === 'parada') {
      // Rechace: hacia fuera y hacia delante, con bote.
      const lado = Math.sign(llegada.x) || 1;
      const v = new THREE.Vector3(lado * 3.2, 3.2, 5.5);
      const p = llegada.clone().setZ(0.35).addScaledVector(v, d);
      p.y = llegada.y + v.y * d - 4.9 * d * d * 1.2;
      if (p.y < RADIO_BALON) p.y = RADIO_BALON + Math.abs(Math.sin(d * 7)) * 0.3 * Math.max(0, 1 - d);
      this.ponerBalon(p);
      this.balon.rotation.x += 0.2;
    } else if (plan.outcome === 'poste') {
      const lado = llegada.x < 0 ? 1 : -1;
      const v = new THREE.Vector3(lado * 2.2, 1.2, 6.5);
      const p = llegada.clone().addScaledVector(v, d);
      p.y = Math.max(RADIO_BALON, llegada.y + v.y * d - 4.9 * d * d);
      this.ponerBalon(p);
    } else {
      // Fuera: sigue su camino hasta la valla del fondo.
      const dir = llegada.clone().sub(new THREE.Vector3(0, RADIO_BALON, PUNTO_Z)).normalize();
      const p = llegada.clone().addScaledVector(dir, Math.min(d * 14, 5));
      p.y = Math.max(RADIO_BALON, p.y - d * d * 2);
      this.ponerBalon(p);
    }
  }

  private pasoRed(dt: number) {
    const pos = this.redFondo.geometry.attributes.position as THREE.BufferAttribute;
    const base = this.redBase;
    const g = this.golpeRed;
    if (g.fuerza <= 0.001 && !this.redSucia) return;
    g.fuerza = Math.max(0, g.fuerza - dt * 0.9);
    const k = g.fuerza * (0.7 + Math.sin(this.tiempo * 18) * 0.3 * g.fuerza);
    for (let i = 0; i < pos.count; i += 1) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      const d2 = (x - g.x) * (x - g.x) + (y - g.y) * (y - g.y) * 1.6;
      const empuje = Math.exp(-d2 / 1.1) * k * 0.9;
      pos.setZ(i, base[i * 3 + 2] - empuje);
    }
    pos.needsUpdate = true;
    this.redSucia = g.fuerza > 0.001;
  }

  private ajustar() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.jugada) this.encuadre(true);
  }

  dispose() {
    this.vivo = false;
    cancelAnimationFrame(this.frame);
    this.observador?.disconnect();
    this.particulas.forEach((p) => {
      this.scene.remove(p.sprite);
      if (p.sprite instanceof THREE.Sprite) p.sprite.material.dispose();
      else (p.sprite.material as THREE.Material).dispose();
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
