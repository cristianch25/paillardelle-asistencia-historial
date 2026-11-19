import type { EducationLevel, Section } from './secciones.types';

export function gradesForLevel(level: EducationLevel | ''): number[] {
  if (!level) return [];
  return level === 'INICIAL' ? [4, 5]
    : Array.from({ length: level === 'PRIMARIA' ? 6 : 5 }, (_, index) => index + 1);
}

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

export function formatAdministrativeSectionName(section: Pick<Section, 'nivel' | 'grado' | 'letra'>): string {
  return section.nivel === 'INICIAL' ? formatSectionName(section) : `${section.grado} ${section.letra}`;
}

export function formatRegistrarSectionName(section: Pick<Section, 'nivel' | 'grado' | 'letra'>): string {
  return `${section.grado}${section.nivel === 'INICIAL' ? ' años' : ''} ${section.letra}`;
}
