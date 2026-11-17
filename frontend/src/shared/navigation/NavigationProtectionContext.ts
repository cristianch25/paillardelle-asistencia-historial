import { createContext, useContext } from 'react';

export type GuardedAction = () => void | Promise<void>;
type NavigationProtection = {
  request: (action: GuardedAction) => Promise<boolean>;
  report: (id: object, dirty: boolean, busy: boolean) => void;
  remove: (id: object) => void;
};
export const NavigationProtectionContext = createContext<NavigationProtection>({
  request: async action => { await action(); return true; }, report: () => {}, remove: () => {},
});
export function useNavigationProtection() { return useContext(NavigationProtectionContext); }
