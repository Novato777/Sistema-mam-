# 🏨 PMS Hotelero Multi-Tenant SaaS — Manual Técnico y Guía de Operaciones
> **"UN SOLO SISTEMA. TODAS LAS FUNCIONALIDADES. UNA SOLA SUSCRIPCIÓN."**

---

## 1. Visión General de la Arquitectura
El sistema PMS Hotelero es una solución empresarial moderna diseñada para cadenas hoteleras, hoteles boutique, moteles y hospedajes independientes. Opera bajo un modelo **Multi-Tenant estricto** que garantiza el aislamiento total de datos entre establecimientos bajo una misma suscripción unificada.

```
+---------------------------------------------------------------------------------+
|                        FRONTEND CLIENT (React 19 + Vite)                         |
|  Tailwind CSS 4 · Mobile First Responsive · Lucide Icons · jsPDF & AutoTable    |
+---------------------------------------------------------------------------------+
                                      |
                           (JWT Bearer Token / HTTPS)
                                      v
+---------------------------------------------------------------------------------+
|                         BACKEND API (Node.js + Express)                         |
|   Helmet · Rate Limiting · RBAC Granular (9 Roles) · Multi-Tenant Middleware    |
+---------------------------------------------------------------------------------+
        |                             |                             |
        v                             v                             v
+------------------+         +------------------+          +------------------+
|  OPERACIÓN PMS   |         |    FINANCIERO    |          | COMUNICACIONES   |
| · Habitaciones   |         | · Caja por Turno |          | · WhatsApp Cloud |
| · Reservas ACID  |         | · Contabilidad   |          | · SMTP Mail      |
| · Check-in / Out |         |   Partida Doble  |          | · Enlace Directo |
| · Housekeeping   |         | · Factura DIAN   |          |   wa.me 1-clic   |
| · POS Restauran. |         | · Kardex / Stock |          | · Notificaciones |
+------------------+         +------------------+          +------------------+
                                      |
                      (Transacciones ACID / SQL Nativo)
                                      v
+---------------------------------------------------------------------------------+
|                     CAPA DE BASE DE DATOS DUAL & AGILIDAD                        |
|  - Desarrollo Local / Offline: SQLite con Foreign Keys activas                  |
|  - Producción Cloud Escalable: PostgreSQL (Neon / Supabase / AWS RDS)           |
+---------------------------------------------------------------------------------+
```

---

## 2. Catálogo Oficial de los 9 Roles RBAC y Matriz de Acceso
El sistema implementa control de acceso basado en roles con validación de tokens JWT en backend y renderizado condicional en frontend:

| Rol | Alcance y Propósito | Módulos Clave Habilitados | Restricciones de Seguridad |
|---|---|---|---|
| **PROPIETARIO** | Control supremo corporativo | Todos los módulos y todas las sedes | Ninguna restricción |
| **ADMINISTRADOR** | Gestión ejecutiva de la sede | Todos los módulos del hotel asignado | Confinado a sus hoteles |
| **RECEPCIONISTA** | Operación de Front-Desk | Dashboard, Habitaciones, Reservas, Check-in/out, Folios, Caja | Sin acceso a PUC ni configuración |
| **CAJERO** | Control financiero de turno | Caja, Arqueos, Cierres, Cobro dual POS | Sin acceso a mantenimiento ni tarifas |
| **LIMPIEZA** | Housekeeping móvil | Tablero de aseo, cambio de estado de habitación | Sin acceso a reservas ni datos de clientes |
| **CONTABILIDAD** | Administración contable | PUC, Libro Diario/Mayor, Balances, P&G, CXC/CXP | Sin acceso operativo a recepción |
| **RESTAURANTE** | POS de Comedor y Bar | Comandas, mesas, catálogo de platos, cargos a habitación | Sin acceso a contabilidad ni usuarios |
| **MANTENIMIENTO** | Mantenimiento técnico | Tickets, bloqueo y desbloqueo de habitaciones, costos | Sin acceso a folios ni reservas |
| **AUDITOR** | Auditoría y control | Solo lectura en reportes, contabilidad y bitácora | Denegada cualquier modificación (403) |

---

## 3. Resumen de los 15 Bloques Implementados y Verificados

1. **Bloque 0 — Auditoría y Transformación**: Depuración de código legado y plan de arquitectura.
2. **Bloque 1 — Multiempresa y Arquitectura Base**: Soporte para múltiples sedes independientes (`hotel_id`), transacciones ACID.
3. **Bloque 2 — Autenticación JWT y RBAC Granular**: Sesiones activas (`user_sessions`), catálogo de permisos.
4. **Bloque 3 — Dashboard General**: Métricas en tiempo real, alertas operativas y KPIs hoteleros.
5. **Bloque 4 — Gestión de Habitaciones y Rack**: 9 estados operativos, rack interactivo, fotos y tarifas por período.
6. **Bloque 5 — Reservas y Overbooking**: Motor transaccional de prevención de conflictos de fecha/habitación.
7. **Bloque 6 — Recepción, Folios y Huéspedes**: Check-in, check-out con saldo cero, acompañantes y soporte legal SIRE/TRA.
8. **Bloque 7 — Caja por Turno**: Aperturas, arqueos, cierres de turno y anulaciones compensadas auditadas.
9. **Bloque 8 — Housekeeping Móvil**: Tablero kanban táctil, cambio de estado de aseo e inspección de supervisor.
10. **Bloque 9 — Restaurante y Servicios POS**: Comandas por mesa, catálogo por departamento, cobro directo a caja o cargo a folio de habitación.
11. **Bloque 10 — Inventario y Compras**: Existencias, proveedores, órdenes de compra con costo promedio ponderado, Kardex y recetas automáticas en ventas POS.
12. **Bloque 11 — Contabilidad y Finanzas**: PUC clases 1 a 6, 14 reglas automáticas, balance de comprobación, P&G, Balance General, CXC/CXP y adaptador DIAN.
13. **Bloque 12 — Personal y Mantenimiento**: Tickets técnicos con bloqueo sincronizado de habitación y fichas de empleados por sede.
14. **Bloque 13 — Reportes y Estadísticas**: ADR, RevPAR, ocupación mensual, listado SIRE y exportación a PDF y Excel.
15. **Bloque 14 — Notificaciones y Automatizaciones**: Escáner de alertas en vivo, plantillas dinámicas, WhatsApp Cloud API Oficial y enlace 1-clic `wa.me`.
16. **Bloque 15 — Seguridad, Pruebas y Auditoría**: Suite integral automatizada de pruebas de estrés, aislamiento y concurrencia.

---

## 4. Guía de Despliegue en Producción

### Requisitos Previos:
- Node.js v20+ o v22+ LTS
- PostgreSQL 14+ (Recomendado Neon, Supabase o AWS RDS)
- Dominio con certificado SSL (HTTPS)

### Variables de Entorno (`.env` Backend):
```env
PORT=4001
NODE_ENV=production
DATABASE_URL=postgresql://usuario:password@host-postgres:5432/nombre_db?sslmode=require
JWT_SECRET=super_clave_secreta_jwt_de_alta_entropia_2026
FRONTEND_URL=https://tu-pms-hotelero.com
```

### Comandos de Puesta en Marcha:
```bash
# 1. En backend
cd backend
npm install --omit=dev
node seed.js # Inicializa tablas y configuraciones de sedes
npm start

# 2. En frontend
cd ../frontend
npm install
npm run build
# Servir la carpeta frontend/dist con Nginx o subirla a Vercel/Netlify
```

---

## 5. Estrategia de Respaldo y Recuperación (Backups)

### A. Para SQLite (Desarrollo y Servidores On-Premise / Offline):
- Respaldo en caliente usando el comando `.backup` o script programado de copia de seguridad:
  ```bash
  sqlite3 backend/sistema_familiar.db ".backup 'backups/backup_$(date +%Y%m%d_%H%M%S).db'"
  ```

### B. Para PostgreSQL en la Nube:
- `pg_dump` automatizado diario:
  ```bash
  pg_dump "$DATABASE_URL" -F c -b -v -f "backups/pms_backup_$(date +%Y%m%d).dump"
  ```
- Restauración rápida:
  ```bash
  pg_restore -d "$DATABASE_URL" -v "backups/pms_backup_archivo.dump"
  ```

---

## 6. Verificación de Seguridad y Suite Automatizada
Para auditar la plataforma en cualquier momento, ejecute:
```bash
node backend/verify_bloque15.js
```
El test valida automáticamente:
1. Confinamiento de los 9 roles RBAC.
2. Aislamiento absoluto entre hoteles (Zero Data Leakage).
3. Regla matemática de partida doble $\sum D = \sum C$.
4. Rechazo transaccional de overbooking ante peticiones concurrentes simultáneas.

