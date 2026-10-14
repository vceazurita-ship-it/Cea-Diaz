import type { ProfileGlance } from '@/components/ProfileSelector';
import type { HabitStore } from '@/hooks/useHabitStore';
import { addDays, formatShort, weekKeys } from '@/lib/dates';
import { diasEntre, diasSinApuntar, ultimoRegistro } from '@/lib/huecos';
import { cuandoEs, planDelDia } from '@/lib/examenes';
import { gameEnabledFor, gameResultFor, isGameDone } from '@/lib/games';
import { PROFILES } from '@/lib/profiles';
import { RETOS, RETO_META, cursoDe, resultadosDe, retoSuperado } from '@/lib/retoCole';
import { futbolResultFor, futbolSuperado } from '@/lib/retoFutbol';
import { computeDayScore, summarizePeriod } from '@/lib/scoring';
import { dueCount } from '@/lib/tasks';
import type { DateKey, ProfileId } from '@/types';

/**
 * Resumen de un vistazo para las tarjetas del selector.
 *
 * Va en su propio módulo y la portada lo pide aparte: para saber si quedan
 * retos del cole hace falta el temario, y el juego trae su banco de
 * preguntas. Con todo eso dentro del paquete de la portada, el móvil tardaba
 * segundos en pintar una pantalla que no los necesita para aparecer.
 */
export function computeGlances(
  store: Pick<HabitStore, 'getEntry' | 'entries' | 'getTasks'>,
  today: DateKey,
): Record<ProfileId, ProfileGlance> {
  return PROFILES.reduce(
    (acc, profile) => {
      const entry = store.getEntry(profile.id, today);
      const day = computeDayScore(profile.id, today, entry);
      const week = summarizePeriod(profile.id, weekKeys(today), store.entries);

      // Lo que a cada uno le queda por hacer hoy, para decirlo en la
      // portada antes de entrar: el juego, los retos del cole, el examen
      // que viene y los recados que vencen.
      const pendientes: ProfileGlance['pendientes'] = [];
      if (gameEnabledFor(profile)) {
        const game = gameResultFor(store.entries, profile.id, today);
        if (!game || !isGameDone(game)) pendientes.push({ icon: '🎮', label: game ? 'Juego a medias' : 'Juego del día' });
      }
      if (cursoDe(profile.id)) {
        const hoy = resultadosDe(store.entries, profile.id, today);
        const ganados = RETOS.filter((r) => retoSuperado(hoy[r])).length;
        if (ganados < RETOS.length) pendientes.push({ icon: '📚', label: `Cole ${ganados}/${RETOS.length}` });
        if (!futbolSuperado(futbolResultFor(store.entries, profile.id, today))) pendientes.push({ icon: '⚽', label: 'Reto de fútbol' });
        const examen = planDelDia(profile.id, today)?.pendientes[0];
        if (examen) pendientes.push({ icon: '📝', label: `${RETO_META[examen.asignatura].nombre}: ${cuandoEs(examen.fecha)}`, urgente: examen.fecha <= addDays(today, 2) });
      }
      const due = dueCount(store.getTasks(profile.id), today);
      if (due > 0) pendientes.push({ icon: '📋', label: `${due} ${due === 1 ? 'recado' : 'recados'}`, urgente: true });

      // Lo que se quedó sin apuntar: ayer, o unos días sueltos esta semana,
      // a quien registra a diario; a quien lo dejó, desde cuándo.
      const huecos = diasSinApuntar(store.entries, profile.id, today);
      if (huecos.length > 0) {
        pendientes.unshift({
          icon: '🕘',
          label:
            huecos[0] === addDays(today, -1)
              ? huecos.length === 1
                ? 'Ayer sin apuntar'
                : `Ayer y ${huecos.length - 1} más sin apuntar`
              : `${huecos.length} ${huecos.length === 1 ? 'día' : 'días'} sin apuntar`,
          urgente: true,
        });
      } else {
        const last = ultimoRegistro(store.entries, profile.id, today);
        if (last && diasEntre(last, today) > 3) {
          pendientes.push({ icon: '💤', label: `Sin apuntar desde el ${formatShort(last).replace('.', '')}` });
        }
      }

      acc[profile.id] = {
        today: day.ratio,
        stars: day.stars,
        streak: week.streak,
        tracked: !day.empty,
        pendientes,
      };
      return acc;
    },
    {} as Record<ProfileId, ProfileGlance>,
  );
}
