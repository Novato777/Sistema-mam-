const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { getTodayString } = require('../utils/date');
const { secretKey } = require('../middleware/auth');
const {
  PERMISSIONS_CATALOG,
  ROLES_DEFINITION,
  resolveEffectivePermissions
} = require('../config/permissions');

const getAccessibleHotelsForUser = async (user) => {
  return await db.query(
    `SELECT h.*, uh.role as user_role
     FROM hotels h
     JOIN user_hotels uh ON uh.hotel_id = h.id
     WHERE uh.user_id = ? AND uh.active = 1 AND h.active = 1
     ORDER BY h.id ASC`,
    [user.id]
  );
};

exports.login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Nombre de usuario y contraseña son requeridos.' });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username.trim()]);

    if (!user) {
      return res.status(400).json({ error: 'Nombre de usuario o contraseña incorrectos.' });
    }

    if (Number(user.active) === 0) {
      return res.status(403).json({
        error: 'Esta cuenta de usuario se encuentra desactivada. Contacta al administrador.'
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      await db.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, details, ip_address, date)
         VALUES (?, ?, 'LOGIN_FALLIDO', 'AUTH', ?, ?, ?)`,
        [
          user.default_hotel_id || 1,
          user.id,
          `Intento fallido de inicio de sesión para ${user.username}`,
          req.ip || 'local',
          getTodayString()
        ]
      );
      return res.status(400).json({ error: 'Nombre de usuario o contraseña incorrectos.' });
    }

    const hotels = await getAccessibleHotelsForUser(user);
    if (hotels.length === 0) {
      return res.status(403).json({
        error: 'Tu usuario no tiene ningún establecimiento hotelero asignado actualmente.'
      });
    }

    const defaultHotelId =
      hotels.find((h) => h.id === user.default_hotel_id)?.id || hotels[0].id;

    const sessionToken = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role || 'PROPIETARIO',
        default_hotel_id: defaultHotelId,
        jti: sessionToken
      },
      secretKey,
      { expiresIn: '7d' }
    );

    await db.run(
      `INSERT INTO user_sessions (user_id, hotel_id, session_token, ip_address, user_agent, created_at, last_active_at, revoked)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        user.id,
        defaultHotelId,
        sessionToken,
        req.ip || '127.0.0.1',
        req.headers['user-agent'] || 'Navegador Web',
        nowIso,
        nowIso
      ]
    );

    await db.run('UPDATE users SET last_login_at = ? WHERE id = ?', [nowIso, user.id]);

    await db.run(
      `INSERT INTO audit_logs (hotel_id, user_id, action, module, details, ip_address, date)
       VALUES (?, ?, 'LOGIN', 'AUTH', ?, ?, ?)`,
      [
        defaultHotelId,
        user.id,
        `Inicio de sesión exitoso (${user.username} - Rol: ${user.role})`,
        req.ip || '127.0.0.1',
        getTodayString()
      ]
    );

    const permissions = resolveEffectivePermissions(user.role, user.custom_permissions);

    res.json({
      access_token: token,
      token_type: 'bearer',
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name || user.username,
        document: user.document || '',
        position: user.position || '',
        email: user.email || '',
        phone: user.phone || '',
        role: user.role || 'PROPIETARIO',
        default_hotel_id: defaultHotelId,
        permissions
      },
      hotels
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

exports.logout = async (req, res) => {
  try {
    if (req.sessionToken) {
      await db.run(
        'UPDATE user_sessions SET revoked = 1, revoked_at = ? WHERE session_token = ?',
        [new Date().toISOString(), req.sessionToken]
      );
    }
    if (req.user) {
      await db.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, details, ip_address, date)
         VALUES (?, ?, 'LOGOUT', 'AUTH', ?, ?, ?)`,
        [
          req.user.default_hotel_id || 1,
          req.user.id,
          `Cierre de sesión (${req.user.username})`,
          req.ip || '127.0.0.1',
          getTodayString()
        ]
      );
    }
    res.json({ message: 'Sesión cerrada correctamente.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al cerrar sesión.' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await db.get(
      `SELECT id, username, full_name, document, position, email, phone,
              role, custom_permissions, active, default_hotel_id, last_login_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    const hotels = await getAccessibleHotelsForUser(user);
    const permissions = resolveEffectivePermissions(user.role, user.custom_permissions);

    res.json({
      ...user,
      permissions,
      hotels,
      rolesCatalog: ROLES_DEFINITION,
      permissionsCatalog: PERMISSIONS_CATALOG
    });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};
