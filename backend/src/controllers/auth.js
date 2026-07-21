const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const secretKey = process.env.JWT_SECRET || 'supersecretkeyforfamilyadminapp1234567890';

exports.login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Nombre de usuario y contraseña son requeridos.' });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);

    if (!user) {
      return res.status(400).json({ error: 'Nombre de usuario o contraseña incorrectos.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Nombre de usuario o contraseña incorrectos.' });
    }

    // Generar token
    const token = jwt.sign({ id: user.id, username: user.username }, secretKey, {
      expiresIn: '7d'
    });

    res.json({ access_token: token, token_type: 'bearer' });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await db.get('SELECT id, username FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};
