import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, User, ArrowLeft, ShieldCheck } from 'lucide-react';

import API_URL from '../config/api';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Credenciales incorrectas');
      }

      localStorage.setItem('token', data.access_token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans relative overflow-hidden flex flex-col items-center justify-center p-4 selection:bg-indigo-500 selection:text-white">
      {/* Luces decorativas de fondo */}
      <div className="absolute top-[-15%] left-[-10%] w-[500px] h-[500px] bg-indigo-650/10 rounded-full blur-[140px] -z-10 pointer-events-none"></div>
      <div className="absolute bottom-[-15%] right-[-10%] w-[500px] h-[500px] bg-emerald-600/10 rounded-full blur-[140px] -z-10 pointer-events-none"></div>

      {/* Botón para volver al Inicio (Landing) */}
      <Link 
        to="/" 
        className="absolute top-6 left-6 flex items-center space-x-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-900/50 hover:bg-slate-900 border border-slate-850/80 hover:border-slate-800 px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 z-50"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Volver al Inicio</span>
      </Link>

      {/* Contenedor Glassmorphism de Login */}
      <div className="w-full max-w-md bg-slate-900/40 backdrop-blur-md rounded-3xl border border-slate-900 shadow-2xl p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Encabezado con Logo */}
        <div className="text-center space-y-3">
          <div className="relative inline-flex mb-1">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-2xl blur-xs opacity-75"></div>
            <img 
              src="/favicon.png" 
              alt="Logo" 
              className="relative w-14 h-14 object-contain rounded-2xl border border-slate-850 bg-slate-950 p-2.5 shadow-lg" 
            />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            SystemPro
          </h1>
          <p className="text-xs text-slate-450 font-medium">
            Ingresa tus credenciales para acceder de forma segura
          </p>
        </div>

        {/* Mensaje de Error */}
        {error && (
          <div className="p-3 bg-red-500/10 text-red-400 text-xs rounded-xl border border-red-500/20 text-center font-medium">
            {error}
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-450 uppercase tracking-wider">
              Usuario
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nombre de usuario"
                className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-850 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:bg-slate-950 transition-all font-medium"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-450 uppercase tracking-wider">
              Contraseña
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-850 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:bg-slate-950 transition-all font-medium"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm shadow-lg shadow-indigo-500/25 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? 'Iniciando sesión...' : 'Entrar al Sistema'}
          </button>
        </form>

        <div className="flex items-center justify-center space-x-1.5 text-[10px] text-slate-500 font-semibold border-t border-slate-900/60 pt-4 select-none">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Acceso Directo Encriptado SSL</span>
        </div>

      </div>
    </div>
  );
}
