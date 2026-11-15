import axios from 'axios';
import { apiErrorMessage } from '../../shared/api/apiError';

export function attendanceOpeningError(failure: unknown): string {
  if (!axios.isAxiosError(failure)) return 'No se pudo confirmar la apertura. El resultado podría requerir comprobación. No se repetirá automáticamente.';
  const status = failure.response?.status;
  if (!status || status >= 500) {
    return 'No se pudo confirmar la apertura. La sesión podría haberse creado. Vuelve a pulsar «Abrir asistencia» para comprobarlo; si existe, se recuperará. No se repetirá automáticamente.';
  }
  if (status === 400) return 'Revisa la sección y la fecha de asistencia. Deben ser válidas.';
  if (status === 404) return 'La sección o la sesión no está disponible, o no tienes permiso para consultarla en esta fecha.';
  if (status === 409) return 'No se pudo abrir la asistencia. Comprueba que el año esté abierto, la fecha sea lectiva y no futura, y la sección tenga un padrón válido.';
  return apiErrorMessage(failure);
}
