import type { EducationLevel, Section } from './secciones.types';

export const educationLevelLabels: Record<EducationLevel, string> = {
  INICIAL: 'Inicial',
  PRIMARIA: 'Primaria',
  SECUNDARIA: 'Secundaria',
};

export function formatSectionName(section: Pick<Section, 'nivel' | 'grado' | 'letra'>): string {
  return section.nivel === 'INICIAL'
    ? `${section.grado} años · ${section.letra}`
    : `${section.grado}.º ${section.letra}`;
}
