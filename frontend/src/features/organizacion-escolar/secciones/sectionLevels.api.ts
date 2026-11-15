import axios from 'axios';
import { getSections } from './secciones.api';
import type { EducationLevel } from './secciones.types';

export const educationLevels: readonly EducationLevel[] = ['INICIAL', 'PRIMARIA', 'SECUNDARIA'];

// Para SUBDIRECCION, el servicio valida nivel antes de consultar filas: 200 vacío también autoriza.
export async function getAuthorizedSectionLevels(): Promise<EducationLevel[]> {
  const results = await Promise.all(educationLevels.map(async nivel => {
    try {
      await getSections({ nivel, page: 1, limit: 1 });
      return nivel;
    } catch (failure) {
      if (axios.isAxiosError(failure) && failure.response?.status === 403) return null;
      throw failure;
    }
  }));
  return results.filter((level): level is EducationLevel => level !== null);
}
