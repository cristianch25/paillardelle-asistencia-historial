import './authHarness.jsx';
import { httpClient } from '../../src/shared/api/httpClient';
import { attendanceMock } from './attendanceMock.mjs';
import { selection } from './attendanceFixture.mjs';

const authAdapter = httpClient.defaults.adapter;
const { controls, adapter } = attendanceMock();
window.navigationTest = controls;
controls.extraSections = [{ ...selection.section, id: '3', grado: 5, letra: 'GENIALES' }];
window.confirm = message => { controls.prompts.push(message); return controls.confirmAnswer; };
httpClient.defaults.adapter = async config => {
  if (config.url.startsWith('/auth/')) return authAdapter(config);
  if (config.url === '/anios-escolares') return { config, data: { anios_escolares: [selection.year],
    pagination: { page: 1, limit: 100, has_more: false } }, status: 200, headers: {}, statusText: 'OK' };
  const result = await adapter(config);
  return result;
};
