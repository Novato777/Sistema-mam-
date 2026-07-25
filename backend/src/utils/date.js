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

const parseDateParts = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const cleanStr = dateStr.split('T')[0];
  const parts = cleanStr.split('-');
  if (parts.length !== 3) return null;
  return {
    year: parseInt(parts[0], 10),
    month: parseInt(parts[1], 10),
    day: parseInt(parts[2], 10)
  };
};

const addDaysToDateStr = (dateStr, days) => {
  const parts = parseDateParts(dateStr);
  if (!parts) return getTodayString();
  const d = new Date(parts.year, parts.month - 1, parts.day);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getDaysDifference = (fromDateStr, toDateStr) => {
  const p1 = parseDateParts(fromDateStr);
  const p2 = parseDateParts(toDateStr);
  if (!p1 || !p2) return 0;
  const d1 = new Date(p1.year, p1.month - 1, p1.day);
  const d2 = new Date(p2.year, p2.month - 1, p2.day);
  const diffMs = d2.getTime() - d1.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

module.exports = {
  getTodayString,
  formatDate,
  addDaysToDateStr,
  getDaysDifference
};
