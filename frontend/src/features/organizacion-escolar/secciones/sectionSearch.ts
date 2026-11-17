import type { Section } from './secciones.types';

function normalized(value: string) {
  return value.toLowerCase().replace(/(\d)\s*\.?\s*[°º]/g, '$1 ')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/(\d)(\p{L})/gu, '$1 $2').replace(/(\p{L})(\d)/gu, '$1 $2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function searchSections(sections: Section[], query: string): Section[] {
  const terms = normalized(query).split(/\s+/).filter(Boolean);
  return sections.filter(section => {
    const name = normalized(section.letra), level = section.nivel.toLowerCase();
    return terms.every(term => /^\d+$/.test(term) ? Number(term) === section.grado
      : level.startsWith(term) || name.includes(term) || (section.nivel === 'INICIAL' && term === 'anos'));
  });
}
