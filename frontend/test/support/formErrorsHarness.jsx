import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';
import EnrollmentWithdrawDialog from '../../src/features/matriculas/EnrollmentWithdrawDialog';
import SectionChangeDialog from '../../src/features/matriculas/SectionChangeDialog';
import ReingresoDialog from '../../src/features/matriculas/ReingresoDialog';
import ChangePasswordDialog from '../../src/features/auth/ChangePasswordDialog';

window.authTest = { documentId: String(Math.random()) };
const state = window.formErrorsTest = { writes: 0, checks: 0, successes: 0, closed: 0, mode: '' };
const section = { id: '11', anio_escolar_id: '1', nivel: 'PRIMARIA', grado: 4, letra: 'A', activo: true };
const entry = { id: '1', fecha_ingreso: '2020-03-01', fecha_inicio: '2020-03-01', fecha_retiro: null,
  estudiante: { id: '2', nombres: 'Ana', apellido_paterno: 'Pérez', apellido_materno: 'Gómez' } };
httpClient.defaults.adapter = async config => {
  const response = data => ({ status: 200, statusText: 'OK', headers: {}, config, data });
  const reject = (status, error) => {
    throw new AxiosError('Detalle técnico ficticio', 'ERR_BAD_RESPONSE', config, undefined,
      { ...response({ error }), status });
  };
  if (config.method === 'get' && config.url === '/secciones/') {
    if (state.mode === 'load403') reject(403, 'Detalle técnico ficticio');
    return response({ secciones: [section, { ...section, id: '14', letra: 'B' }],
      pagination: { page: 1, limit: 100, has_more: false } });
  }
  if (!['post', 'patch'].includes(config.method)) throw new Error('Consulta no prevista en la prueba');
  state.writes++;
  if (state.mode === 'network') throw new AxiosError('Detalle técnico ficticio', 'ERR_NETWORK', config);
  if (state.mode === 'business400') reject(400, config.url.startsWith('/auth/')
    ? 'Contraseña actual incorrecta.' : 'La fecha indicada no es válida.');
  if (state.mode === 'business403') reject(403, 'Detalle técnico ficticio');
  if (state.mode === 'business409') reject(409, 'La operación no es compatible con el estado actual. Actualiza la consulta.');
  if (state.mode === 'server500') reject(500, 'Detalle técnico ficticio');
  if (state.mode === 'badSuccess') return response('<html>Detalle técnico ficticio</html>');
  throw new Error('Modo de escritura no previsto en la prueba');
};

function Harness() {
  const [kind, setKind] = useState(''), [serial, setSerial] = useState(0);
  state.open = (value, mode) => {
    Object.assign(state, { mode, writes: 0, checks: 0, successes: 0, closed: 0 });
    setSerial(n => n + 1); setKind(value);
  };
  const onClose = () => { state.closed++; setKind(''); };
  const props = { onClose, onSuccess: () => { state.successes++; },
    onCheckState: () => { state.checks++; } };
  return <main id="main-content">
    {kind === 'withdraw' && <EnrollmentWithdrawDialog key={serial} {...props} entry={entry} />}
    {kind === 'section' && <SectionChangeDialog key={serial} {...props} entry={entry} currentSection={section} />}
    {kind === 'reentry' && <ReingresoDialog key={serial} {...props} studentName="Pérez Gómez Ana" matriculaId="1"
      anioEscolarId="1" nivel="PRIMARIA" grado={4} fechaRetiro="2020-06-15" />}
    {kind === 'password' && <ChangePasswordDialog key={serial} onClose={onClose} />}
  </main>;
}
createRoot(document.getElementById('root')).render(<Harness />);
