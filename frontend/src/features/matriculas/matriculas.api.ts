import { httpClient } from '../../shared/api/httpClient';

export type WithdrawEnrollmentResponse = {
  id: string;
  estudiante_id: string;
  anio_escolar_id: string;
  fecha_ingreso: string;
  fecha_retiro: string;
  estado: 'RETIRADA';
};

export type SectionChangeResponse = {
  id: string;
  estudiante_id: string;
  anio_escolar_id: string;
  estado: 'ACTIVA';
  seccion_anterior_id: string;
  seccion_nueva_id: string;
  matricula_seccion_id: string;
  fecha_efectiva: string;
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

export async function changeStudentSection(
  id: string,
  seccionId: string,
  fechaEfectiva: string,
): Promise<SectionChangeResponse> {
  const { data } = await httpClient.post<SectionChangeResponse>(`/matriculas/${id}/cambio-seccion`, {
    seccion_id: seccionId,
    fecha_efectiva: fechaEfectiva,
  });
  return data;
}
