require('dotenv').config({ quiet: true });
process.env.TZ = 'America/Bogota';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const initDatabase = require('./db/init');

const app = express();
const PORT = process.env.PORT || 4001;

// Detrás del proxy del hosting (Render, Railway, Nginx) req.ip sería la IP del
// proxy y TODOS los usuarios compartirían el mismo cupo del limitador.
// TRUST_PROXY: número de proxies (por defecto 1 en producción, 0 en local).
const trustProxy = process.env.TRUST_PROXY ?? ((process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) ? '1' : '0');
app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

// 1. Cabeceras de seguridad seguras con Helmet
app.use(helmet());

// 2. CORS restringido y seguro
// FRONTEND_URL admite varias URLs separadas por comas (ej. dominio propio y el de Vercel).
// Si no se define, se permite *.vercel.app para no dejar el sistema caído, con aviso.
const frontendUrls = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((u) => u.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const allowedOrigins = ['http://localhost:5174', 'http://localhost:5173', ...frontendUrls];
const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS === '1' || frontendUrls.length === 0;
if (frontendUrls.length === 0) {
  console.warn('⚠ SEGURIDAD: FRONTEND_URL no está configurado; se acepta cualquier origen *.vercel.app. Define FRONTEND_URL en producción.');
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.includes(origin) || (allowVercelPreviews && origin.endsWith('.vercel.app'));
    // Origen no permitido: se responde sin cabeceras CORS y el navegador bloquea
    // la petición (sin lanzar error 500 ni llenar el log).
    callback(null, isAllowed);
  },
  credentials: true
}));

// 3. Limitadores de tasa (Rate Limiting)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  keyGenerator: (req) => req.ip || '127.0.0.1',
  validate: false,
  message: { error: 'Demasiadas solicitudes desde esta IP, por favor intenta más tarde.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  keyGenerator: (req) => req.ip || '127.0.0.1',
  validate: false,
  // Solo cuentan los intentos fallidos: varios empleados detrás de la misma IP
  // del hotel pueden iniciar sesión sin agotar el cupo.
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos de inicio de sesión. Por seguridad, espera 15 minutos.' }
});

app.use(express.json({ limit: process.env.JSON_LIMIT || '1mb' }));

// Montar rutas Multi-Tenant y RBAC
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/userRoutes');
const hotelConfigRoutes = require('./routes/hotelConfigRoutes');
const hotelRoutes = require('./routes/hotelRoutes');
const saasMasterRoutes = require('./routes/saasMasterRoutes');

// El límite estricto aplica SOLO a los intentos de inicio de sesión. Antes cubría
// todo /api/auth, incluido GET /me (que el frontend llama al cargar), y un hotel
// con varios empleados en la misma IP recibía 429 y el menú quedaba vacío.
app.post('/api/auth/login', authLimiter);
app.post('/api/saas-master/login', authLimiter);
app.use('/api/auth', generalLimiter, authRoutes);
app.use('/api/users', generalLimiter, userRoutes);
app.use('/api/saas-master', generalLimiter, saasMasterRoutes);

// Rutas Multi-Tenant dinámicas (/api/hotels y /api/hotels/:hotelId/...)
app.use('/api/hotels', generalLimiter, hotelConfigRoutes);
app.use('/api/hotels/:hotelId', generalLimiter, hotelRoutes);

// Alias de compatibilidad para rutas directas /api/hotel-1 y /api/hotel-2
app.use('/api/hotel-1', generalLimiter, hotelRoutes);
app.use('/api/hotel-2', generalLimiter, hotelRoutes);

app.get('/', (req, res) => {
  res.json({
    message: 'API del Sistema PMS de Gestión Hotelera Multi-Tenant activa',
    version: '2.0.0-bloque2'
  });
});

// Inicializar la base de datos
// withBootLock: si varias instancias arrancan a la vez (PostgreSQL), solo una
// crea/migra el esquema; las demás esperan y luego encuentran todo listo.
const db = require('./config/db');
const { loadSecrets } = require('./config/secrets');
app.ready = db.withBootLock(async () => {
  await initDatabase();
  await loadSecrets();
}).then(() => {
  if (require.main === module) {
    app.listen(PORT, () => {
      console.log(`Servidor PMS escuchando en http://localhost:${PORT}`);
    });
  }
}).catch(err => {
  console.error('Error al iniciar el servidor:', err);
});

module.exports = app;
