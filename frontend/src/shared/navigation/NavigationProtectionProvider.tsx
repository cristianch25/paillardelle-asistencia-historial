import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useBlocker } from 'react-router';
import { NavigationProtectionContext } from './NavigationProtectionContext';
import { useDeferredAction } from './useDeferredAction';
import UnsavedChangesDialog from './UnsavedChangesDialog';

export default function NavigationProtectionProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const [guard, setGuard] = useState<{ id: object | null; dirty: boolean; busy: boolean }>({ id: null, dirty: false, busy: false });
  const deferred = useDeferredAction(enabled, guard.dirty, guard.busy);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => enabled && (guard.dirty || guard.busy)
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  const report = useCallback((id: object, dirty: boolean, busy: boolean) => {
    setGuard(current => current.id === id && current.dirty === dirty && current.busy === busy ? current : { id, dirty, busy });
  }, []);
  const remove = useCallback((id: object) => {
    setGuard(current => current.id === id ? { id: null, dirty: false, busy: false } : current);
  }, []);
  const { request, cancel, confirm, pending } = deferred;
  useEffect(() => {
    if (!enabled) {
      cancel();
      if (blocker.state === 'blocked') blocker.reset();
    } else if (blocker.state === 'blocked') {
      cancel();
      if (!guard.dirty && !guard.busy) blocker.proceed();
    } else if (pending && !guard.dirty && !guard.busy) void confirm();
  }, [enabled, blocker, guard.dirty, guard.busy, pending, cancel, confirm]);
  useEffect(() => {
    if (!enabled || !guard.dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [enabled, guard.dirty]);
  const value = useMemo(() => ({ request, report, remove }), [request, report, remove]);
  function cancelLeaving() { cancel(); if (blocker.state === 'blocked') blocker.reset(); }
  function confirmLeaving() {
    if (guard.busy || !enabled) return;
    if (blocker.state === 'blocked') blocker.proceed();
    else void confirm();
  }
  return (
    <NavigationProtectionContext.Provider value={value}>
      {children}
      <UnsavedChangesDialog open={enabled && (pending || blocker.state === 'blocked')} busy={guard.busy}
        onCancel={cancelLeaving} onConfirm={confirmLeaving} />
    </NavigationProtectionContext.Provider>
  );
}
