const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { resolveEffectivePermissions } = require('../config/permissions');

const secretKey = process.env.JWT_SECRET || 'supersecretkeyforfamilyadminapp1234567890';

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
    const verified = jwt.verify(token, secretKey);

    // Si el token incluye identificador de sesión (jti), validar que no haya sido revocada
    if (verified.jti) {
      const session = await db.get(
        'SELECT id, revoked FROM user_sessions WHERE session_token = ?',
        [verified.jti]
      );
      if (session && Number(session.revoked) === 1) {
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
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
};

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario no autenticado.' });
    }
    const effectiveRole = req.hotelRole || req.user.role;
    if (
      req.user.role === 'PROPIETARIO' ||
      req.user.role === 'ADMIN' ||
      allowedRoles.includes(effectiveRole) ||
      allowedRoles.includes(req.user.role)
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
    if (req.user.role === 'PROPIETARIO' || req.user.role === 'ADMIN') {
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
requireAuth.secretKey = secretKey;
module.exports = requireAuth;
