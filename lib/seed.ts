import { addDays, todayKey } from '@/lib/dates';
import { getCategories, SPORTS } from '@/lib/habits';
import { PROFILES } from '@/lib/profiles';
import { entryKey } from '@/lib/storage';
import type { DayEntry, HabitDatabase, Metric, MetricValue } from '@/types';

/**
 * Genera datos de ejemplo para los últimos días. Sirve para probar los
 * resúmenes semanales/mensuales sin tener que registrar a mano.
 * El generador es determinista (semilla fija) para que la vista previa sea
 * estable entre recargas.
 */

function makeRandom(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function seedValue(metric: Metric, rand: () => number): MetricValue | undefined {
  // Deja huecos ocasionales para que los datos parezcan reales.
  if (rand() < 0.12) return undefined;

  switch (metric.type) {
    case 'toggle':
      return rand() < 0.72;
    case 'counter': {
      const base = Math.round(metric.target * (0.55 + rand() * 0.6));
      return Math.max(0, Math.min(metric.max, base));
    }
    case 'duration': {
      const base = metric.target * (0.5 + rand() * 0.75);
      const stepped = Math.round(base / metric.step) * metric.step;
      return Math.max(metric.min, Math.min(metric.max, Number(stepped.toFixed(2))));
    }
    case 'scale':
      return metric.min + Math.floor(rand() * (metric.max - metric.min + 1));
    case 'choice': {
      const option = metric.options[Math.floor(rand() * metric.options.length)];
      return option?.value;
    }
    default:
      return undefined;
  }
}

export function buildSeedDatabase(days = 28): HabitDatabase {
  const rand = makeRandom(20240821);
  const entries: Record<string, DayEntry> = {};
  const today = todayKey();

  for (const profile of PROFILES) {
    const metrics = getCategories(profile.id).flatMap((c) => c.metrics);

    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = addDays(today, -offset);

      // Ningún perfil registra absolutamente todos los días.
      if (rand() < 0.15) continue;

      const values: Record<string, MetricValue> = {};

      for (const metric of metrics) {
        // Cada niño entrena 2–3 actividades por día, no las cinco.
        if (metric.group && SPORTS.some((s) => s.id === metric.group)) {
          const trains = rand() < 0.4;
          if (!trains) continue;
        }
        const value = seedValue(metric, rand);
        if (value !== undefined) values[metric.id] = value;
      }

      if (Object.keys(values).length === 0) continue;

      entries[entryKey(profile.id, date)] = {
        date,
        profileId: profile.id,
        values,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  return { version: 1, entries };
}
