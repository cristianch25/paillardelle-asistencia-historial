import { httpClient } from '../../shared/api/httpClient';

export type WithdrawEnrollmentResponse = {
  id: string;
  estudiante_id: string;
  anio_escolar_id: string;
  fecha_ingreso: string;
  fecha_retiro: string;
  estado: 'RETIRADA';
};

export async function withdrawEnrollment(
  id: string,
  fechaRetiro: string,
  fechaRetiroEsperada: string | null = null,
): Promise<WithdrawEnrollmentResponse> {
  const { data } = await httpClient.patch<WithdrawEnrollmentResponse>(`/matriculas/${id}/retiro`, {
    fecha_retiro: fechaRetiro,
    fecha_retiro_esperada: fechaRetiroEsperada,
  });
  return data;
}
