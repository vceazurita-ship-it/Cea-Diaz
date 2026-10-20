'use client';

import { useEffect, useState } from 'react';

import type { ArchivoCole } from '@/lib/apuntesCole';
import { classroomCached, classroomStatus, onClassroomChange } from '@/lib/classroomClient';
import { isClassroomProfile, type ClassroomSnapshot } from '@/lib/classroomModel';
import { materialesCole } from '@/lib/coleArchivos';
import type { ProfileId } from '@/types';

/**
 * Lo último bajado (o pegado) de Classroom para un niño, o `null`. Se pide
 * una vez —la memoria de `classroomClient` la comparte con el panel de
 * Classroom— y se pone al día cuando el panel la cambia. Si no hay conexión
 * o falla, queda en `null` y quien la use sigue sin ella.
 */
export function useClassroomSnapshot(profileId: ProfileId): ClassroomSnapshot | null {
  const [snapshot, setSnapshot] = useState<ClassroomSnapshot | null>(() =>
    isClassroomProfile(profileId) ? (classroomCached(profileId)?.link?.snapshot ?? null) : null,
  );
  useEffect(() => {
    if (!isClassroomProfile(profileId)) {
      setSnapshot(null);
      return;
    }
    let alive = true;
    void classroomStatus(profileId)
      .then((s) => alive && setSnapshot(s.link?.snapshot ?? null))
      .catch(() => undefined);
    const dejar = onClassroomChange((quien, s) => {
      if (alive && quien === profileId) setSnapshot(s.link?.snapshot ?? null);
    });
    return () => {
      alive = false;
      dejar();
    };
  }, [profileId]);
  return snapshot;
}

/** La lista de apuntes del cole subidos para un niño (sin enlaces), o `null`. */
export function useApuntesCole(profileId: ProfileId): ArchivoCole[] | null {
  const [archivos, setArchivos] = useState<ArchivoCole[] | null>(null);
  useEffect(() => {
    if (!isClassroomProfile(profileId)) {
      setArchivos(null);
      return;
    }
    let alive = true;
    materialesCole(profileId)
      .then((d) => alive && setArchivos(d?.archivos ?? null))
      .catch(() => alive && setArchivos(null));
    return () => {
      alive = false;
    };
  }, [profileId]);
  return archivos;
}
