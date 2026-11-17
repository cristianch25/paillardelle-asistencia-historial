import type { Dispatch, SetStateAction } from 'react';
import { useOutletContext } from 'react-router';
import type { SupervisionFilters } from './supervision.types';

export function useSupervisionWorkspace() {
  return useOutletContext<{ filters: SupervisionFilters; setFilters: Dispatch<SetStateAction<SupervisionFilters>>;
    yearInitialization?: { current: boolean } }>();
}
