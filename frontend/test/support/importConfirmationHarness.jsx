import './importPreviewHarness.jsx';
import { AxiosError } from 'axios';
import { httpClient } from '../../src/shared/api/httpClient';

const previous = httpClient.defaults.adapter;
const state = { calls: [], uncertain: false, hold: false, pending: [], receipt: null, revision: 1, missing: false };
window.siagieConfirmationTest = state;
httpClient.defaults.adapter = async config => {
  if (config.url.endsWith('/confirmacion')) {
    const input = JSON.parse(config.data); state.calls.push({ method: config.method, url: config.url, body: input });
    if (state.hold) await new Promise(resolve => state.pending.push(resolve));
    state.receipt = { estado: 'CONFIRMADA', confirmacion_id: '9007199254741999', repetida: false,
      cantidades: { estudiantes: input.filas.length, matriculas: input.filas.length, contactos: 1, vinculos: input.filas.length,
        telefonos: input.decisiones_telefono[0].decision === 'ACTUALIZAR' ? 1 : 0, telefonos_conservados: 0, contactos_pendientes: 1 },
      filas: input.filas.map((fila, index) => ({ fila, estudiante_id: String(1000 + index), matricula_id: String(2000 + index), contacto_pendiente: index === 0 })) };
    if (state.uncertain) throw new AxiosError('Privado', '', config, null, { config, status: 500 });
    return { config, status: 200, data: state.receipt };
  }
  if (config.url.startsWith('/importaciones/confirmaciones/')) {
    state.calls.push({ method: config.method, url: config.url });
    return { config, status: 200, data: state.missing ? { estado: 'SIN_CONFIRMACION_VERIFICADA' } : state.receipt };
  }
  const response = await previous(config);
  if (response.data.registros) {
    if (config.method === 'patch') state.revision++;
    Object.assign(response.data, { confirmacion_habilitada: response.data.filas_seleccionadas.length > 0,
      version_plan: String(state.revision).padStart(64, 'a'),
      resumen_confirmacion: { estudiantes: 24, matriculas: 24, contactos: 1, vinculos: 24, telefonos: 1, contactos_pendientes: 1 },
      decisiones_telefono: [{ id_propuesta: 'a3', telefono_actual: '999111222', telefono_propuesto: '999123456', afecta_otros_vinculos: true }] });
  }
  return response;
};
