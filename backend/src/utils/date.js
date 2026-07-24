// Helper de fecha garantizando zona horaria de Colombia (America/Bogota, UTC-5)

const getTodayString = () => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
};

const formatDate = (date) => {
  if (!date) return getTodayString();
  
  // Si ya es un string YYYY-MM-DD de 10 caracteres, retornarlo directamente
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);
};

module.exports = {
  getTodayString,
  formatDate
};
