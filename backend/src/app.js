process.env.TZ = 'America/Bogota';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const initDatabase = require('./db/init');

const app = express();
const PORT = process.env.PORT || 4001;

// 1. Cabeceras de seguridad seguras con Helmet
app.use(helmet());

// 2. CORS restringido y seguro
const allowedOrigins = [
  'http://localhost:5174',
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.includes(origin) || origin.endsWith('.vercel.app');
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Petición bloqueada por políticas CORS'));
    }
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
  message: { error: 'Demasiados intentos de inicio de sesión. Por seguridad, espera 15 minutos.' }
});

app.use(express.json());

// Montar rutas Multi-Tenant y RBAC
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/userRoutes');
const hotelConfigRoutes = require('./routes/hotelConfigRoutes');
const hotelRoutes = require('./routes/hotelRoutes');
const saasMasterRoutes = require('./routes/saasMasterRoutes');

app.use('/api/auth', authLimiter, authRoutes);
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
app.ready = initDatabase().then(() => {
  if (require.main === module) {
    app.listen(PORT, () => {
      console.log(`Servidor PMS escuchando en http://localhost:${PORT}`);
    });
  }
}).catch(err => {
  console.error('Error al iniciar el servidor:', err);
});

module.exports = app;
