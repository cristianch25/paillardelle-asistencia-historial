import axios from 'axios';

export function errorEscritura(error: unknown): { mensaje: string; incierto: boolean } {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 400 || status === 409) {
    const detalle = axios.isAxiosError(error) ? error.response?.data?.error : undefined;
    const mensaje = typeof detalle === 'string' ? detalle.trim() : '';
    return { mensaje: mensaje && mensaje.length <= 500 && !/[<>\r\n]/.test(mensaje) ? mensaje
      : status === 400 ? 'No se pudo realizar la operación. Revisa los datos indicados.'
        : 'La operación no es compatible con el estado actual. Actualiza la consulta.', incierto: false };
  }
  if (status === 401 || status === 403) return { mensaje: apiErrorMessage(error), incierto: false };
  if (status === 404) return { mensaje: 'No se encontró el registro. Actualiza la consulta.', incierto: false };
  if (status === 413) return { mensaje: 'La solicitud es demasiado grande. Revisa los datos indicados.', incierto: false };
  // D44/RN-43 V8: perder la respuesta no demuestra que la escritura se haya revertido.
  return { mensaje: 'No se pudo confirmar el resultado. Comprueba el estado antes de volver a enviar.', incierto: true };
}

export function apiErrorMessage(error: unknown, login = false): string {
  if (!axios.isAxiosError(error)) return 'No se pudo completar la solicitud. Intenta nuevamente.';
  const status = error.response?.status;
  if (status === 429 && login) return 'Demasiados intentos. Inténtalo nuevamente cuando termine la espera';
  if (status === 401) {
    if (!login) return 'La sesión ya no es válida. Inicia sesión nuevamente.';
    return error.config?.url === '/auth/me' ? 'No se pudo validar la sesión. Vuelve a iniciar sesión.'
      : 'Usuario o contraseña incorrectos';
  }
  if (status === 403) return 'No tienes permiso para realizar esta acción.';
  if (status === 503) return 'El servicio de autenticación no está disponible en este momento.';
  if (!error.response) return login ? 'No se pudo conectar con el sistema. Inténtalo nuevamente'
    : 'No se pudo conectar con el servidor. Comprueba tu conexión e intenta nuevamente.';
  return 'No se pudo completar la solicitud. Intenta nuevamente.';
}
