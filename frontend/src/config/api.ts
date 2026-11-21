// Configuración del endpoint de la API
// En producción lee VITE_API_URL (definida en Vercel); en local usa localhost:4001.
// Se quita la "/" final para que nunca quede "//api/...".
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4001').trim().replace(/\/+$/, '');

export default API_URL;
