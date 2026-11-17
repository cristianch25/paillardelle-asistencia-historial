import { useEffect, useRef } from 'react';
import type { SchoolYear } from './aniosEscolares.types';
import { initialSchoolYear } from './initialSchoolYear';

// Una sola inicialización por pantalla/cuenta, incluso tras recargar sus datos.
export function useInitialSchoolYear(years: readonly SchoolYear[], ready: boolean, selectedId: string,
  select: (id: string) => void, sharedInitialization?: { current: boolean }) {
  const localInitialization = useRef(false);
  const initialized = sharedInitialization ?? localInitialization;
  useEffect(() => {
    if (!ready || initialized.current) return;
    initialized.current = true;
    if (selectedId) return; // También conserva selecciones explícitas de la URL.
    const id = initialSchoolYear(years);
    if (id) select(id);
  }, [years, ready, selectedId, select, initialized]);
}
