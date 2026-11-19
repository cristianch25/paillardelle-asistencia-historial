export function importPreviewFixture(page = 1, selected) {
  const rows = Array.from({ length: 25 }, (_, i) => ({ id: `1:${i + 13}`,
    estudiante: { codigo_estudiante: `000${i}`, apellido_paterno: 'Ficticio', apellido_materno: 'Prueba', nombres: `Estudiante ${i + 1}` },
    contexto: { nivel: 'Inicial - Jardín', grado_edad: 'Grupo 4 años', seccion: 'CREATIVOS' }, estado_original: 'DEFINITIVA',
    origen: { hoja: 'Prueba', fila: i + 13 }, clasificacion: i === 0 ? 'OBSERVADO' : 'NUEVO', seleccionable: i !== 0,
    contacto: { version: 1, telefono_original: i === 2 ? '999123456 / 988123456' : '999123456',
      telefono_propuesto: i === 2 ? null : '999123456', candidatos: i === 2 ? ['999123456', '988123456'] : [],
      corregido: false, puede_corregir: i !== 0 && i !== 3, requiere_revision_identidad: i === 3 },
    observaciones: i === 0 ? [{ campo: 'estudiante.codigo_estudiante', motivo: 'IDENTIFICACION_INSUFICIENTE', ambito: 'estudiante', bloqueante: true }]
      : i === 2 ? [{ campo: 'apoderado.telefonos_originales', motivo: 'TELEFONO_REQUIERE_SELECCION_O_CORRECCION', ambito: 'apoderado', bloqueante: true }]
      : i === 3 ? [{ campo: 'apoderado.numero_documento', motivo: 'CONTACTO_SIN_IDENTIDAD_FIABLE', ambito: 'apoderado', bloqueante: true }] : [],
    propuestas: i === 0 ? [] : ['CREAR_ESTUDIANTE', 'CREAR_MATRICULA_INICIAL'] }));
  return { id: 'vista-ficticia', caduca_en: new Date(Date.now() + 1800000).toISOString(), confirmacion_habilitada: false,
    seleccion: { anio_escolar_id: '10', nivel: 'INICIAL', fecha_ingreso: '2026-03-02' }, filas_seleccionadas: selected ?? rows.filter(row => row.seleccionable).map(row => row.id),
    resumen: { total: 25, NUEVO: 24, EXISTENTE: 0, EXISTENTE_CON_PROPUESTA: 0, OBSERVADO: 1, CONFLICTIVO: 0, REQUIERE_ADMIN: 0,
      existentes: 0, pendientes: 1, matriculas_propuestas: 24, telefonos_diferentes: 0, filas_con_observaciones: 3 },
    registros: rows.slice((page - 1) * 20, page * 20), pagination: { page, limit: 20, has_more: page === 1 } };
}
