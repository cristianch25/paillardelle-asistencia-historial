import { useRef, useState } from 'react';
import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../../auth/AuthContext';
import { peruToday } from '../../../shared/dates/civilDate';
import type { SupervisionFilters } from './supervision.types';

export default function SupervisionWorkspace() {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (session.user.rol !== 'ADMIN' && session.user.rol !== 'SUBDIRECCION') return <Navigate to="/inicio" replace />;
  const key = JSON.stringify([session.user.id, session.user.rol, session.user.nivel_asignado, session.expiresAt]);
  return <AccountWorkspace key={key} />;
}

function AccountWorkspace() {
  const yearInitialization = useRef(false);
  const [filters, setFilters] = useState<SupervisionFilters>({ anio_escolar_id: '', fecha: peruToday(), nivel: '', seccion_id: '', page: 1 });
  return <Outlet context={{ filters, setFilters, yearInitialization }} />;
}
