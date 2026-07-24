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
    // Permitir peticiones sin origen (ej: herramientas de desarrollo, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Validar si el origen está permitido o pertenece a Vercel (.vercel.app)
    const isAllowed = allowedOrigins.includes(origin) || origin.endsWith('.vercel.app');
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Petición bloqueada por políticas CORS'));
    }
  },
  credentials: true
}));

// 3. Limitadores de tasa (Rate Limiting) para evitar DDoS y Fuerza Bruta
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300, // Límite de 300 peticiones por IP
  message: { error: 'Demasiadas solicitudes desde esta IP, por favor intenta más tarde.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, // Máximo 20 intentos de login
  message: { error: 'Demasiados intentos de inicio de sesión. Por seguridad, espera 15 minutos.' }
});

app.use(express.json());

// Inicializar la base de datos
initDatabase().then(() => {
  // Rutas
  const authRoutes = require('./routes/auth');
  const hotel1Routes = require('./routes/hotel1');
  const hotel2Routes = require('./routes/hotel2');
  const restRoutes = require('./routes/restaurante');
  const lichiRoutes = require('./routes/lichigueria');
  const reportsRoutes = require('./routes/reports');
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/hotel-1', generalLimiter, hotel1Routes);
  app.use('/api/hotel-2', generalLimiter, hotel2Routes);
  app.use('/api/restaurante', generalLimiter, restRoutes);
  app.use('/api/lichigueria', generalLimiter, lichiRoutes);
  app.use('/api/reports', generalLimiter, reportsRoutes);

  app.get('/', (req, res) => {
    res.json({ message: 'API del Sistema Administrativo Familiar activa' });
  });

  // Levantar el servidor
  app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Error al iniciar el servidor:', err);
});

module.exports = app;
