import axios from 'axios';

export function apiErrorMessage(error: unknown, login = false): string {
  if (!axios.isAxiosError(error)) return 'No se pudo completar la solicitud. Intenta nuevamente.';
  const status = error.response?.status;
  if (status === 401) return login
    ? 'No se pudo iniciar sesión. Verifica tus credenciales o consulta al administrador.'
    : 'La sesión ya no es válida. Inicia sesión nuevamente.';
  if (status === 403) return 'No tienes permiso para realizar esta acción.';
  if (status === 503) return 'El servicio de autenticación no está disponible en este momento.';
  if (!error.response) return 'No se pudo conectar con el servidor. Comprueba tu conexión e intenta nuevamente.';
  return 'No se pudo completar la solicitud. Intenta nuevamente.';
}
