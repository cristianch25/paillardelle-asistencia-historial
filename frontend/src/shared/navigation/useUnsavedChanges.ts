import { useLayoutEffect, useMemo } from 'react';
import { useNavigationProtection } from './NavigationProtectionContext';

export function useUnsavedChanges(scope: string | null, dirty: boolean, busy: boolean) {
  const { report, remove } = useNavigationProtection();
  const id = useMemo(() => ({ scope }), [scope]);
  useLayoutEffect(() => { report(id, dirty, busy); }, [id, dirty, busy, report]);
  useLayoutEffect(() => () => remove(id), [id, remove]);
}
