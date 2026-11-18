import { createContext, useContext } from 'react';
import type { ProfileSelection } from './profile.types';
export const StudentProfileContext = createContext<((selection: ProfileSelection) => void) | null>(null);
export const useStudentProfile = () => useContext(StudentProfileContext);
