import API_URL from '../config/api';

/**
 * Vigilante global de sesión.
 * Si cualquier petición autenticada al backend responde 401 (token vencido o
 * sesión revocada), se limpia la sesión y se lleva al usuario al login con un
 * aviso, en vez de dejar la pantalla fallando sin explicación.
 * Se excluyen el login del PMS y el Panel Master (tienen su propio manejo).
 */
export const SESSION_EXPIRED_KEY = 'sessionExpiredMessage';

const EXCLUDED = ['/api/auth/login', '/api/saas-master'];
let redirecting = false;

const requestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

export function installSessionGuard() {
  if ((window as any).__sessionGuardInstalled) return;
  (window as any).__sessionGuardInstalled = true;

  const originalFetch = window.fetch.bind(window);
  const apiBase = API_URL.replace(/\/+$/, '');

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);
    try {
      const url = requestUrl(input);
      const isApi = url.startsWith(apiBase) || url.startsWith('/api/');
      if (
        response.status === 401 &&
        isApi &&
        !EXCLUDED.some((p) => url.includes(p)) &&
        localStorage.getItem('token') &&
        !redirecting
      ) {
        redirecting = true;
        let message = 'Tu sesión venció. Inicia sesión nuevamente.';
        try {
          const data = await response.clone().json();
          if (data?.error) message = data.error;
        } catch (_) {
          /* respuesta sin JSON */
        }
        localStorage.removeItem('token');
        sessionStorage.setItem(SESSION_EXPIRED_KEY, message);
        window.location.replace('/login');
      }
    } catch (_) {
      /* nunca romper la petición original por el vigilante */
    }
    return response;
  };
}
