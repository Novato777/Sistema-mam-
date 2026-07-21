# Sistema Administrativo Familiar (Mamá)

Este es un sistema web administrativo diseñado para gestionar múltiples negocios familiares de forma centralizada. Permite controlar transacciones financieras, habitaciones de hotel, ventas de restaurante, inventario de legumbres (lichiguería) y generar reportes en PDF de caja diario.

---

## 🚀 Arquitectura y Tecnologías

### Frontend (`/frontend`)
* **Framework**: React 19 + TypeScript + Vite.
* **Estilos**: Tailwind CSS 4 con una paleta de colores pastel suave y dinámica por módulo comercial.
* **Componentes**: React Router Dom para navegación fluida, Lucide-React para íconos.
* **PDFs**: Generación de reportes limpios y estéticos en el lado del cliente usando `jsPDF` y `jspdf-autotable`.

### Backend (`/backend`)
* **Servidor**: Node.js + Express.js.
* **Base de datos (Soporte Dual)**:
  * **Local**: SQLite 3 (`sistema_familiar.db`).
  * **Producción**: PostgreSQL (ej. Neon PostgreSQL) mediante la detección automática de la variable de entorno `DATABASE_URL`.
* **Seguridad**: Autenticación mediante JSON Web Tokens (JWT) y cifrado de claves con `bcryptjs`.

---

## 🛠️ Instalación y Uso Local

### 1. Prerrequisitos
Asegúrate de tener instalado [Node.js](https://nodejs.org/) (versión 18 o superior).

### 2. Configurar e Iniciar Backend
Abre una terminal en la carpeta `/backend` y ejecuta:
```bash
# Instalar dependencias
npm install

# Inicializar tablas y crear usuario administrador inicial
node seed.js

# Iniciar servidor local
npm run dev # ó node src/app.js
```
El servidor backend escuchará en `http://localhost:4000`.

* **Credenciales por defecto**:
  * **Usuario**: `admin`
  * **Contraseña**: `adminpassword123`

### 3. Configurar e Iniciar Frontend
Abre otra terminal en la carpeta `/frontend` y ejecuta:
```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo de Vite
npm run dev
```
La aplicación React se abrirá por defecto en `http://localhost:5173`.

---

## 🌐 Variables de Entorno en Producción

### Servidor Backend
* `DATABASE_URL`: URL de conexión de base de datos PostgreSQL (ej. de Neon).
* `JWT_SECRET`: Llave secreta para firmar los tokens de sesión.
* `PORT`: Puerto de escucha del servidor (por defecto `4000`).

### Cliente Frontend
* `VITE_API_URL`: URL del backend en producción (ej. `https://mi-api.onrender.com`).
