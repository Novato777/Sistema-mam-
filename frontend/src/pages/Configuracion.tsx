import React from 'react';
import { Settings, Moon, Sun, Sparkles, Check, Shield } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function Configuracion() {
  const { theme, toggleTheme, setTheme } = useTheme();

  return (
    <div className="space-y-8 pb-12">
      {/* Listón Superior */}
      <div className="w-full h-2.5 bg-indigo-500 rounded-full mb-4 shadow-sm"></div>

      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-3">
            <span className="p-2 bg-indigo-500 text-white rounded-2xl border border-indigo-600 shadow-sm">
              <Settings className="w-6 h-6" />
            </span>
            Configuración del Sistema
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Personaliza el tema visual y ajustes del sistema administrativo.
          </p>
        </div>
      </div>

      {/* Tarjeta Apariencia */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150/60 dark:border-slate-800 shadow-xs p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Apariencia Visual</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Selecciona el tema de color para la interfaz del sistema.</p>
          </div>
        </div>

        {/* Opciones de tema */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Opción Claro */}
          <button
            onClick={() => setTheme('light')}
            className={`p-5 rounded-2xl border text-left flex items-start justify-between transition-all active:scale-[0.99] ${
              theme === 'light'
                ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 ring-2 ring-indigo-500/20'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex gap-4 items-start">
              <div className={`p-3 rounded-xl ${theme === 'light' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                <Sun className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">Modo Claro</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Interfaz brillante tradicional con colores limpios.</p>
              </div>
            </div>
            {theme === 'light' && (
              <span className="p-1 bg-indigo-500 text-white rounded-full">
                <Check className="w-4 h-4" />
              </span>
            )}
          </button>

          {/* Opción Oscuro */}
          <button
            onClick={() => setTheme('dark')}
            className={`p-5 rounded-2xl border text-left flex items-start justify-between transition-all active:scale-[0.99] ${
              theme === 'dark'
                ? 'border-indigo-500 bg-indigo-950/30 ring-2 ring-indigo-500/20'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex gap-4 items-start">
              <div className={`p-3 rounded-xl ${theme === 'dark' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                <Moon className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">Modo Oscuro</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Reduce el cansancio visual en entornos con poca luz.</p>
              </div>
            </div>
            {theme === 'dark' && (
              <span className="p-1 bg-indigo-500 text-white rounded-full">
                <Check className="w-4 h-4" />
              </span>
            )}
          </button>
        </div>

        {/* Switch Rápido */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Interruptor Rápido de Tema</span>
            <span className="text-xs text-slate-400">Activo: {theme === 'dark' ? 'Modo Oscuro 🌙' : 'Modo Claro ☀️'}</span>
          </div>

          <button
            onClick={toggleTheme}
            className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              theme === 'dark' ? 'bg-indigo-600' : 'bg-slate-300'
            }`}
          >
            <span className="sr-only">Alternar modo oscuro</span>
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out flex items-center justify-center text-xs ${
                theme === 'dark' ? 'translate-x-7' : 'translate-x-0'
              }`}
            >
              {theme === 'dark' ? '🌙' : '☀️'}
            </span>
          </button>
        </div>
      </div>

      {/* Información del Sistema */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150/60 dark:border-slate-800 shadow-xs p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Información del Sistema</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Sistema Administrativo Familiar v1.0.0</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-2">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/50">
            <span className="text-slate-400 block font-medium">Estado del Servidor</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">🟢 En Línea</span>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/50">
            <span className="text-slate-400 block font-medium">Base de Datos</span>
            <span className="text-slate-700 dark:text-slate-200 font-semibold">SQLite Local</span>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/50">
            <span className="text-slate-400 block font-medium">Preferencia de Tema</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-semibold uppercase">{theme}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
