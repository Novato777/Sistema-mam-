const db = require('../config/db');

/**
 * ¿El usuario pertenece (activo) a este hotel?
 * Se usa antes de asignarle tareas, tickets o turnos: sin esta validación se
 * podía asignar trabajo a personas de otro hotel/cliente enviando su id.
 */
const isHotelMember = async (hotelId, userId) => {
  const id = Number(userId);
  if (!id) return false;
  const row = await db.get(
    `SELECT 1 AS ok FROM user_hotels uh
     JOIN users u ON u.id = uh.user_id
     WHERE uh.hotel_id = ? AND uh.user_id = ? AND uh.active = 1 AND COALESCE(u.active, 1) = 1`,
    [hotelId, id]
  );
  return Boolean(row);
};

/** true si viene un responsable asignado (no vacío / no null). */
const hasAssignee = (value) => value !== undefined && value !== null && value !== '';

module.exports = { isHotelMember, hasAssignee };
