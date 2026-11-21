import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

type Props = { children: React.ReactNode; resetKey?: string };
type State = { error: Error | null };

/**
 * Evita la "pantalla en blanco": si un módulo falla al dibujarse, se muestra un
 * aviso con opción de reintentar y el resto del sistema (menú, otros módulos)
 * sigue funcionando. Al cambiar de ruta (resetKey) se limpia el error.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Error en el módulo:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="max-w-lg mx-auto my-10 p-6 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 mx-auto text-rose-500" />
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Este módulo tuvo un problema</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Tus datos están guardados. Intenta de nuevo o cambia de sección desde el menú.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold"
          >
            <RotateCcw className="w-4 h-4" /> Reintentar
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200"
          >
            Recargar página
          </button>
        </div>
      </div>
    );
  }
}
