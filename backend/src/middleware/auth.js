const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { resolveEffectivePermissions } = require('../config/permissions');

// La clave viene de JWT_SECRET o de una clave aleatoria guardada en la base
// (ver config/secrets.js). Nunca de un texto fijo en el código.
const { getJwtSecret } = require('../config/secrets');

const requireAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Acceso denegado. No se proporcionó token de autenticación.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Formato de token inválido.' });
  }

  try {
    const verified = jwt.verify(token, getJwtSecret());

    // Si el token incluye identificador de sesión (jti), validar que no haya sido revocada
    if (verified.jti) {
      const session = await db.get(
        'SELECT id, revoked FROM user_sessions WHERE session_token = ?',
        [verified.jti]
      );
      // Sesión inexistente (borrada al eliminar un hotel/usuario) = token inválido
      if (!session || Number(session.revoked) === 1) {
        return res.status(401).json({
          error: 'Tu sesión fue cerrada o revocada por un administrador. Inicia sesión nuevamente.'
        });
      }
      if (session) {
        const nowIso = new Date().toISOString();
        await db.run('UPDATE user_sessions SET last_active_at = ? WHERE id = ?', [nowIso, session.id]);
      }
      req.sessionToken = verified.jti;
    }

    const user = await db.get(
      `SELECT id, username, full_name, document, position, email, phone,
              role, custom_permissions, active, default_hotel_id, last_login_at
       FROM users WHERE id = ?`,
      [verified.id]
    );

    if (!user || Number(user.active) === 0) {
      return res.status(401).json({ error: 'Usuario inactivo o deshabilitado por administración.' });
    }

    user.permissions = resolveEffectivePermissions(user.role, user.custom_permissions);
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Tu sesión venció. Inicia sesión nuevamente.' });
  }
};

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario no autenticado.' });
    }
    const effectiveRole = req.hotelRole || req.user.role;
    if (
      effectiveRole === 'PROPIETARIO' ||
      effectiveRole === 'ADMIN' ||
      allowedRoles.includes(effectiveRole)
    ) {
      return next();
    }
    return res.status(403).json({
      error: `Permiso insuficiente. Se requiere uno de los roles: ${allowedRoles.join(', ')}.`
    });
  };
};

const requirePermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario no autenticado.' });
    }
    const effectiveRole = req.hotelRole || req.user.role;
    if (effectiveRole === 'PROPIETARIO' || effectiveRole === 'ADMIN') {
      return next();
    }
    const userPerms = req.user.permissions || [];
    const hasAny = requiredPermissions.some((p) => userPerms.includes(p));
    if (!hasAny) {
      return res.status(403).json({
        error: `Acceso restringido. No cuentas con el permiso requerido (${requiredPermissions.join(' o ')}).`
      });
    }
    return next();
  };
};

requireAuth.requireRole = requireRole;
requireAuth.requirePermission = requirePermission;
requireAuth.getJwtSecret = getJwtSecret;
module.exports = requireAuth;
