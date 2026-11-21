const db = require('../config/db');
const { resolveEffectivePermissions } = require('../config/permissions');

/**
 * Middleware de Aislamiento Multi-Tenant estricto por Hotel (Establecimiento).
 * Resuelve el hotelId y recalcula los permisos granulares efectivos del usuario en esa sede.
 */
const requireHotelAccess = async (req, res, next) => {
  try {
    let resolvedHotelId = null;

    if (req.params && req.params.hotelId) {
      resolvedHotelId = parseInt(req.params.hotelId, 10);
    } else if (req.headers['x-hotel-id']) {
      resolvedHotelId = parseInt(req.headers['x-hotel-id'], 10);
    } else if (req.baseUrl) {
      if (req.baseUrl.includes('hotel-1')) resolvedHotelId = 1;
      else if (req.baseUrl.includes('hotel-2')) resolvedHotelId = 2;
    }

    if (!resolvedHotelId || isNaN(resolvedHotelId)) {
      resolvedHotelId = req.user?.default_hotel_id || 1;
    }

    const hotel = await db.get('SELECT * FROM hotels WHERE id = ? AND active = 1', [resolvedHotelId]);
    if (!hotel) {
      return res.status(404).json({ error: 'Establecimiento hotelero no encontrado o inactivo.' });
    }

    if (req.user) {
      // SEGURIDAD: todos (incluidos los propietarios) deben estar vinculados a
      // este hotel. Antes el rol PROPIETARIO saltaba esta validación y el dueño
      // de un hotel cliente podía leer y modificar los datos de cualquier otro.
      const userHotel = await db.get(
        'SELECT role, active FROM user_hotels WHERE user_id = ? AND hotel_id = ?',
        [req.user.id, hotel.id]
      );

      if (!userHotel || Number(userHotel.active) === 0) {
        return res.status(403).json({
          error: 'Acceso denegado: No tienes autorización para operar en este establecimiento hotelero.'
        });
      }

      const linkRole = userHotel.role === 'ADMIN' ? 'PROPIETARIO' : userHotel.role;
      const globalOwner = req.user.role === 'PROPIETARIO' || req.user.role === 'ADMIN';
      // Un propietario global vinculado al hotel conserva acceso total en él.
      const effectiveHotelRole = globalOwner ? 'PROPIETARIO' : linkRole || req.user.role;

      req.hotelRole = effectiveHotelRole;
      req.user.permissions = resolveEffectivePermissions(
        effectiveHotelRole,
        req.user.custom_permissions
      );
    }

    req.hotelId = hotel.id;
    req.hotel = hotel;
    next();
  } catch (error) {
    console.error('Error en aislamiento multi-tenant:', error);
    res.status(500).json({ error: 'Error interno al validar el acceso al establecimiento.' });
  }
};

module.exports = requireHotelAccess;
