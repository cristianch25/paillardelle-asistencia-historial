import { headerText } from './padron-format.js';

// Interpretación de la fuente, nunca estados SQL ni cambios sobre el original.
export function sourceLevel(value) {
  const level = headerText(value);
  return level === 'INICIAL - JARDIN' ? 'INICIAL' : level;
}

export function sourceState(value) {
  const state = headerText(value);
  // SIAGIE: matriculado e incluido en nómina (Instructivo_SIAGIE_EBA.pdf, p. 65).
  // Solo habilita evaluar una propuesta con año/sección/fecha; nunca asigna ACTIVA.
  if (state === 'DEFINITIVA') return 'MATRICULADO';
  return ['MATRICULADO', 'TRASLADADO'].includes(state) ? state : null;
}
