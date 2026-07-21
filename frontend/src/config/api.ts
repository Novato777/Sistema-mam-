// Configuración del endpoint de la API
// En producción lee la variable VITE_API_URL inyectada por Vercel, en local por defecto usa localhost:4000
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default API_URL;
