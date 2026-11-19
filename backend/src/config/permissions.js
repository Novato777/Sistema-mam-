/**
 * Catálogo Oficial de Roles y Permisos Granulares del Sistema PMS Hotelero
 */

const PERMISSIONS_CATALOG = [
  // Dashboard
  { code: 'dashboard.view', module: 'DASHBOARD', label: 'Ver panel general e indicadores' },
  // Habitaciones
  { code: 'rooms.view', module: 'HABITACIONES', label: 'Consultar habitaciones y estados' },
  { code: 'rooms.manage', module: 'HABITACIONES', label: 'Crear, editar y eliminar habitaciones y tipos' },
  // Reservas
  { code: 'reservations.view', module: 'RESERVAS', label: 'Consultar reservas y calendario' },
  { code: 'reservations.manage', module: 'RESERVAS', label: 'Crear, modificar y cancelar reservas' },
  // Recepción y Huéspedes
  { code: 'reception.view', module: 'RECEPCION', label: 'Consultar huéspedes y folios de estancia' },
  { code: 'reception.checkin', module: 'RECEPCION', label: 'Realizar Check-in y asignar habitaciones' },
  { code: 'reception.checkout', module: 'RECEPCION', label: 'Realizar Check-out y liberar habitaciones' },
  // Caja y Movimientos Financieros
  { code: 'cash.view', module: 'CAJA', label: 'Consultar movimientos y estado de caja' },
  { code: 'cash.operate', module: 'CAJA', label: 'Abrir caja, registrar ingresos, egresos y pagos' },
  { code: 'cash.close', module: 'CAJA', label: 'Realizar arqueos y cierres de caja' },
  { code: 'cash.void', module: 'CAJA', label: 'Anular movimientos financieros con auditoría' },
  // Limpieza / Housekeeping
  { code: 'housekeeping.view', module: 'LIMPIEZA', label: 'Ver tablero de limpieza de habitaciones' },
  { code: 'housekeeping.operate', module: 'LIMPIEZA', label: 'Actualizar estados de aseo y reportar novedades' },
  { code: 'housekeeping.inspect', module: 'LIMPIEZA', label: 'Inspeccionar y aprobar habitaciones limpias' },
  // Restaurante y Servicios POS
  { code: 'restaurant.view', module: 'RESTAURANTE', label: 'Consultar menú, pedidos y servicios' },
  { code: 'restaurant.operate', module: 'RESTAURANTE', label: 'Tomar pedidos, cargos a habitación y ventas POS' },
  // Inventario y Compras
  { code: 'inventory.view', module: 'INVENTARIO', label: 'Consultar existencias y Kardex de inventario' },
  { code: 'inventory.manage', module: 'INVENTARIO', label: 'Registrar compras, entradas, salidas y ajustes' },
  // Contabilidad
  { code: 'accounting.view', module: 'CONTABILIDAD', label: 'Consultar libros contables y estados financieros' },
  { code: 'accounting.manage', module: 'CONTABILIDAD', label: 'Gestionar PUC, asientos contables, CXC y CXP' },
  // Mantenimiento
  { code: 'maintenance.view', module: 'MANTENIMIENTO', label: 'Consultar órdenes e historial de mantenimiento' },
  { code: 'maintenance.operate', module: 'MANTENIMIENTO', label: 'Registrar daños, costos y bloquear/liberar habitaciones' },
  // Reportes
  { code: 'reports.view', module: 'REPORTES', label: 'Visualizar reportes operativos y estadísticos' },
  { code: 'reports.export', module: 'REPORTES', label: 'Exportar reportes en PDF y Excel' },
  // Usuarios y Personal
  { code: 'users.view', module: 'USUARIOS', label: 'Consultar directorio de empleados, roles y sesiones' },
  { code: 'users.manage', module: 'USUARIOS', label: 'Crear, editar, activar/desactivar usuarios y permisos' },
  // Configuración del Hotel
  { code: 'config.view', module: 'CONFIGURACION', label: 'Consultar parámetros del establecimiento' },
  { code: 'config.manage', module: 'CONFIGURACION', label: 'Modificar configuración tributaria, tarifas y sedes' },
  // Notificaciones y Automatizaciones (Bloque 14)
  { code: 'notifications.view', module: 'NOTIFICACIONES', label: 'Consultar centro de notificaciones y avisos internos' },
  { code: 'notifications.manage', module: 'NOTIFICACIONES', label: 'Configurar plantillas, envío de mensajes y automatizaciones' },
  // Auditoría
  { code: 'audit.view', module: 'AUDITORIA', label: 'Consultar bitácora de auditoría y seguridad' }
];

const ALL_PERMISSION_CODES = PERMISSIONS_CATALOG.map((p) => p.code);

const ROLES_DEFINITION = {
  PROPIETARIO: {
    name: 'Propietario',
    description: 'Acceso total irrestricto a todos los establecimientos, finanzas, usuarios y configuración.',
    permissions: ALL_PERMISSION_CODES
  },
  ADMINISTRADOR: {
    name: 'Administrador',
    description: 'Gestión integral operativa y administrativa de los hoteles asignados.',
    permissions: ALL_PERMISSION_CODES
  },
  RECEPCIONISTA: {
    name: 'Recepcionista',
    description: 'Operación de front-desk: reservas, check-in, check-out, huéspedes, pagos de estancia y vista de habitaciones.',
    permissions: [
      'dashboard.view',
      'rooms.view',
      'reservations.view',
      'reservations.manage',
      'reception.view',
      'reception.checkin',
      'reception.checkout',
      'cash.view',
      'cash.operate',
      'housekeeping.view',
      'housekeeping.operate',
      'housekeeping.inspect',
      'restaurant.view',
      'restaurant.operate',
      'maintenance.view',
      'notifications.view',
      'notifications.manage'
    ]
  },
  CAJERO: {
    name: 'Cajero',
    description: 'Control de apertura de turno, cobros de folios, ingresos/egresos, arqueos y cierres de caja.',
    permissions: [
      'dashboard.view',
      'rooms.view',
      'reception.view',
      'cash.view',
      'cash.operate',
      'cash.close',
      'restaurant.view',
      'restaurant.operate',
      'reports.view',
      'reports.export'
    ]
  },
  LIMPIEZA: {
    name: 'Personal de Limpieza',
    description: 'Consulta de habitaciones pendientes de aseo, actualización de estado de limpieza y reporte de daños.',
    permissions: [
      'dashboard.view',
      'rooms.view',
      'housekeeping.view',
      'housekeeping.operate',
      'maintenance.view'
    ]
  },
  CONTABILIDAD: {
    name: 'Contabilidad',
    description: 'Gestión contable de partida doble, PUC, impuestos, compras, cuentas por cobrar/pagar y reportes financieros.',
    permissions: [
      'dashboard.view',
      'cash.view',
      'inventory.view',
      'accounting.view',
      'accounting.manage',
      'reports.view',
      'reports.export',
      'config.view',
      'audit.view'
    ]
  },
  RESTAURANTE: {
    name: 'Restaurante y Servicios',
    description: 'Operación de comedor, room service, minibar, lavandería y cargos a habitaciones.',
    permissions: [
      'dashboard.view',
      'rooms.view',
      'restaurant.view',
      'restaurant.operate',
      'inventory.view'
    ]
  },
  MANTENIMIENTO: {
    name: 'Mantenimiento',
    description: 'Atención de solicitudes de mantenimiento preventivo y correctivo, registro de costos y bloqueo técnico.',
    permissions: [
      'dashboard.view',
      'rooms.view',
      'maintenance.view',
      'maintenance.operate',
      'inventory.view'
    ]
  },
  AUDITOR: {
    name: 'Auditor',
    description: 'Acceso de solo lectura a todos los módulos operativos, cajas, contabilidad, sesiones y bitácora de auditoría.',
    permissions: [
      'dashboard.view',
      'rooms.view',
      'reservations.view',
      'reception.view',
      'cash.view',
      'housekeeping.view',
      'restaurant.view',
      'inventory.view',
      'accounting.view',
      'maintenance.view',
      'reports.view',
      'reports.export',
      'users.view',
      'config.view',
      'audit.view'
    ]
  }
};

/**
 * Calcula la lista efectiva de permisos de un usuario combinando:
 * 1) Su rol efectivo (rol global o rol en el hotel activo)
 * 2) Sus permisos personalizados (custom_permissions JSON)
 */
const resolveEffectivePermissions = (role, customPermissionsJson = null) => {
  const normalizedRole = role === 'ADMIN' ? 'PROPIETARIO' : role || 'RECEPCIONISTA';
  if (normalizedRole === 'PROPIETARIO') {
    return ALL_PERMISSION_CODES;
  }

  const baseRole = ROLES_DEFINITION[normalizedRole] || ROLES_DEFINITION.RECEPCIONISTA;
  const set = new Set(baseRole.permissions);

  if (customPermissionsJson) {
    try {
      const parsed =
        typeof customPermissionsJson === 'string'
          ? JSON.parse(customPermissionsJson)
          : customPermissionsJson;
      if (Array.isArray(parsed)) {
        for (const p of parsed) {
          if (typeof p === 'string' && ALL_PERMISSION_CODES.includes(p)) {
            set.add(p);
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.grant)) {
          parsed.grant.forEach((p) => {
            if (ALL_PERMISSION_CODES.includes(p)) set.add(p);
          });
        }
        if (Array.isArray(parsed.revoke)) {
          parsed.revoke.forEach((p) => set.delete(p));
        }
      }
    } catch (_) {
      // Ignorar JSON malformado
    }
  }

  return Array.from(set);
};

module.exports = {
  PERMISSIONS_CATALOG,
  ALL_PERMISSION_CODES,
  ROLES_DEFINITION,
  resolveEffectivePermissions
};

