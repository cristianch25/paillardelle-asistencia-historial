import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useBlocker } from 'react-router';
import { NavigationProtectionContext } from './NavigationProtectionContext';
import { useDeferredAction } from './useDeferredAction';
import UnsavedChangesDialog from './UnsavedChangesDialog';

export default function NavigationProtectionProvider({ children, enabled = true, activity, continueLabel }:
  { children: ReactNode; enabled?: boolean; activity?: string; continueLabel?: string }) {
  const [guard, setGuard] = useState({ id: null as object | null, dirty: false, busy: false });
  const needsWarning = guard.dirty;
  const deferred = useDeferredAction(enabled, needsWarning, guard.busy);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => enabled && (needsWarning || guard.busy)
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  const report = useCallback((id: object, dirty: boolean, busy: boolean) => {
    setGuard(current => current.id === id && current.dirty === dirty && current.busy === busy
      ? current : { id, dirty, busy });
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
      if (!needsWarning && !guard.busy) blocker.proceed();
    } else if (pending && !needsWarning && !guard.busy) void confirm();
  }, [enabled, blocker, needsWarning, guard.busy, pending, cancel, confirm]);
  useEffect(() => {
    if (!enabled || !needsWarning) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [enabled, needsWarning]);
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
        dirty={guard.dirty} activity={activity} continueLabel={continueLabel}
        onCancel={cancelLeaving} onConfirm={confirmLeaving} />
    </NavigationProtectionContext.Provider>
  );
}
