# HOTEL DEVELOPMENT ROADMAP — SISTEMA PMS HOTELERO INTEGRAL

**Filosofía del Producto:** *UN SOLO SISTEMA. TODAS LAS FUNCIONALIDADES. UNA SOLA SUSCRIPCIÓN.*

## Leyenda de Estados
- `[ ]` Pendiente.
- `[~]` En desarrollo.
- `[x]` Implementado y verificado (con pruebas de backend, frontend y persistencia).
- `[!]` Implementado con observaciones.

---

### BLOQUE 0 — Auditoría y transformación
- [x] Analizar el repositorio (estado en Git `HEAD` y cambios sin confirmar en el working tree).
- [x] Identificar módulos existentes (Hoteles 1 y 2, Restaurante, Lichiguería, Reportes PDF, Configuración, Auth).
- [x] Clasificar funcionalidades (Conservar, Transformar, Eliminar).
- [x] Identificar archivos obsoletos y discrepancias entre rutas/estados.
- [x] Identificar dependencias técnicas y riesgos de seguridad/concurrencia.
- [x] Definir arquitectura objetivo multi-tenant (SQLite local + PostgreSQL producción).
- [x] Crear documento de auditoría ([AUDITORIA_Y_PLAN_DE_TRANSFORMACION_HOTELERA.md](file:///e:/Repositorios/Sistema-mam-/AUDITORIA_Y_PLAN_DE_TRANSFORMACION_HOTELERA.md)).
- [x] Crear roadmap maestro ([HOTEL_DEVELOPMENT_ROADMAP.md](file:///e:/Repositorios/Sistema-mam-/HOTEL_DEVELOPMENT_ROADMAP.md)).
- [x] Esperar aprobación del usuario (`APROBAR BLOQUE 0` / `APROBAR BLOQUE 1`).

---

### BLOQUE 1 — Arquitectura hotelera, multiempresa y configuración del hotel
- [x] Respaldo automático de la base de datos original (`HEAD:backend/sistema_familiar.db`).
- [x] Soporte de transacciones ACID (`withTransaction`) en `backend/src/config/db.js` para SQLite y PostgreSQL.
- [x] Estructura organizacional del hotel y modelo de datos multi-tenant con `hotel_id` estricto.
- [x] Sistema de migraciones controladas e idempotentes + rescate de datos históricos (habitaciones, huéspedes, transacciones y restaurante).
- [x] Aislamiento multi-tenant por middleware (`tenant.js`) y selector de establecimiento activo en frontend (`HotelContext`).
- [x] Configuración individual de hoteles (Módulo 13: identidad comercial, logotipo, NIT/datos tributarios, moneda, zona horaria, impuestos, métodos de pago, departamentos y políticas de alojamiento/cancelación).
- [x] Seguridad y permisos iniciales en todas las rutas de la API.

---

### BLOQUE 2 — Autenticación, personal, usuarios y permisos (Módulo 10 parcial)
- [x] Login enriquecido con contexto de usuario, rol, permisos y hoteles asignados.
- [x] Control y registro de sesiones activas (`user_sessions`).
- [x] Roles predefinidos (`PROPIETARIO`, `ADMINISTRADOR`, `RECEPCIONISTA`, `CAJERO`, `LIMPIEZA`, `CONTABILIDAD`, `RESTAURANTE`, `MANTENIMIENTO`, `AUDITOR`).
- [x] Permisos granulares validados en backend (`requirePermission` en `auth.js` / `tenant.js`) y frontend (`HotelContext` / vistas por rol).
- [x] Gestión completa de usuarios (crear, editar, activar/desactivar, asignar roles, permisos y sedes).
- [x] Auditoría de accesos e historial inmutable de acciones (`audit_logs`).

---

### BLOQUE 3 — Dashboard General en Tiempo Real (Módulo 1)
- [x] Indicadores operativos reales de habitaciones (ocupadas, disponibles, reservadas, en limpieza, fuera de servicio/mantenimiento, % de ocupación).
- [x] Indicadores de recepción (huéspedes alojados actualmente, llegadas previstas hoy, salidas previstas hoy, reservas pendientes).
- [x] Resumen financiero del día y del mes (ingresos del día, egresos del día, estado de cajas abiertas, servicios vendidos).
- [x] Sistema de alertas operativas en tiempo real (pagos vencidos, check-outs pendientes, habitaciones por limpiar, stock mínimo, mantenimientos urgentes).
- [x] Gráficas e indicadores interactivos con soporte Modo Claro / Oscuro.

---

### BLOQUE 4 — Gestión de Habitaciones (Módulo 2)
- [x] Administración de tipos de habitación (capacidad, configuración de camas, tarifa base, características/amenidades, fotografías).
- [x] Crear, editar y desactivar/eliminar habitaciones con protección de historial referencial.
- [x] Gestión de los 9 estados operativos normados (`DISPONIBLE`, `RESERVADA`, `OCUPADA`, `PENDIENTE_LIMPIEZA`, `EN_LIMPIEZA`, `LIMPIA`, `INSPECCION_PENDIENTE`, `FUERA_DE_SERVICIO`, `MANTENIMIENTO`).
- [x] Configuración de tarifas especiales / por temporada o frecuencia.
- [x] Vista visual interactiva (Rack de habitaciones) con filtros por piso, tipo, estado y búsqueda rápida.
- [x] Historial completo por habitación (ocupación, limpieza y mantenimiento).

---

### BLOQUE 5 — Reservas y Disponibilidad (Módulo 3) — COMPLETADO ✅
- [x] Motor de consulta de disponibilidad por rango de fechas, horas, capacidad y tipo de habitación.
- [x] Crear, modificar, confirmar y cancelar reservas individuales y grupales (múltiples habitaciones).
- [x] Prevención transaccional de doble asignación (detección de conflictos de solapamiento de fechas).
- [x] Aplicación de tarifas, descuentos autorizados y registro de anticipos integrados con caja.
- [x] Gestión de reservas pendientes y marcación de No-Show.
- [x] Calendario visual interactivo de ocupación (Timeline / Gantt por habitación y fecha).

---

### BLOQUE 6 — Recepción, Huéspedes y Folios de Estancia (Módulo 4) — COMPLETADO ✅
- [x] Directorio y registro completo de huéspedes (identificación, contacto, nacionalidad, procedencia/destino para reportes legales SIRE/TRA, observaciones y documentos asociados).
- [x] Registro de acompañantes por habitación/estancia.
- [x] Flujo de Check-in (desde reserva previa o Walk-in directo) con validaciones de estado de habitación.
- [x] Apertura automática de Folio / Cuenta de estancia (`guest_accounts`) con soporte para cobro por noche o por frecuencia (diario, cada 3 días, semanal).
- [x] Cambio de habitación durante la estancia con trazabilidad en el folio.
- [x] Flujo de Check-out con validación de saldo pendiente (bloqueo o autorización expresa), liquidación de folio y disparo automático de tarea de limpieza (`PENDIENTE_LIMPIEZA`).
- [x] Consulta de huéspedes actuales e historial completo de hospedajes por huésped.

---

### BLOQUE 7 — Caja y Movimientos Financieros (Módulo 5) — COMPLETADO ✅
- [x] Apertura de caja por usuario, turno y punto de operación con saldo inicial.
- [x] Registro de ingresos, egresos, abonos, anticipos, pagos de folios de huéspedes y pagos de servicios por método de pago.
- [x] Devoluciones y anulaciones autorizadas mediante movimientos compensatorios y registro de auditoría (prohibición de borrado o edición silenciosa).
- [x] Arqueo de caja ciego/declarado, cálculo de saldos esperados vs. reales y registro de diferencias de caja.
- [x] Cierre de turno de caja y generación de comprobantes de pago/caja.
- [x] Historial y reportes de caja por usuario, turno, método de pago y rango de fechas.

---

### BLOQUE 8 — Limpieza y Housekeeping (Módulo 6) — COMPLETADO ✅
- [x] Panel de habitaciones pendientes de limpieza, en limpieza e inspección pendiente.
- [x] Creación automática de tarea de limpieza al realizar Check-out y programación manual de aseo diario.
- [x] Asignación de tareas a empleados de housekeeping con prioridades.
- [x] Registro de hora de inicio, hora de finalización, observaciones y evidencias.
- [x] Reporte directo de daños o faltantes desde limpieza hacia el módulo de Mantenimiento.
- [x] Flujo de inspección y aprobación para habilitar la habitación a estado `DISPONIBLE`.
- [x] Interfaz móvil simplificada y rápida pensada para el celular del personal de limpieza.

---

### BLOQUE 9 — Restaurante y Servicios del Hotel (Módulo 7) — COMPLETADO ✅
- [x] Catálogo de productos y servicios por departamento (Restaurante, Cafetería, Room Service, Minibar, Lavandería, Servicios adicionales).
- [x] Gestión de mesas (cuando aplique restaurante) y creación rápida de pedidos/comandas.
- [x] Registro de consumos de minibar y lavandería asociados a habitaciones ocupadas.
- [x] Modalidad dual de cobro: **Cargo directo al folio de la habitación (`account_charges`)** o **Pago directo en Caja (`payments` / `cash_movements`)**.
- [x] Gestión de devoluciones/anulaciones autorizadas de consumos.
- [x] Consulta de ventas y consumos por servicio, habitación y turno.

---

### BLOQUE 10 — Inventario Hotelero y Compras (Módulo 8) — COMPLETADO ✅
- [x] Catálogo integral de ítems de inventario (insumos de restaurante, bebidas/minibar, amenidades, productos de aseo, lencería, materiales de mantenimiento).
- [x] Gestión de proveedores y órdenes/facturas de compra con actualización de costos.
- [x] Movimientos de inventario: entradas, salidas, ajustes autorizados, traslados y consumo por departamento.
- [x] Kardex detallado por producto con trazabilidad de existencias y costos.
- [x] Recetas / fichas técnicas de consumo para descuento automático de insumos al vender productos de restaurante/servicios o entregar amenidades.
- [x] Alertas en tiempo real de stock mínimo y punto de reposición.

---

### BLOQUE 11 — Contabilidad y Administración Financiera (Módulo 9) — COMPLETADO ✅
- [x] Plan Único de Cuentas (PUC) configurable por hotel (con plantilla base hotelera pre-cargada).
- [x] Motor de asientos contables con validación estricta de **Partida Doble** ($\sum \text{Débitos} = \sum \text{Créditos}$).
- [x] Reglas de contabilización automática para operaciones de hospedaje, restaurante/servicios, caja, compras y gastos.
- [x] Comprobantes contables manuales y automáticos, Libro Diario y Libro Mayor.
- [x] Gestión de Cuentas por Cobrar (huéspedes corporativos/agencias) y Cuentas por Pagar (proveedores).
- [x] Conciliación de cajas/bancos y separación estricta entre cierre de turno de caja y cierre de periodo contable.
- [x] Estados financieros por periodo: Balance de Comprobación, Estado de Resultados (P&G) y Balance General.
- [x] Arquitectura de adaptador lista para conectar proveedor tecnológico de Facturación Electrónica DIAN.

---

### BLOQUE 12 — Personal y Mantenimiento (Módulos 10 y 11) — COMPLETADO ✅
- [x] Fichas de empleados, turnos, historial de actividades asignadas y métricas de rendimiento operativo (limpiezas realizadas, tiempos promedio, atenciones).
- [x] Módulo de Mantenimiento Preventivo y Correctivo: registro de daños, solicitudes, prioridades y asignación de responsables.
- [x] Programación de tareas de mantenimiento, registro de costos de materiales/mano de obra y adjunto de evidencias.
- [x] Bloqueo y desbloqueo operativo automático de habitaciones (`MANTENIMIENTO` / `FUERA_DE_SERVICIO`) sincronizado con disponibilidad de reservas.
- [x] Historial técnico completo por habitación.

---

### BLOQUE 13 — Reportes y Estadísticas (Módulo 12) — COMPLETADO ✅
- [x] Reportes de Ocupación (diaria, mensual, por tipo de habitación y por temporada).
- [x] Reportes de Ingresos (por habitación, por servicio, por departamento, ADR y RevPAR).
- [x] Reportes de Reservas, Cancelaciones, No-Shows y listado legal de Huéspedes (formato compatible con control migratorio/alojamiento).
- [x] Reportes detallados de Caja, Gastos, Compras, Valorización de Inventario y Rentabilidad.
- [x] Filtros dinámicos por rango de fechas, departamento, habitación, método de pago y usuario.
- [x] Exportación profesional a **PDF** (`jsPDF` + `jspdf-autotable` con membrete y logo del hotel) y **Excel/CSV**.

---

### BLOQUE 14 — Notificaciones y Automatizaciones (Módulo 14)
- [x] Centro de notificaciones internas en tiempo real (confirmaciones de reserva, llegadas/salidas del día, alertas de limpieza, habitaciones listas, mantenimiento, stock mínimo, cajas abiertas sin cerrar y movimientos financieros relevantes).
- [x] Motor de plantillas configurables por hotel para mensajes de confirmación de reserva, recordatorio de check-in y aviso de check-out.
- [x] Configuración e interfaz de integración con **WhatsApp Business Cloud API oficial** y **SMTP/Email** (con envío real cuando el hotel configure sus credenciales oficiales y generación de enlace directo/cola verificable sin simular falsos envíos).

---

### BLOQUE 15 — Seguridad, Pruebas Integrales y Auditoría Final
- [x] Pruebas automatizadas de aislamiento multiempresa (verificar que el Hotel A jamás pueda leer ni modificar registros del Hotel B).
- [x] Pruebas de autorización RBAC por cada uno de los 9 roles en backend y frontend.
- [x] Pruebas de integridad financiera y contable (cuadre de folios, cajas y partida doble).
- [x] Pruebas de concurrencia en reservas (prevención de overbooking ante peticiones simultáneas).
- [x] Verificación de diseño responsive en escritorio, tablet y móvil (especialmente vistas de Recepción y Housekeeping).
- [x] Documentación técnica final, guía de despliegue en producción y respaldo/recuperación.

