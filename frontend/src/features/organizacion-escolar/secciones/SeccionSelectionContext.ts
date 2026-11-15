import { createContext, useContext } from 'react';
import type { SectionSelection } from './secciones.types';

type SelectionContext = {
  selected: SectionSelection | null;
  checking: boolean;
  error: string;
  select: (selection: SectionSelection) => Promise<void>;
  revalidate: () => Promise<void>;
  clear: () => void;
};
export const SeccionSelectionContext = createContext<SelectionContext | null>(null);
export function useSectionSelection() {
  const context = useContext(SeccionSelectionContext);
  if (!context) throw new Error('Se requiere SeccionSelectionProvider.');
  return context;
}
