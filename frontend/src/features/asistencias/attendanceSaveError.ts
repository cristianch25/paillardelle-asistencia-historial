import axios from 'axios';

export function attendanceFailureStatus(error: unknown) {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}
export function attendanceRejection(status: number | undefined) {
  if (status === 400) return 'El servidor rechazó las marcas. Revisa tus selecciones; se conservan sin guardar.';
  if (status === 413) return 'El lote supera el tamaño permitido. Tus selecciones se conservan sin guardar.';
  if (status === 401) return 'Tu sesión ya no es válida. Inicia sesión nuevamente.';
  if (status === 403 || status === 404) return 'La asistencia no está disponible para tu cuenta. Se volverán a comprobar los permisos.';
  return null;
}
