// Utilidad para obtener la fecha local de Colombia (America/Bogota, UTC-5) en formato YYYY-MM-DD
export const getTodayString = (): string => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
};
