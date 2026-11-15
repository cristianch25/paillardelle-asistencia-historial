import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { GuardedAction } from './NavigationProtectionContext';

type Pending = { action: GuardedAction; resolve: (accepted: boolean) => void; reject: (error: unknown) => void };
export function useDeferredAction(enabled: boolean, dirty: boolean, busy: boolean) {
  const flags = useRef({ enabled, dirty, busy });
  const current = useRef<Pending | null>(null);
  const [pending, setPending] = useState(false);
  useLayoutEffect(() => { flags.current = { enabled, dirty, busy }; }, [enabled, dirty, busy]);
  const cancel = useCallback(() => {
    const action = current.current; current.current = null; setPending(false); action?.resolve(false);
  }, []);
  useLayoutEffect(() => () => { current.current?.resolve(false); current.current = null; }, []);
  const request = useCallback(async (action: GuardedAction) => {
    if (current.current) return false;
    const flagsNow = flags.current;
    if (!flagsNow.enabled || (!flagsNow.dirty && !flagsNow.busy)) { await action(); return true; }
    return new Promise<boolean>((resolve, reject) => {
      current.current = { action, resolve, reject }; setPending(true);
    });
  }, []);
  const confirm = useCallback(async () => {
    if (flags.current.busy) return;
    const action = current.current;
    current.current = null; setPending(false);
    if (!action) return;
    try { await action.action(); action.resolve(true); } catch (error) { action.reject(error); }
  }, []);
  return { pending, request, confirm, cancel };
}
