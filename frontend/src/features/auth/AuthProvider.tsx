import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AuthContext } from './AuthContext';
import { createAuthSessionLifecycle } from './authSessionLifecycle';

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [lifecycle] = useState(createAuthSessionLifecycle);
  const state = useSyncExternalStore(lifecycle.subscribe, lifecycle.snapshot, lifecycle.snapshot);
  useEffect(() => {
    const disconnect = lifecycle.connect();
    void lifecycle.restore();
    return disconnect;
  }, [lifecycle]);

  return (
    <AuthContext.Provider value={{ ...state, signIn: lifecycle.signIn, signOut: lifecycle.signOut,
      verifySession: lifecycle.verifySession, retryRestoration: lifecycle.restore }}>
      {children}
    </AuthContext.Provider>
  );
}
