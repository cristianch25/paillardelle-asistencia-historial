// Solo acciones y entidades de gestión de cuentas ya registradas, sin filtrar por rol.
export function securityEventSql(alias = 'a') {
  return `((${alias}.entidad = 'usuarios' AND ${alias}.accion IN (
    'CREAR_USUARIO', 'ACTUALIZAR_USUARIO', 'CAMBIAR_ESTADO_USUARIO',
    'CAMBIAR_PASSWORD', 'RESTABLECER_PASSWORD', 'CREAR_SUPERUSUARIO_LOCAL'))
    OR (${alias}.entidad = 'usuario_niveles_adicionales' AND ${alias}.accion = 'ACTUALIZAR_NIVELES_ADICIONALES'))`;
}
