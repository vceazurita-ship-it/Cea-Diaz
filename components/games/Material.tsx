import type { Visual } from '@/types';

/* =========================================================================
 *  El material: las preguntas del reto del cole, vistas y no sólo leídas.
 *
 *  Es la idea de Montessori: primero lo concreto —las perlas doradas, el
 *  tablero de cuentas, las fichas de sílabas, los símbolos de gramática— y
 *  luego el número o la regla. Cada material va sobre su «tapete», un fondo
 *  claro que se ve igual en modo día y en modo noche, y tiene dos estados:
 *  mientras se piensa enseña el problema, y al contestar se enseña resuelto
 *  (la sílaba tónica encendida, el tipo de ángulo, la cuenta hecha). Ése es
 *  el control del error: el niño ve por qué, no sólo que ha fallado.
 *
 *  Los colores son los del material de verdad: unidades en verde, decenas en
 *  azul, centenas en rojo, y otra vez verde para los millares; vocales en
 *  azul y consonantes en rojo en el alfabeto móvil; y los símbolos de la
 *  gramática Montessori —triángulo negro el nombre, azul oscuro el
 *  adjetivo, azul claro el artículo, círculo rojo el verbo—.
 * ========================================================================= */

const ORDEN = [
  { color: '#16a34a', nombre: 'U' },
  { color: '#2563eb', nombre: 'D' },
  { color: '#dc2626', nombre: 'C' },
  { color: '#16a34a', nombre: 'UM' },
  { color: '#2563eb', nombre: 'DM' },
];

const TINTA = '#2b2118';
const ORO = '#f2b705';
const ORO_OSCURO = '#a87900';

function Tapete({ children, alto = 150, ancho = 320 }: { children: React.ReactNode; alto?: number; ancho?: number }) {
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} className="block h-auto w-full max-h-48 rounded-2xl" role="img" aria-hidden>
      <rect width={ancho} height={alto} rx="14" fill="#f6eedb" />
      <rect x="4" y="4" width={ancho - 8} height={alto - 8} rx="11" fill="none" stroke="#e3d5b5" strokeWidth="2" strokeDasharray="1 5" />
      {children}
    </svg>
  );
}

/* ---------------------------------------------------------------- perlas */

function Perla({ x, y, r = 3.2 }: { x: number; y: number; r?: number }) {
  return <circle cx={x} cy={y} r={r} fill={ORO} stroke={ORO_OSCURO} strokeWidth="0.8" />;
}

function Barra({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 1} y={y - 1} width="2" height="62" fill="#8a6a2a" />
      {Array.from({ length: 10 }, (_, i) => (
        <Perla key={i} x={x} y={y + i * 6.2 + 2} r={3} />
      ))}
    </g>
  );
}

function Cuadrado({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="40" height="40" rx="2" fill={ORO} stroke={ORO_OSCURO} strokeWidth="1.2" />
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i} stroke={ORO_OSCURO} strokeWidth="0.5" opacity="0.7">
          <path d={`M${x + (i + 1) * 4} ${y} V${y + 40}`} />
          <path d={`M${x} ${y + (i + 1) * 4} H${x + 40}`} />
        </g>
      ))}
    </g>
  );
}

function Cubo({ x, y }: { x: number; y: number }) {
  // Un cubo en perspectiva: la cara de delante y las de arriba y el lado.
  return (
    <g stroke={ORO_OSCURO} strokeWidth="1.2" strokeLinejoin="round">
      <path d={`M${x} ${y + 12} l12 -12 h34 l-12 12 Z`} fill="#ffd54a" />
      <path d={`M${x + 34} ${y + 12} l12 -12 v34 l-12 12 Z`} fill="#c99400" />
      <rect x={x} y={y + 12} width="34" height="34" fill={ORO} />
      <g stroke={ORO_OSCURO} strokeWidth="0.4" opacity="0.6">
        {Array.from({ length: 9 }, (_, i) => (
          <g key={i}>
            <path d={`M${x + (i + 1) * 3.4} ${y + 12} V${y + 46}`} />
            <path d={`M${x} ${y + 12 + (i + 1) * 3.4} H${x + 34}`} />
          </g>
        ))}
      </g>
    </g>
  );
}

function Perlas({ n, resuelto }: { n: number; resuelto: boolean }) {
  const cifras = String(n).split('').map(Number).reverse();
  const columnas = cifras.length;
  const ancho = 320;
  const col = (ancho - 20) / columnas;
  return (
    <Tapete alto={170}>
      {cifras
        .map((d, orden) => ({ d, orden }))
        .reverse()
        .map(({ d, orden }, i) => {
          const x0 = 10 + i * col;
          const centro = x0 + col / 2;
          return (
            <g key={orden}>
              {/* El material, apilado. */}
              {orden === 0 &&
                Array.from({ length: d }, (_, k) => <Perla key={k} x={centro - 9 + (k % 3) * 9} y={30 + Math.floor(k / 3) * 10} r={4} />)}
              {orden === 1 && Array.from({ length: d }, (_, k) => <Barra key={k} x={centro - ((Math.min(d, 9) - 1) * 6.5) / 2 + k * 6.5} y={18} />)}
              {orden === 2 &&
                Array.from({ length: d }, (_, k) => <Cuadrado key={k} x={centro - 26 + (k % 3) * 6} y={16 + Math.floor(k / 3) * 7 + (k % 3) * 3} />)}
              {orden === 3 && Array.from({ length: d }, (_, k) => <Cubo key={k} x={centro - 28 + (k % 3) * 5} y={14 + Math.floor(k / 3) * 8 + (k % 3) * 4} />)}
              {orden === 4 && (
                <g>
                  {Array.from({ length: d }, (_, k) => (
                    <rect key={k} x={centro - 22 + (k % 3) * 4} y={18 + k * 7} width="44" height="16" rx="3" fill="#ffd54a" stroke={ORO_OSCURO} />
                  ))}
                  <text x={centro} y={102} textAnchor="middle" fontSize="9" fontWeight="800" fill={ORO_OSCURO}>
                    ×10 cubos
                  </text>
                </g>
              )}
              {/* La tarjeta del número, del color de su orden. */}
              <rect x={x0 + 6} y={116} width={col - 12} height={30} rx="6" fill="#fff" stroke={ORDEN[orden].color} strokeWidth="2.5" />
              <text x={centro} y={138} textAnchor="middle" fontSize="20" fontWeight="900" fill={ORDEN[orden].color}>
                {resuelto ? d : '?'}
              </text>
              <text x={centro} y={160} textAnchor="middle" fontSize="10" fontWeight="800" fill={ORDEN[orden].color}>
                {ORDEN[orden].nombre}
              </text>
            </g>
          );
        })}
    </Tapete>
  );
}

/* ------------------------------------------------------- tablero de cuentas */

function Matriz({ filas, columnas, resuelto }: { filas: number; columnas: number; resuelto: boolean }) {
  const paso = Math.min(13, 120 / Math.max(filas, 1), 250 / Math.max(columnas, 1));
  const w = columnas * paso;
  const x0 = (320 - w) / 2 + paso / 2;
  return (
    <Tapete alto={Math.max(110, filas * paso + 44)}>
      {Array.from({ length: filas }, (_, f) => (
        <g key={f}>
          {Array.from({ length: columnas }, (_, c) => (
            <circle key={c} cx={x0 + c * paso} cy={20 + f * paso} r={paso * 0.36} fill={f % 2 ? '#2563eb' : '#dc2626'} opacity="0.9" />
          ))}
          <text x={x0 - paso} y={24 + f * paso} fontSize="9" fontWeight="800" fill={TINTA} textAnchor="end">
            {f + 1}
          </text>
        </g>
      ))}
      <text x="160" y={filas * paso + 34} textAnchor="middle" fontSize="13" fontWeight="900" fill={TINTA}>
        {filas} filas de {columnas}
        {resuelto ? ` = ${filas * columnas}` : ' = ?'}
      </text>
    </Tapete>
  );
}

/* -------------------------------------------------- operación en columnas */

function Columnas({ a, b, op, resultado, resuelto }: { a: number; b: number; op: string; resultado: number; resuelto: boolean }) {
  const filas = [String(a), String(b), resuelto ? String(resultado) : '?'.repeat(String(resultado).length)];
  const ancho = Math.max(...filas.map((f) => f.length));
  const celda = 30;
  const x0 = 160 + (ancho * celda) / 2;
  const cifra = (s: string, fila: number) =>
    s
      .padStart(ancho, ' ')
      .split('')
      .map((ch, i) => {
        const orden = ancho - 1 - i;
        return (
          <text key={i} x={x0 - (ancho - i) * celda + celda / 2} y={30 + fila * 34} textAnchor="middle" fontSize="24" fontWeight="900" fill={ch === '?' ? '#9a8a6a' : ORDEN[orden]?.color ?? TINTA}>
            {ch.trim()}
          </text>
        );
      });
  return (
    <Tapete alto={120}>
      {/* Las cabeceras de cada orden, como en el juego de sellos. */}
      {Array.from({ length: ancho }, (_, i) => {
        const orden = ancho - 1 - i;
        return <rect key={i} x={x0 - (ancho - i) * celda + 3} y="8" width={celda - 6} height="4" rx="2" fill={ORDEN[orden]?.color ?? TINTA} />;
      })}
      {cifra(filas[0], 0)}
      <text x={x0 - ancho * celda - 16} y={64} textAnchor="middle" fontSize="24" fontWeight="900" fill={TINTA}>
        {op}
      </text>
      {cifra(filas[1], 1)}
      <rect x={x0 - ancho * celda - 26} y={74} width={ancho * celda + 26} height="3" fill={TINTA} />
      {cifra(filas[2], 2)}
    </Tapete>
  );
}

/* --------------------------------------------------------------- geometría */

function Angulo({ grados, resuelto }: { grados: number; resuelto: boolean }) {
  const r = 90;
  const cx = 110;
  const cy = 120;
  const rad = (grados * Math.PI) / 180;
  const x2 = cx + Math.cos(rad) * r;
  const y2 = cy - Math.sin(rad) * r;
  const tipo = grados < 90 ? 'agudo' : grados === 90 ? 'recto' : 'obtuso';
  const color = tipo === 'agudo' ? '#16a34a' : tipo === 'recto' ? '#2563eb' : '#dc2626';
  const arco = 34;
  return (
    <Tapete alto={140}>
      <path d={`M${cx} ${cy} L${cx + r} ${cy}`} stroke={TINTA} strokeWidth="4" strokeLinecap="round" />
      <path d={`M${cx} ${cy} L${x2} ${y2}`} stroke={TINTA} strokeWidth="4" strokeLinecap="round" />
      {grados === 90 ? (
        <path d={`M${cx + 18} ${cy} V${cy - 18} H${cx}`} fill="none" stroke={color} strokeWidth="3" />
      ) : (
        <path d={`M${cx + arco} ${cy} A${arco} ${arco} 0 0 0 ${cx + Math.cos(rad) * arco} ${cy - Math.sin(rad) * arco}`} fill={`${color}33`} stroke={color} strokeWidth="3" />
      )}
      <circle cx={cx} cy={cy} r="4" fill={TINTA} />
      <text x="250" y="60" textAnchor="middle" fontSize="26" fontWeight="900" fill={color}>
        {grados}°
      </text>
      {resuelto && (
        <text x="250" y="92" textAnchor="middle" fontSize="16" fontWeight="900" fill={color}>
          {tipo}
        </text>
      )}
      <text x="250" y="118" textAnchor="middle" fontSize="9" fill="#7a6a4a">
        recto = 90° (una esquina)
      </text>
    </Tapete>
  );
}

function Rectas({ clase }: { clase: Extract<Visual, { tipo: 'rectas' }>['clase'] }) {
  const linea = (d: string, color = TINTA) => <path d={d} stroke={color} strokeWidth="4" strokeLinecap="round" fill="none" />;
  const flecha = (x: number, y: number, ang: number, color = TINTA) => (
    <path d="M0 0 L-12 -6 L-12 6 Z" fill={color} transform={`translate(${x} ${y}) rotate(${ang})`} />
  );
  return (
    <Tapete alto={130}>
      {clase === 'paralelas' && (
        <>
          {linea('M40 45 L280 45', '#2563eb')}
          {linea('M40 90 L280 90', '#2563eb')}
          {flecha(290, 45, 0, '#2563eb')}
          {flecha(30, 45, 180, '#2563eb')}
          {flecha(290, 90, 0, '#2563eb')}
          {flecha(30, 90, 180, '#2563eb')}
          <text x="160" y="72" textAnchor="middle" fontSize="11" fill="#7a6a4a">siempre a la misma distancia</text>
        </>
      )}
      {clase === 'perpendiculares' && (
        <>
          {linea('M60 70 L260 70', '#dc2626')}
          {linea('M160 15 L160 120', '#dc2626')}
          <path d="M160 70 h16 v-16 h-16" fill="none" stroke={TINTA} strokeWidth="2.5" />
        </>
      )}
      {clase === 'secantes' && (
        <>
          {linea('M50 110 L270 25', '#16a34a')}
          {linea('M50 30 L270 105', '#16a34a')}
          <circle cx="160" cy="67" r="6" fill="#dc2626" />
        </>
      )}
      {clase === 'semirrecta' && (
        <>
          {linea('M60 70 L270 70')}
          <circle cx="60" cy="70" r="7" fill="#dc2626" />
          {flecha(285, 70, 0)}
          <text x="60" y="100" textAnchor="middle" fontSize="11" fill="#7a6a4a">origen</text>
        </>
      )}
      {clase === 'segmento' && (
        <>
          {linea('M70 70 L250 70')}
          <circle cx="70" cy="70" r="7" fill="#dc2626" />
          <circle cx="250" cy="70" r="7" fill="#dc2626" />
          <text x="160" y="100" textAnchor="middle" fontSize="11" fill="#7a6a4a">dos extremos: se puede medir</text>
        </>
      )}
      {clase === 'vertice' && (
        <>
          {linea('M110 105 L260 105')}
          {linea('M110 105 L220 30')}
          <circle cx="110" cy="105" r="8" fill="#dc2626" />
        </>
      )}
      {clase === 'reloj' && (
        <g transform="translate(160 66)">
          <circle r="52" fill="#fff" stroke={TINTA} strokeWidth="4" />
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d="M0 -46 V-40" stroke={TINTA} strokeWidth="3" transform={`rotate(${i * 30})`} />
          ))}
          {linea('M0 0 V-38', '#dc2626')}
          {linea('M0 0 H28', '#2563eb')}
        </g>
      )}
      {clase === 'simetria' && (
        <g transform="translate(160 68)">
          <path d="M0 0 C-30 -50 -80 -40 -70 -5 C-80 30 -30 45 0 10 Z" fill="#f472b6" stroke={TINTA} strokeWidth="2" />
          <path d="M0 0 C30 -50 80 -40 70 -5 C80 30 30 45 0 10 Z" fill="#f472b6" stroke={TINTA} strokeWidth="2" />
          <path d="M0 -58 V58" stroke="#2563eb" strokeWidth="3" strokeDasharray="6 5" />
        </g>
      )}
    </Tapete>
  );
}

function Poligono({ lados, medida, clase, resuelto }: { lados: number; medida?: number; clase?: string; resuelto: boolean }) {
  const cx = 110;
  const cy = 72;
  const r = 52;
  let puntos: [number, number][];
  if (clase === 'isosceles') puntos = [[cx, cy - 55], [cx - 32, cy + 45], [cx + 32, cy + 45]];
  else if (clase === 'escaleno') puntos = [[cx - 20, cy - 50], [cx - 55, cy + 45], [cx + 60, cy + 40]];
  else if (clase === 'rectangulo') puntos = [[cx - 45, cy - 50], [cx - 45, cy + 45], [cx + 55, cy + 45]];
  else puntos = Array.from({ length: lados }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / lados;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
  return (
    <Tapete alto={140}>
      <polygon points={puntos.map((p) => p.join(',')).join(' ')} fill="#fde68a" stroke="#dc2626" strokeWidth="4" strokeLinejoin="round" />
      {resuelto &&
        puntos.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="9" fill={TINTA} />
            <text x={x} y={y + 3.5} textAnchor="middle" fontSize="10" fontWeight="900" fill="#fff">
              {i + 1}
            </text>
          </g>
        ))}
      {clase === 'rectangulo' && <path d={`M${cx - 45} ${cy + 30} h15 v15`} fill="none" stroke={TINTA} strokeWidth="2.5" />}
      <text x="250" y="68" textAnchor="middle" fontSize="15" fontWeight="900" fill={TINTA}>
        {medida ? `lado ${medida} cm` : clase ? '' : `${resuelto ? lados : '?'} lados`}
      </text>
    </Tapete>
  );
}

function Rect({ a, b, unidad = 'cm', ver, resuelto }: { a: number; b: number; unidad?: string; ver: 'area' | 'perimetro'; resuelto: boolean }) {
  const paso = Math.min(20, 200 / a, 100 / b);
  const w = a * paso;
  const h = b * paso;
  const x0 = (320 - w) / 2;
  const y0 = 18;
  return (
    <Tapete alto={h + 54}>
      {Array.from({ length: a * b }, (_, i) => (
        <rect
          key={i}
          x={x0 + (i % a) * paso}
          y={y0 + Math.floor(i / a) * paso}
          width={paso}
          height={paso}
          fill={ver === 'area' ? (resuelto ? '#86efac' : '#dcfce7') : '#fff'}
          stroke="#9ca3af"
          strokeWidth="0.8"
        />
      ))}
      <rect x={x0} y={y0} width={w} height={h} fill="none" stroke={ver === 'perimetro' ? '#dc2626' : TINTA} strokeWidth={ver === 'perimetro' ? 4 : 2} strokeDasharray={ver === 'perimetro' && resuelto ? '0' : undefined} />
      <text x={x0 + w / 2} y={y0 - 4} textAnchor="middle" fontSize="11" fontWeight="900" fill={TINTA}>
        {a} {ver === 'area' ? '' : unidad}
      </text>
      <text x={x0 - 6} y={y0 + h / 2 + 4} textAnchor="end" fontSize="11" fontWeight="900" fill={TINTA}>
        {b} {ver === 'area' ? '' : unidad}
      </text>
      {resuelto && (
        <text x="160" y={y0 + h + 26} textAnchor="middle" fontSize="13" fontWeight="900" fill={ver === 'perimetro' ? '#dc2626' : '#15803d'}>
          {ver === 'area' ? `${a} × ${b} = ${a * b} cuadraditos` : `${a} + ${b} + ${a} + ${b} = ${2 * (a + b)} ${unidad}`}
        </text>
      )}
    </Tapete>
  );
}

/* ---------------------------------------------------------------- lengua */

const SIMBOLO: Record<string, (x: number) => React.ReactNode> = {
  nombre: (x) => <path d={`M${x - 16} 44 L${x + 16} 44 L${x} 14 Z`} fill="#111" />,
  adjetivo: (x) => <path d={`M${x - 12} 44 L${x + 12} 44 L${x} 22 Z`} fill="#1e3a8a" />,
  articulo: (x) => <path d={`M${x - 8} 44 L${x + 8} 44 L${x} 30 Z`} fill="#60a5fa" />,
  verbo: (x) => <circle cx={x} cy="30" r="15" fill="#dc2626" />,
  otra: () => null,
};

function Gramatica({ palabras, resuelto }: { palabras: Extract<Visual, { tipo: 'gramatica' }>['palabras']; resuelto: boolean }) {
  // Cada palabra ocupa según lo larga que es, y la letra encoge si no caben.
  const letras = palabras.reduce((n, w) => n + Math.max(3, w.p.length) + 1.5, 0);
  const porLetra = 300 / letras;
  const tam = Math.min(18, porLetra * 1.7);
  const centros: number[] = [];
  palabras.reduce((x, w) => {
    const ancho = (Math.max(3, w.p.length) + 1.5) * porLetra;
    centros.push(x + ancho / 2);
    return x + ancho;
  }, 10);
  return (
    <Tapete alto={resuelto ? 110 : 80}>
      {palabras.map((w, i) => {
        const x = centros[i];
        return (
          <g key={i}>
            {resuelto && SIMBOLO[w.clase](x)}
            <text x={x} y={resuelto ? 74 : 48} textAnchor="middle" fontSize={tam} fontWeight="800" fill={TINTA}>
              {w.p}
            </text>
            {resuelto && (
              <text x={x} y="96" textAnchor="middle" fontSize="9" fontWeight="800" fill="#7a6a4a">
                {w.clase === 'otra' ? '' : w.clase}
              </text>
            )}
          </g>
        );
      })}
    </Tapete>
  );
}

const VOCAL = /[aeiouáéíóúü]/i;

function Silabas({ silabas: trozos, tonica, juntas, resuelto }: { silabas: string[]; tonica: number; juntas?: boolean; resuelto: boolean }) {
  // Para contar sílabas, la palabra va entera hasta que se resuelve.
  const silabas = juntas && !resuelto ? [trozos.join('')] : trozos;
  const ancho = Math.min(80, 290 / silabas.length);
  const x0 = (320 - ancho * silabas.length) / 2;
  return (
    <Tapete alto={96}>
      {silabas.map((s, i) => {
        const fuerte = resuelto && i === tonica;
        return (
          <g key={i}>
            <rect x={x0 + i * ancho + 3} y={fuerte ? 12 : 22} width={ancho - 6} height={fuerte ? 56 : 46} rx="10" fill={fuerte ? '#facc15' : '#fff'} stroke={fuerte ? '#a16207' : '#d6c7a1'} strokeWidth="3" />
            <text x={x0 + i * ancho + ancho / 2} y={fuerte ? 50 : 52} textAnchor="middle" fontSize={fuerte ? 24 : 20} fontWeight="900">
              {s.split('').map((ch, k) => (
                <tspan key={k} fill={VOCAL.test(ch) ? '#2563eb' : '#dc2626'}>
                  {fuerte ? ch.toUpperCase() : ch}
                </tspan>
              ))}
            </text>
            {/* Una palmada por sílaba. */}
            <text x={x0 + i * ancho + ancho / 2} y="88" textAnchor="middle" fontSize="12">
              👏
            </text>
          </g>
        );
      })}
    </Tapete>
  );
}

function Letras({ palabras, orden, resuelto }: { palabras: string[]; orden?: boolean; resuelto: boolean }) {
  const lista = orden && resuelto ? [...palabras].sort((a, b) => a.localeCompare(b, 'es')) : palabras;
  return (
    <Tapete alto={Math.max(70, lista.length * 30 + 16)}>
      {lista.map((w, fila) => (
        <g key={w}>
          {orden && resuelto && (
            <text x="22" y={33 + fila * 30} textAnchor="middle" fontSize="13" fontWeight="900" fill="#7a6a4a">
              {fila + 1}.º
            </text>
          )}
          {w.split('').map((ch, i) => (
            <g key={i}>
              <rect x={42 + i * 23} y={12 + fila * 30} width="21" height="26" rx="4" fill="#fff" stroke="#e3d5b5" />
              <text x={52.5 + i * 23} y={31 + fila * 30} textAnchor="middle" fontSize="17" fontWeight="900" fill={VOCAL.test(ch) ? '#2563eb' : '#dc2626'}>
                {ch}
              </text>
            </g>
          ))}
        </g>
      ))}
    </Tapete>
  );
}

function Hueco({ antes, hueco, despues, dibujo, resuelto }: { antes: string; hueco: string; despues: string; dibujo?: string; resuelto: boolean }) {
  // Cada letra en su ficha; el hueco, una ficha vacía con borde de puntos
  // que al resolver se rellena en amarillo.
  const fichas = [
    ...antes.split('').map((ch) => ({ ch, hueco: false })),
    { ch: hueco, hueco: true },
    ...despues.split('').map((ch) => ({ ch, hueco: false })),
  ];
  const paso = Math.min(28, (dibujo ? 230 : 290) / fichas.length);
  const x0 = dibujo ? 70 : (320 - paso * fichas.length) / 2;
  let x = x0;
  return (
    <Tapete alto={84}>
      {dibujo && (
        <text x="38" y="56" textAnchor="middle" fontSize="38">
          {dibujo}
        </text>
      )}
      {fichas.map((f, i) => {
        const w = f.hueco ? paso * Math.max(1, f.ch.length) : paso;
        const xi = x;
        x += w + 2;
        return (
          <g key={i}>
            <rect
              x={xi}
              y="22"
              width={w}
              height="38"
              rx="5"
              fill={f.hueco ? (resuelto ? '#fde047' : '#fffbeb') : '#fff'}
              stroke={f.hueco ? '#a16207' : '#e3d5b5'}
              strokeWidth={f.hueco ? 2.5 : 1}
              strokeDasharray={f.hueco && !resuelto ? '4 3' : undefined}
            />
            {(!f.hueco || resuelto) && (
              <text x={xi + w / 2} y="49" textAnchor="middle" fontSize={Math.min(22, paso * 0.85)} fontWeight="900">
                {f.ch.split('').map((c, k) => (
                  <tspan key={k} fill={VOCAL.test(c) ? '#2563eb' : '#dc2626'}>
                    {c}
                  </tspan>
                ))}
              </text>
            )}
            {f.hueco && !resuelto && (
              <text x={xi + w / 2} y="49" textAnchor="middle" fontSize="18" fontWeight="900" fill="#a16207">
                ?
              </text>
            )}
          </g>
        );
      })}
    </Tapete>
  );
}

/* -------------------------------------------------------------- láminas */

function Lamina({ emoji, rotulo }: { emoji: string; rotulo?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-2xl bg-[#f6eedb] py-4 text-[#2b2118]">
      <span className="text-6xl leading-none drop-shadow">{emoji}</span>
      {rotulo && <span className="max-w-[55%] text-sm font-black">{rotulo}</span>}
    </div>
  );
}

const PLANETAS = [
  { n: 'Mercury', c: '#a8a29e', r: 4 },
  { n: 'Venus', c: '#fbbf24', r: 6 },
  { n: 'Earth', c: '#3b82f6', r: 6.5 },
  { n: 'Mars', c: '#dc2626', r: 5 },
  { n: 'Jupiter', c: '#d97706', r: 15 },
  { n: 'Saturn', c: '#eab308', r: 12 },
  { n: 'Uranus', c: '#67e8f9', r: 9 },
  { n: 'Neptune', c: '#2563eb', r: 9 },
];

function Planetas() {
  let x = 46;
  return (
    <svg viewBox="0 0 320 110" className="block h-auto w-full rounded-2xl" aria-hidden>
      <rect width="320" height="110" rx="14" fill="#0b1026" />
      {Array.from({ length: 30 }, (_, i) => (
        <circle key={i} cx={(i * 53) % 320} cy={(i * 37) % 110} r="0.9" fill="#fff" opacity="0.7" />
      ))}
      <circle cx="-10" cy="55" r="44" fill="#fbbf24" />
      <circle cx="-10" cy="55" r="52" fill="#fbbf24" opacity="0.25" />
      {PLANETAS.map((p) => {
        const cx = x + p.r;
        x += p.r * 2 + 12;
        return (
          <g key={p.n}>
            {p.n === 'Saturn' && <ellipse cx={cx} cy="50" rx={p.r * 1.8} ry={p.r * 0.5} fill="none" stroke="#fde68a" strokeWidth="2" />}
            <circle cx={cx} cy="50" r={p.r} fill={p.c} />
            <text x={cx} y="86" textAnchor="middle" fontSize="7" fontWeight="700" fill="#e2e8f0" transform={`rotate(-30 ${cx} 86)`}>
              {p.n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Rosa({ resuelto }: { resuelto: boolean }) {
  return (
    <Tapete alto={140}>
      <g transform="translate(160 70)">
        <circle r="54" fill="#fff" stroke="#d6c7a1" strokeWidth="3" />
        {[0, 90, 180, 270].map((a) => (
          <path key={a} d="M0 -48 L9 0 L0 0 Z" fill={a === 0 ? '#dc2626' : TINTA} transform={`rotate(${a})`} />
        ))}
        {[0, 90, 180, 270].map((a) => (
          <path key={`b${a}`} d="M0 -48 L-9 0 L0 0 Z" fill={a === 0 ? '#f87171' : '#6b5d48'} transform={`rotate(${a})`} />
        ))}
        <text y="-56" textAnchor="middle" fontSize="13" fontWeight="900" fill="#dc2626">N</text>
        <text y="66" textAnchor="middle" fontSize="13" fontWeight="900" fill={TINTA}>S</text>
        <text x="66" y="5" textAnchor="middle" fontSize="13" fontWeight="900" fill={TINTA}>E</text>
        <text x="-66" y="5" textAnchor="middle" fontSize="13" fontWeight="900" fill={TINTA}>W</text>
      </g>
      {/* El amanecer, al resolver: antes diría la respuesta. */}
      {resuelto && (
        <g>
          <text x="268" y="74" textAnchor="middle" fontSize="22">🌅</text>
          <text x="268" y="94" textAnchor="middle" fontSize="8" fill="#7a6a4a">sunrise</text>
        </g>
      )}
    </Tapete>
  );
}

/* ------------------------------------------------------------------ todo */

export function Material({ visual, resuelto }: { visual: Visual; resuelto: boolean }) {
  switch (visual.tipo) {
    case 'perlas':
      return <Perlas n={visual.n} resuelto={resuelto} />;
    case 'matriz':
      return <Matriz filas={visual.filas} columnas={visual.columnas} resuelto={resuelto} />;
    case 'columnas':
      return <Columnas a={visual.a} b={visual.b} op={visual.op} resultado={visual.resultado} resuelto={resuelto} />;
    case 'angulo':
      return <Angulo grados={visual.grados} resuelto={resuelto} />;
    case 'rectas':
      return <Rectas clase={visual.clase} />;
    case 'poligono':
      return <Poligono lados={visual.lados} medida={visual.medida} clase={visual.clase} resuelto={resuelto} />;
    case 'rect':
      return <Rect a={visual.a} b={visual.b} unidad={visual.unidad} ver={visual.ver} resuelto={resuelto} />;
    case 'gramatica':
      return <Gramatica palabras={visual.palabras} resuelto={resuelto} />;
    case 'silabas':
      return <Silabas silabas={visual.silabas} tonica={visual.juntas && !resuelto ? -1 : visual.tonica} juntas={visual.juntas} resuelto={resuelto} />;
    case 'letras':
      return <Letras palabras={visual.palabras} orden={visual.orden} resuelto={resuelto} />;
    case 'lamina':
      return visual.control && !resuelto ? null : <Lamina emoji={visual.emoji} rotulo={visual.rotulo} />;
    case 'hueco':
      return <Hueco antes={visual.antes} hueco={visual.hueco} despues={visual.despues} dibujo={visual.dibujo} resuelto={resuelto} />;
    case 'planetas':
      return <Planetas />;
    case 'rosa':
      return <Rosa resuelto={resuelto} />;
    default:
      return null;
  }
}
