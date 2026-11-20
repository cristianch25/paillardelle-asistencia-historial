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

export type RetiredStudentEntry = {
  id: string;
  estudiante_id: string;
  anio_escolar_id: string;
  fecha_ingreso: string;
  fecha_retiro: string;
  estado: 'RETIRADA';
  matricula_seccion_id: string;
  seccion_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  estudiante: {
    id: string;
    codigo_estudiante: string | null;
    apellido_paterno: string;
    apellido_materno: string | null;
    nombres: string;
  };
};

export type ReingresoResponse = {
  id: string;
  estudiante_id: string;
  anio_escolar_id: string;
  estado: 'ACTIVA';
  seccion_id: string;
  matricula_seccion_id: string;
  fecha_reingreso: string;
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
  if (data?.id !== id || data.estado !== 'RETIRADA' || data.fecha_retiro !== fechaRetiro) {
    throw new Error('Confirmación de retiro no válida.');
  }
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
  if (data?.id !== id || data.estado !== 'ACTIVA' || data.seccion_nueva_id !== seccionId || data.fecha_efectiva !== fechaEfectiva) {
    throw new Error('Confirmación de cambio de sección no válida.');
  }
  return data;
}

export async function getRetiredStudents(sectionId: string): Promise<RetiredStudentEntry[]> {
  const { data } = await httpClient.get<{ seccion_id: string; retirados: RetiredStudentEntry[] }>(
    `/secciones/${sectionId}/retirados`
  );
  return data.retirados;
}

export async function reingresoStudent(
  matriculaId: string,
  seccionId: string,
  fechaReingreso: string,
): Promise<ReingresoResponse> {
  const { data } = await httpClient.post<ReingresoResponse>(`/matriculas/${matriculaId}/reingreso`, {
    seccion_id: seccionId,
    fecha_reingreso: fechaReingreso,
  });
  if (data?.id !== matriculaId || data.estado !== 'ACTIVA' || data.seccion_id !== seccionId || data.fecha_reingreso !== fechaReingreso) {
    throw new Error('Confirmación de reingreso no válida.');
  }
  return data;
}
