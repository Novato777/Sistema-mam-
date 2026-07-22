const express = require('express');
const cors = require('cors');
const initDatabase = require('./db/init');

const app = express();
const PORT = process.env.PORT || 4001;

// Configuración de middlewares
app.use(cors());
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
  app.use('/api/auth', authRoutes);
  app.use('/api/hotel-1', hotel1Routes);
  app.use('/api/hotel-2', hotel2Routes);
  app.use('/api/restaurante', restRoutes);
  app.use('/api/lichigueria', lichiRoutes);
  app.use('/api/reports', reportsRoutes);

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
