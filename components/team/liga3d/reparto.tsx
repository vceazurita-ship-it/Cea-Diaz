import { renderToStaticMarkup } from 'react-dom/server';

import { CabezaAnime, CARA_BENJI, type PeloAnime } from '@/components/games/PenaltyArt';
import type { Reparto3D } from '@/components/team/liga3d/Partido3D';
import { claro, distancia, kitDeCasa } from '@/components/team/liga3d/colores';
import { faceOf, type HairStyle } from '@/lib/cromoArt';
import type { Once, Rival } from '@/lib/ligaCromos';
import type { ProfileId } from '@/types';

/* =========================================================================
 *  Quién sale al campo en 3D, y vestido de qué.
 *
 *  Las caras son las de los cromos —las mismas que en el álbum—, pasadas a
 *  las cabezas de la serie de los penaltis. Los de casa visten el color del
 *  peque, salvo que choque con el del rival: entonces sacan la segunda
 *  equipación, como en cualquier liga.
 * ========================================================================= */

const CAJA = '-34 -52 68 90';

/** Del corte del cromo al peinado de la serie más parecido. */
const PELO: Record<HairStyle, PeloAnime> = {
  corto: 'peinado',
  rizado: 'mata',
  afro: 'mata',
  largo: 'melena',
  rapado: 'rapado',
  cresta: 'punta',
  moño: 'melena',
  trenzas: 'melena',
  tupé: 'punta',
};

function cabeza(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={CAJA}>
      {node}
    </svg>,
  );
}

export function repartoDe(once: Once, rival: Rival, profileId: ProfileId, equipo: string): Reparto3D {
  const { kit, tinta } = kitDeCasa(profileId, rival);
  const fichas = once.jugadores.map((j, i) => {
    const face = faceOf(j.cromo.id, j.cromo.look);
    const partes = j.cromo.name.split(' ');
    return {
      id: j.slot.id,
      line: j.slot.line,
      x: j.slot.x,
      y: j.slot.y,
      nombre: corto(j.cromo.name, partes),
      dorsal: String(j.cromo.number ?? (j.slot.line === 'por' ? 1 : i + 1)),
      media: j.media,
      capitan: j.capitan,
      quimica: j.quimica,
      cara: cabeza(<CabezaAnime face={face} pelo={PELO[face.style] ?? 'peinado'} />),
      piel: face.skin,
    };
  });

  // El rival: once caras de la serie. El Nankatsu y Japón, con Benji en la portería.
  const conBenji = rival.id === 'nankatsu' || rival.id === 'japon';
  const caras: string[] = [];
  const pieles: string[] = [];
  for (let i = 0; i < 11; i += 1) {
    if (i === 0 && conBenji) {
      caras.push(cabeza(<CabezaAnime face={CARA_BENJI} pelo="rapado" gorra />));
      pieles.push(CARA_BENJI.skin);
      continue;
    }
    const face = faceOf(`rival:${rival.id}:${i}`);
    caras.push(cabeza(<CabezaAnime face={face} pelo={PELO[face.style] ?? 'mata'} />));
    pieles.push(face.skin);
  }

  const rivalClaro = claro(rival.color);
  return {
    casa: {
      kit,
      shorts: claro(kit) ? '#1e293b' : '#f8fafc',
      socks: kit,
      tinta,
      portero: distancia('#f59e0b', kit) > 150 ? '#f59e0b' : '#7c3aed',
      fichas,
    },
    rival: {
      kit: rival.color,
      shorts: rivalClaro ? rival.tinta : '#f8fafc',
      tinta: rival.tinta,
      portero: '#26272d',
      caras,
      pieles,
      estrella: rival.estrella.replace(/^su /, ''),
    },
    enlaces: once.enlaces,
    grada: [kit, kit, rival.color],
    vallas: [
      { texto: 'LIGA DE LOS CROMOS', fondo: '#0f172a', tinta: '#facc15' },
      { texto: equipo.toUpperCase(), fondo: kit, tinta },
      { texto: rival.nombre.toUpperCase(), fondo: rival.color, tinta: rival.tinta },
      { texto: 'CEA-DÍAZ', fondo: '#facc15', tinta: '#0f172a' },
    ],
  };
}

/** El nombre de la espalda: el apellido, salvo que sea un «Júnior». */
function corto(nombre: string, partes: string[]): string {
  const ultimo = partes[partes.length - 1] ?? nombre;
  return /^(J[uú]nior|Jr\.?)$/i.test(ultimo) && partes.length > 1 ? partes[partes.length - 2] : ultimo;
}
