// Columnas del hotel que son credenciales y NUNCA deben salir hacia el navegador.
const SECRET_HOTEL_COLUMNS = ['whatsapp_access_token', 'smtp_pass'];

/**
 * Devuelve una copia del hotel sin credenciales. En su lugar agrega banderas
 * (has_whatsapp_access_token, has_smtp_pass) para que la interfaz sepa si existen.
 */
const publicHotel = (hotel) => {
  if (!hotel || typeof hotel !== 'object') return hotel;
  const copy = { ...hotel };
  for (const col of SECRET_HOTEL_COLUMNS) {
    copy[`has_${col}`] = Boolean(copy[col]);
    delete copy[col];
  }
  return copy;
};

const publicHotels = (list) => (Array.isArray(list) ? list.map(publicHotel) : list);

module.exports = { publicHotel, publicHotels, SECRET_HOTEL_COLUMNS };
