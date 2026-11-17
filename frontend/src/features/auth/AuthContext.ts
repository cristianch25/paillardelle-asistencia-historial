import { createContext, useContext } from 'react';
import type { AuthSession, LoginCredentials } from './auth.types';
import type { AuthSnapshot } from './authSessionLifecycle';

type AuthContextValue = {
  session: AuthSession | null;
  notice: string;
  initialization: AuthSnapshot['initialization'];
  restoreError: string;
  retryRestoration: () => Promise<void>;
  signIn: (credentials: LoginCredentials) => Promise<void>;
  signOut: () => void;
  verifySession: () => Promise<void>;
};
export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth requiere AuthProvider.');
  return context;
}
