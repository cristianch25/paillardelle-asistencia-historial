import './supervisionCorrectionHarness.jsx';
import { httpClient } from '../../src/shared/api/httpClient';
import { AxiosError } from 'axios';
import { studentProfileResponse } from './studentProfileFixture.mjs';

window.supervisionTest.role = 'ADMIN';
window.supervisionTest.level = null;
const previous = httpClient.defaults.adapter;
httpClient.defaults.adapter = async config => {
  const profile = /^\/estudiantes\/([^/]+)\/perfil$/.exec(config.url);
  if (profile) return { config, status: 200, data: studentProfileResponse(profile[1], config.params.anio_escolar_id, config.params.mes) };
  if (config.method !== 'patch') return previous(config);
  const body = JSON.parse(config.data), server = window.supervisionCorrectionTest.server;
  const before = server.padron.find(row => row.asistencia_id === body.cambios[0].asistencia_id);
  if (before.justificada && (before.estado !== body.cambios[0].estado || body.cambios[0].justificada === false)) {
    throw new AxiosError('Conflicto', '', config, null, { status: 409, config });
  }
  const response = await previous(config);
  for (const change of body.cambios) if (change.justificada) {
    Object.assign(server.padron.find(row => row.asistencia_id === change.asistencia_id), {
      justificada: true, motivo_justificacion: change.motivo_justificacion.trim(),
    });
  }
  response.data = structuredClone(server);
  return response;
};
