# HOVENTRA

> **Todo tu hotel. Una sola plataforma.**

HOVENTRA es un sistema web de gestión hotelera (PMS) **multi-hotel** pensado para hoteles pequeños y medianos. En una misma plataforma se manejan las habitaciones, las reservas, la recepción de huéspedes, la caja, los servicios (restaurante, lavandería, minibar), el inventario, el personal y los reportes en PDF.

Está diseñado para que lo use cualquier persona del hotel sin capacitación técnica: pantallas simples, botones grandes, lenguaje claro y funcionamiento completo en celular, tablet y computador, con modo claro y oscuro.

---

## Tabla de contenido

1. [Qué hace el sistema](#1-qué-hace-el-sistema)
2. [Módulos](#2-módulos)
3. [Roles y permisos](#3-roles-y-permisos)
4. [Reportes en PDF](#4-reportes-en-pdf)
5. [Arquitectura y tecnologías](#5-arquitectura-y-tecnologías)
6. [Estructura del proyecto](#6-estructura-del-proyecto)
7. [Instalación y uso local](#7-instalación-y-uso-local)
8. [Variables de entorno](#8-variables-de-entorno)
9. [Base de datos](#9-base-de-datos)
10. [API del backend](#10-api-del-backend)
11. [Seguridad](#11-seguridad)
12. [Panel Master (SaaS)](#12-panel-master-saas)
13. [Despliegue a producción](#13-despliegue-a-producción)
14. [Scripts útiles](#14-scripts-útiles)
15. [Solución de problemas](#15-solución-de-problemas)
16. [Estado del proyecto](#16-estado-del-proyecto)

---

## 1. Qué hace el sistema

| Necesidad del hotel | Cómo la resuelve HOVENTRA |
|---|---|
| Saber qué habitaciones están libres, ocupadas, sucias o en mantenimiento | Tablero de habitaciones en tiempo real en **Recepción** |
| Registrar la llegada y la salida de huéspedes | Check-in con acompañantes y check-out con control de saldo |
| Llevar la cuenta de cada huésped | Folio por estancia: cargos, pagos y saldo pendiente |
| Controlar el dinero del día | **Caja** por turnos: entradas, salidas, arqueos y cierres |
| Vender comida, bebidas, lavandería, etc. | **Servicios**: venta directa o cargo a la habitación |
| Saber qué hay en bodega y qué comprar | **Inventario**: existencias, compras, consumos y lista sugerida |
| Organizar al equipo | **Personal**: usuarios, roles, horarios y asistencia |
| Ver cómo va el negocio | **Reportes** listos para descargar en PDF con la marca del hotel |
| Manejar varios hoteles | Cada usuario ve solo los hoteles a los que tiene acceso |

---

## 2. Módulos

El menú lateral muestra solo los módulos para los que el usuario tiene permiso.

### 🛏️ Recepción (`/recepcion`)
- Tablero de habitaciones por estado: **Libre, Ocupada, Por limpiar, Limpiando ya, Mantenimiento**.
- **Registrar llegada (check-in):** datos del huésped (cédula, pasaporte, PPT, NIT; colombianos y extranjeros), acompañantes y tarifa.
- **Folio de la estancia:** cargos (alojamiento, servicios) y pagos parciales.
- **Salida (check-out):** solo se permite si el saldo está en cero. Al salir, la habitación pasa a *Por limpiar*.
- Lista de **huéspedes alojados** y directorio de huéspedes.
- Reservas: creación, anticipos, cancelaciones y llegada desde la reserva.
- Limpieza y mantenimiento integrados: la habitación limpia vuelve a *Libre* y la que está en mantenimiento queda bloqueada hasta liberarla.

### 💰 Caja (`/caja`)
- **Caja de hoy:** apertura de turno, ingresos y egresos con categorías rápidas (insumos/aseo, lavandería, bebidas, domicilios, adelantos de personal, devoluciones, etc.).
- Formas de pago: efectivo, tarjeta, Nequi / transferencia.
- **Arqueo y cierre de turno** con cálculo de diferencias.
- Anulación de movimientos con registro en auditoría.
- **Historial** filtrable por Hoy, 7 días, Este mes o rango de fechas.

### 🍽️ Servicios (`/restaurante`)
- **Vender:** comida y bebida, lavandería u otro servicio, con menú de acceso rápido (almuerzo, desayuno, sopa, caldo).
- Cobro inmediato o **cargo a la habitación** del huésped (queda en su folio).
- Estados: *Pagado, Sin cobrar, Anulado*.
- **Mis productos:** catálogo de servicios con precios. Cuando un producto lleva insumos, descuenta inventario automáticamente.

### 📦 Inventario (`/inventario`)
- **Mis productos** con unidades (unidades, kilos, litros, cajas, paquetes) y semáforo de existencias: *Hay suficiente, Queda poco, Se acabó*.
- **Compras** a proveedores, que suben el stock.
- Salidas: *Se usó* o *Se dañó o perdió*, con historial completo (kardex).
- Lista de compras sugerida según el stock mínimo.

### 👥 Personal (`/personal`)
- **Mi equipo:** crear, editar, activar o desactivar usuarios y asignarles un rol y hotel(es).
- **Horarios:** turnos de mañana o noche por día y registro de asistencia (incluye *No vino*).
- Sesiones activas e historial de actividad de cada empleado.

### 📊 Reportes (`/reportes`)
Módulo "a prueba de errores" en tres pasos: **1. elegir categoría → 2. elegir reporte → 3. elegir fechas**. Tiene accesos rápidos de un toque y dos botones: *Descargar PDF* o *Solo verlo en pantalla*. Ver la [lista completa](#4-reportes-en-pdf).

### ⚙️ Configuración (`/configuracion`)
- **Mi hotel:** nombre, razón social, NIT, dirección, ciudad, teléfono, correo y logo.
- **Habitaciones:** tipos de habitación, tarifas y habitaciones.
- **Cobros:** impuestos (incluidos en el precio o sumados aparte) y formas de pago.
- **Pantalla:** modo claro u oscuro.

### Módulos adicionales
Siguen disponibles por ruta directa y desde otras pantallas: **Dashboard** (`/dashboard`), **Reservas** (`/reservas`), **Limpieza** (`/limpieza`), **Mantenimiento** (`/mantenimiento`), **Contabilidad** (`/contabilidad`: PUC, asientos de partida doble, cuentas por cobrar y por pagar, conciliación bancaria), **Notificaciones** (`/notificaciones`: plantillas y envío por WhatsApp o correo) y **Usuarios** (`/usuarios`).

---

## 3. Roles y permisos

El control de acceso combina **roles** y **permisos**. El catálogo completo está en [backend/src/config/permissions.js](backend/src/config/permissions.js). Cada usuario puede tener además **permisos personalizados** que se suman a los de su rol.

| Rol | Para quién | Acceso |
|---|---|---|
| **PROPIETARIO** (Dueño) | Dueño del hotel | Todo, en todos sus hoteles |
| **ADMINISTRADOR** | Gerente o administrador | Todo, solo en los hoteles asignados |
| **RECEPCIONISTA** | Recepción | Reservas, check-in/out, caja, limpieza, servicios, notificaciones |
| **CAJERO** | Caja | Caja (incluye cierres), servicios, reportes |
| **LIMPIEZA** | Aseo | Tablero de limpieza y reporte de daños |
| **RESTAURANTE** | Cocina / Servicios | Ventas de servicios y consulta de inventario |
| **MANTENIMIENTO** | Técnico | Órdenes de mantenimiento y bloqueo de habitaciones |
| **CONTABILIDAD** | Contador | Contabilidad, reportes, caja e inventario en consulta, auditoría |
| **AUDITOR** | Revisor externo | Solo lectura de casi todo, incluida la bitácora |

**Reglas importantes:**
- Un usuario solo entra a un hotel si tiene un vínculo activo con él (tabla `user_hotels`). Su rol dentro de ese hotel define lo que puede hacer allí.
- Un administrador solo ve y gestiona usuarios de sus propios hoteles y no puede crear ni editar cuentas de dueño.
- Las sesiones se pueden revocar. Un usuario desactivado pierde el acceso en su siguiente petición.

---

## 4. Reportes en PDF

Todos los PDF llevan el logo y los datos del hotel, el periodo consultado, tarjetas de resumen y tablas detalladas. Se generan en el navegador con `jsPDF` (ver [frontend/src/utils/pdfReport.ts](frontend/src/utils/pdfReport.ts)).

| Categoría | Reportes |
|---|---|
| **Resumen general** | Resumen del negocio (ocupación, ingresos, flujo de caja, utilidad, ADR, RevPAR, compras, valor del inventario) |
| **Caja y dinero** | Movimientos de caja · Gastos y salidas · Cierres de turno y conteos |
| **Hotel y huéspedes** | Ocupación del hotel · Ingresos por habitación · Huéspedes alojados · Cuentas por cobrar · Libro de registro de huéspedes · Directorio de huéspedes · Reservas |
| **Servicios** | Ventas de servicios · Productos más vendidos |
| **Inventario** | Existencias y valor del inventario · Lista de compras sugerida · Compras a proveedores · Entradas y salidas de inventario |
| **Personal y operación** | Personal y desempeño · Limpieza de habitaciones · Mantenimiento y daños |

**Accesos rápidos (un toque):** resumen del mes, caja de hoy, huéspedes alojados, cuentas por cobrar, existencias y lista de compras sugerida.

---

## 5. Arquitectura y tecnologías

```
┌──────────────────────────┐   HTTPS + JWT    ┌───────────────────────────┐        ┌──────────────────────┐
│  Frontend (Vercel)       │ ───────────────▶ │  Backend API (Node)       │ ─────▶ │ PostgreSQL (Neon)    │
│  React 19 + Vite + TS    │   X-Hotel-Id     │  Express 5                │        │  o SQLite en local   │
└──────────────────────────┘                  └───────────────────────────┘        └──────────────────────┘
```

### Frontend ([frontend/](frontend/))
| Tecnología | Uso |
|---|---|
| React 19 + TypeScript 6 | Interfaz |
| Vite 8 | Servidor de desarrollo y build |
| Tailwind CSS 4 | Estilos, modo claro/oscuro, diseño responsive |
| React Router 7 | Navegación |
| lucide-react / react-icons | Íconos |
| jsPDF + jspdf-autotable | Reportes PDF generados en el navegador |

Piezas clave:
- [src/components/ModuleUI.tsx](frontend/src/components/ModuleUI.tsx): kit de componentes compartidos (tarjetas, tablas, botones, formularios).
- [src/components/Layout.tsx](frontend/src/components/Layout.tsx): menú lateral por permisos y selector de hotel.
- [src/context/HotelContext.tsx](frontend/src/context/HotelContext.tsx): hotel activo y permisos del usuario.
- [src/context/ThemeContext.tsx](frontend/src/context/ThemeContext.tsx): modo claro/oscuro.
- [src/config/api.ts](frontend/src/config/api.ts): URL del backend.

### Backend ([backend/](backend/))
| Tecnología | Uso |
|---|---|
| Node.js 18+ y Express 5 | API REST |
| PostgreSQL (`pg`) / SQLite (`sqlite3`) | Base de datos dual, seleccionada automáticamente |
| jsonwebtoken | Sesiones JWT con revocación |
| bcryptjs | Hash de contraseñas |
| helmet | Cabeceras de seguridad |
| express-rate-limit | Límite de peticiones y protección contra fuerza bruta |
| cors | Orígenes permitidos |

**Multi-hotel (multi-tenant):** las rutas de cada hotel viven en `/api/hotels/:hotelId/...` y el middleware [tenant.js](backend/src/middleware/tenant.js) verifica que el usuario pertenezca a ese hotel. Todas las consultas filtran por `hotel_id`.

**Zona horaria:** el servidor fija `TZ=America/Bogota`.

---

## 6. Estructura del proyecto

```
Sistema-mam-/
├── package.json                 # Scripts raíz (levantar front + back juntos)
├── public/                      # Logos e imágenes de marca
├── backend/
│   ├── package.json
│   ├── seed.js                  # Inicializa la base y muestra los hoteles
│   ├── scripts/
│   │   └── resetNeonDb.js       # Reinicia la base y crea un nuevo propietario
│   └── src/
│       ├── app.js               # Servidor Express, CORS, rate limit, rutas
│       ├── config/
│       │   ├── db.js            # Capa de datos dual (PostgreSQL / SQLite), transacciones
│       │   ├── permissions.js   # Catálogo de permisos y roles
│       │   └── secrets.js       # Clave JWT (variable de entorno o generada y guardada)
│       ├── db/
│       │   ├── init.js          # Creación del esquema (48 tablas)
│       │   ├── migrations.js    # Migraciones y restricciones de integridad
│       │   └── migrateLegacy.js # Hotel y usuario propietario iniciales
│       ├── middleware/
│       │   ├── auth.js          # requireAuth, requireRole, requirePermission
│       │   └── tenant.js        # Acceso por hotel (requireHotelAccess)
│       ├── routes/              # auth, users, hotelConfig, hotel, saasMaster
│       ├── controllers/         # Lógica de cada módulo (15 controladores)
│       ├── services/            # dianAdapter (facturación), notificationService
│       └── utils/               # Fechas, membresía de hotel, limpieza de datos sensibles
└── frontend/
    ├── vercel.json              # Rewrites para la SPA
    └── src/
        ├── App.tsx              # Rutas
        ├── pages/               # Una página por módulo
        ├── components/          # Layout y kit de UI
        ├── context/             # Hotel activo y tema
        ├── config/api.ts        # URL de la API
        └── utils/               # Fechas y generador de PDF
```

Documentación adicional en la raíz: [DOCUMENTACION_TECNICA_FINAL.md](DOCUMENTACION_TECNICA_FINAL.md), [HOTEL_DEVELOPMENT_ROADMAP.md](HOTEL_DEVELOPMENT_ROADMAP.md) y [AUDITORIA_Y_PLAN_DE_TRANSFORMACION_HOTELERA.md](AUDITORIA_Y_PLAN_DE_TRANSFORMACION_HOTELERA.md).

---

## 7. Instalación y uso local

### Requisitos
- [Node.js](https://nodejs.org/) 18 o superior.
- No hace falta instalar ninguna base de datos: en local se usa SQLite automáticamente.

### Paso 1. Instalar dependencias
```bash
cd backend && npm install
cd ../frontend && npm install
```

### Paso 2. Levantar el sistema

**Opción A: todo junto, desde la raíz**
```bash
npm run dev
```

**Opción B: por separado, en dos terminales**
```bash
# Terminal 1
cd backend
npm run dev        # http://localhost:4001

# Terminal 2
cd frontend
npm run dev        # http://localhost:5173
```

La primera vez que arranca, el backend crea la base `backend/sistema_familiar.db`, todas las tablas, un hotel inicial y el usuario propietario.

### Paso 3. Entrar
Abre `http://localhost:5173/login`.

| Entorno | Usuario | Contraseña |
|---|---|---|
| Local (sin `DATABASE_URL`) | `admin` | `adminpassword123` |
| Producción | `ADMIN_USERNAME` | `ADMIN_PASSWORD`. Si no la defines, se genera una aleatoria y se muestra **una sola vez** en el log del servidor |

> ⚠️ Cambia la contraseña del propietario después del primer ingreso.

---

## 8. Variables de entorno

Crea `backend/.env` (está en `.gitignore`, **nunca lo subas al repositorio**). Hay una plantilla en `backend/.env.example`.

### Backend
| Variable | Obligatoria en producción | Descripción |
|---|---|---|
| `DATABASE_URL` | ✅ | Conexión PostgreSQL (Neon). Si existe, el sistema usa PostgreSQL y se considera producción |
| `JWT_SECRET` | ✅ | Clave para firmar las sesiones (mínimo 32 caracteres). Sin ella se genera una y se guarda en la base |
| `FRONTEND_URL` | ✅ | URL(s) exacta(s) del frontend para CORS, separadas por comas. Si se define, **solo** esas URLs pueden usar la API. Si falta, se acepta cualquier `*.vercel.app` (con advertencia) |
| `ALLOW_VERCEL_PREVIEWS` | — | `1` para aceptar además los previews `*.vercel.app` aunque exista `FRONTEND_URL` |
| `TRUST_PROXY` | — | Número de proxies delante del backend (por defecto `1` en producción). Necesario para que el límite de intentos se cuente por usuario y no para todos a la vez |
| `ADMIN_USERNAME` | — | Usuario propietario inicial (por defecto `admin`) |
| `ADMIN_PASSWORD` | Recomendada | Contraseña del propietario inicial |
| `ADMIN_FULL_NAME` | — | Nombre del propietario inicial |
| `DEFAULT_HOTEL_NAME` | — | Nombre del primer hotel (por defecto `Hotel Principal`) |
| `PORT` | — | Puerto del servidor (por defecto `4001`) |
| `NODE_ENV` | — | `production` activa el modo producción aunque se use SQLite |
| `PGSSLMODE`, `PGSSL_STRICT` | — | Ajustes de SSL de PostgreSQL (`PGSSL_STRICT=1` valida el certificado) |
| `DB_POOL_MAX`, `DB_POOL_IDLE_MS`, `DB_CONNECT_TIMEOUT_MS`, `DB_QUERY_TIMEOUT_MS` | — | Ajustes del pool de PostgreSQL |
| `SQLITE_PATH`, `SQLITE_BUSY_TIMEOUT_MS` | — | Ruta y tiempo de espera de SQLite en local |

Ejemplo de `backend/.env` para producción:
```env
DATABASE_URL=postgresql://USUARIO:CLAVE@HOST.neon.tech/neondb?sslmode=require
JWT_SECRET=una-clave-larga-y-aleatoria-de-al-menos-32-caracteres
FRONTEND_URL=https://tu-frontend.vercel.app
ADMIN_USERNAME=dueno
ADMIN_PASSWORD=UnaClaveSegura123
DEFAULT_HOTEL_NAME=Mi Hotel
```

### Frontend
| Variable | Descripción |
|---|---|
| `VITE_API_URL` | URL del backend (por defecto `http://localhost:4001`) |

---

## 9. Base de datos

### Motor dual
- **Sin `DATABASE_URL`:** SQLite en `backend/sistema_familiar.db` (modo WAL).
- **Con `DATABASE_URL`:** PostgreSQL con pool de conexiones y SSL.

La capa [config/db.js](backend/src/config/db.js) expone la misma interfaz (`get`, `query`, `run`, transacciones) para ambos motores. Al arrancar, un bloqueo (`withBootLock`) garantiza que si hay varias instancias, solo una cree o migre el esquema.

### Esquema (48 tablas de negocio + 2 internas)
| Área | Tablas |
|---|---|
| Usuarios y acceso | `users`, `user_hotels`, `user_sessions`, `audit_logs` |
| Hotel y configuración | `hotels`, `hotel_taxes`, `hotel_payment_methods`, `hotel_departments` |
| Habitaciones | `room_types`, `rooms`, `room_history` |
| Huéspedes y reservas | `guests`, `reservations`, `reservation_rooms` |
| Estancias y folios | `stays`, `stay_companions`, `guest_accounts`, `account_charges`, `payments` |
| Operación | `housekeeping_tasks`, `maintenance_tickets` |
| Caja | `cash_registers`, `cash_movements`, `cash_audits` |
| Inventario y compras | `inventory_products`, `inventory_movements`, `suppliers`, `purchase_orders`, `purchase_order_items` |
| Servicios / POS | `service_catalog`, `service_recipes`, `restaurant_tables`, `service_orders`, `service_order_items` |
| Contabilidad | `accounting_accounts`, `accounting_rules`, `accounting_periods`, `journal_entries`, `journal_entry_lines`, `accounts_receivable_payable`, `ar_ap_payments`, `bank_reconciliations`, `electronic_invoices` |
| Personal | `employee_profiles`, `staff_shifts` |
| Notificaciones | `notification_center`, `message_templates`, `message_outbox` |
| Internas | `schema_migrations` (control de migraciones), `app_settings` (clave JWT generada) |

### Integridad
[db/migrations.js](backend/src/db/migrations.js) agrega restricciones automáticamente:
- Los movimientos de caja solo pueden ser `INGRESO` o `EGRESO`, con monto ≥ 0.
- `hotel_id` es obligatorio en los registros de cada hotel.

Las operaciones de varios pasos (check-in, check-out, pagos, compras) se ejecutan en **transacciones**: o se guarda todo o no se guarda nada.

> ⚠️ Las migraciones se ejecutan solas en el primer arranque de cada versión. **Haz una copia de seguridad de la base de producción antes de desplegar una versión nueva.**

---

## 10. API del backend

Base: `http://localhost:4001` en local o la URL de tu servidor. Todas las rutas protegidas requieren la cabecera `Authorization: Bearer <token>`.

| Prefijo | Contenido |
|---|---|
| `POST /api/auth/login` | Inicio de sesión. Devuelve el token, el usuario y sus hoteles |
| `GET /api/auth/me` | Usuario actual y permisos |
| `/api/users` | Usuarios, sesiones y bitácora de auditoría (limitados a los hoteles del solicitante) |
| `/api/hotels` | Listar y crear hoteles, configuración general |
| `/api/hotels/:hotelId/...` | Todo lo operativo del hotel: habitaciones, reservas, recepción, folios, caja, limpieza, mantenimiento, servicios, inventario, contabilidad, personal, notificaciones y reportes |
| `/api/hotel-1`, `/api/hotel-2` | Alias de compatibilidad para los dos primeros hoteles |
| `/api/saas-master` | Panel Master (login propio) |

El backend expone unas 170 rutas. Las definiciones están en [backend/src/routes/](backend/src/routes/).

### Reglas de negocio validadas en el servidor
- La fecha de salida de una reserva no puede ser anterior a la de llegada.
- No se aceptan anticipos sobre reservas canceladas, no-show, en curso o finalizadas, ni anticipos mayores al saldo de la reserva.
- Los cargos al folio deben ser mayores que cero y solo se pagan estancias activas.
- No se permite el check-out con saldo pendiente.
- Las existencias de inventario se actualizan con cada compra, consumo o venta con receta.

---

## 11. Seguridad

| Medida | Detalle |
|---|---|
| Contraseñas | Hash con bcrypt |
| Sesiones | JWT con identificador de sesión (`jti`) guardado en la base. Se pueden revocar, y una sesión inexistente invalida el token |
| Clave JWT | `JWT_SECRET` o una clave aleatoria generada y guardada en la base. Nunca un texto fijo en el código |
| Aislamiento entre hoteles | Cada petición verifica la pertenencia del usuario al hotel. Un dueño no puede ver datos de otro hotel |
| Permisos | Verificados en el servidor en cada ruta, no solo en el menú |
| Datos sensibles | Los tokens de WhatsApp y la contraseña SMTP nunca se devuelven al navegador. Solo se informa si están configurados |
| Fuerza bruta | 40 intentos **fallidos** de login cada 15 minutos por IP. Los inicios correctos no cuentan, así que varios empleados pueden compartir el internet del hotel |
| Límite general | 600 peticiones cada 15 minutos por IP |
| Cabeceras | Helmet |
| CORS | Solo `localhost:5173/5174`, `FRONTEND_URL` y `*.vercel.app` |
| Auditoría | Las acciones importantes quedan en `audit_logs` |
| Panel Master | Token firmado con alcance propio, comparación de contraseña en tiempo constante y claves por defecto solo en desarrollo |

---

## 12. Panel Master (SaaS)

En `/master` está el panel del administrador de la plataforma, que permite ver y administrar todos los hoteles clientes.

- **Producción:** usuario `admin` y la contraseña fija del proyecto, guardada solo como hash bcrypt en `backend/src/routes/saasMasterRoutes.js`. No requiere variables de entorno. Para cambiarla, genera un hash nuevo y reemplázalo en ese archivo.
- **Desarrollo local:** además de la clave del proyecto se aceptan las claves de prueba.

---

## 13. Despliegue a producción

### Lista de verificación
1. ✅ **Copia de seguridad** de la base de datos en Neon, porque las migraciones corren al arrancar.
2. ✅ Configurar en el servidor del backend: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL` y, en la primera instalación, `ADMIN_PASSWORD`.
3. ✅ Configurar `VITE_API_URL` en Vercel apuntando al backend.
4. ✅ Desplegar **backend y frontend al mismo tiempo**: las versiones deben coincidir.
5. ✅ Prueba rápida en producción: iniciar sesión → crear una reserva → check-in → cobrar → check-out → descargar un reporte.

### Frontend en Vercel
- Directorio raíz: `frontend`
- Comando de build: `npm run build`
- Directorio de salida: `dist`
- [vercel.json](frontend/vercel.json) ya redirige todas las rutas a `index.html`.

### Backend (Render, Railway u otro servicio Node)
- Directorio raíz: `backend`
- Comando de instalación: `npm install`
- Comando de inicio: `node src/app.js`
- El servicio debe exponer el puerto de la variable `PORT`.

---

## 14. Scripts útiles

| Comando | Dónde | Qué hace |
|---|---|---|
| `npm run dev` | raíz | Levanta backend y frontend juntos |
| `npm run dev:backend` / `npm run dev:frontend` | raíz | Levanta cada uno por separado |
| `npm run seed` | raíz | Inicializa la base y lista los hoteles |
| `npm run dev` | `backend/` | Inicia la API |
| `npm run reset-db -- <usuario> <clave> "Nombre del Hotel"` | `backend/` | ⚠️ **Borra toda la base**, la reconstruye y crea un propietario nuevo |
| `npm run dev` | `frontend/` | Servidor de desarrollo Vite |
| `npm run build` | `frontend/` | Verifica tipos y genera el build de producción |
| `npm run preview` | `frontend/` | Sirve el build localmente |

Ejemplo para reiniciar la base de Neon desde PowerShell:
```powershell
cd backend
$env:DATABASE_URL="postgresql://USUARIO:CLAVE@HOST.neon.tech/neondb?sslmode=require"
npm run reset-db -- mi_admin MiClaveSegura123 "Mi Hotel Principal"
```

---

## 15. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| "Petición bloqueada por políticas CORS" | El dominio del frontend no está permitido | Define `FRONTEND_URL` con la URL exacta del frontend |
| El menú lateral aparece vacío | La sesión expiró o el usuario no tiene un hotel asignado | Cierra sesión y vuelve a entrar, o asigna el hotel en **Personal** |
| "Demasiados intentos de inicio de sesión" | Más de 40 contraseñas incorrectas desde esa IP | Espera 15 minutos |
| "Tu sesión fue cerrada o revocada" | Un administrador cerró la sesión o se cambió `JWT_SECRET` | Inicia sesión de nuevo |
| No se puede entrar al Panel Master en producción | Usuario o contraseña mal escritos (distingue mayúsculas) | Usa `admin` y la clave del proyecto |
| No deja hacer check-out | La estancia tiene saldo pendiente | Registra el pago en el folio |
| El frontend no conecta con el backend | `VITE_API_URL` es incorrecta o el backend está apagado | Revisa la variable y vuelve a desplegar el frontend |
| En producción no conozco la contraseña inicial | No se definió `ADMIN_PASSWORD` | Búscala en el log del primer arranque o usa `npm run reset-db` |

---

## 16. Estado del proyecto

**Versión 1.0: lista para lanzamiento.**

Auditoría completa realizada sobre el backend y el frontend:
- Los 50 endpoints de consulta responden correctamente.
- Flujo operativo completo probado sin fallas: caja → reserva → anticipo → check-in → folio → servicios → check-out → limpieza → inventario → mantenimiento → auditoría.
- Pruebas de seguridad superadas: aislamiento entre hoteles, permisos por rol, tokens falsificados rechazados y datos sensibles ocultos.
- El frontend compila sin errores de tipos.

**Pendiente de validar con datos reales:**
- Asientos contables automáticos frente a las cuentas reales del hotel.
- Facturación electrónica DIAN, y envío de WhatsApp y correo con credenciales reales.

**Decisión de negocio abierta:** hoy cualquier propietario puede crear hoteles nuevos (`POST /api/hotels`). Si prefieres que solo se creen desde el Panel Master, hay que restringirlo.

---

© HOVENTRA. Todos los derechos reservados.
