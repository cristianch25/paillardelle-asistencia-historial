import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';
import { AuthContext } from '../../src/features/auth/AuthContext';
import { SeccionSelectionContext } from '../../src/features/organizacion-escolar/secciones/SeccionSelectionContext';
import EstudiantesSeccionPage from '../../src/features/organizacion-escolar/secciones/EstudiantesSeccionPage';

window.authTest = { documentId: String(Math.random()) };
const state = window.retiredTest = { calls: [], pending: [] };
const year = { id: '1', anio: 2026, estado: 'ABIERTO', fecha_inicio: '2026-01-01', fecha_fin: '2026-12-31' };
const sections = Object.fromEntries(['A', 'B'].map((id, index) => [id, {
  id: String(index + 11), anio_escolar_id: '1', nivel: 'PRIMARIA', grado: 4, letra: id, activo: true,
}]));
httpClient.defaults.adapter = async config => {
  state.calls.push({ url: config.url, method: config.method });
  if (config.method !== 'get') throw new Error('Solo se permiten consultas simuladas');
  const response = data => ({ status: 200, headers: {}, config, data });
  if (config.url.endsWith('/retirados')) {
    return new Promise((resolve, reject) => state.pending.push({ sectionId: config.url.split('/')[2],
      response, resolve, reject, config }));
  }
  if (config.url.endsWith('/padron')) return response({ fecha: config.params.fecha, padron: [],
    seccion: Object.values(sections).find(s => s.id === config.url.split('/')[2]) });
  if (config.url === '/asignaciones') return response({ asignaciones: [],
    pagination: { page: config.params.page, limit: config.params.limit, has_more: false } });
  throw new Error('Consulta no prevista en la prueba');
};
state.answer = (index, mode = 'ok', nombre) => {
  const pending = state.pending[index];
  if (mode === 'network' || typeof mode === 'number') {
    pending.reject(new AxiosError('Detalle técnico ficticio', '', pending.config, undefined,
      mode === 'network' ? undefined : { status: mode, data: { error: 'Detalle técnico ficticio' } }));
  } else {
    const data = mode === 'invalid' ? {} : { retirados: mode === 'empty' ? [] : [{
      id: `${pending.sectionId}-1`, estudiante_id: `${pending.sectionId}-2`, fecha_retiro: '2026-06-15',
      estudiante: { nombres: nombre ?? `Retirado ${pending.sectionId}`, apellido_paterno: 'Prueba' },
    }] };
    pending.resolve(pending.response(data));
  }
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};

function Harness() {
  const [selected, setSelected] = useState(null), [checking, setChecking] = useState(false);
  const [rol, setRol] = useState('ADMIN');
  state.select = id => setSelected(id ? { section: sections[id], year } : null);
  state.checking = setChecking;
  state.role = setRol;
  const session = { user: { id: '1', rol, nivel_asignado: rol === 'SUBDIRECCION' ? 'PRIMARIA' : null }, expiresAt: 'ficticio' };
  const selection = { selected, checking, error: '', unverified: false, revalidate: async () => {},
    select: async value => { setSelected(value); return true; }, clear: () => setSelected(null),
    attendanceDate: '2026-11-20', setAttendanceDate: () => {} };
  return <MemoryRouter><AuthContext.Provider value={{ session }}>
    <SeccionSelectionContext.Provider value={selection}>
      <main id="main-content"><EstudiantesSeccionPage /></main>
    </SeccionSelectionContext.Provider>
  </AuthContext.Provider></MemoryRouter>;
}
createRoot(document.getElementById('root')).render(<Harness />);
