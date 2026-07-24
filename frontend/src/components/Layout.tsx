import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  Building2, 
  UtensilsCrossed, 
  Leaf, 
  LayoutDashboard, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  ChevronRight 
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const menuItems = [
    { name: 'Dashboard Principal', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Hotel 1', path: '/hotel-1', icon: Building2 },
    { name: 'Hotel 2', path: '/hotel-2', icon: Building2 },
    { name: 'Restaurante', path: '/restaurante', icon: UtensilsCrossed },
    { name: 'Lichiguería', path: '/lichigueria', icon: Leaf },
    { name: 'Configuración', path: '/configuracion', icon: Settings },
  ];

  const currentModule = menuItems.find(item => item.path === location.pathname)?.name || 'Módulo';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex transition-colors duration-200">
      {/* Sidebar para pantallas grandes */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 p-6 space-y-6 shrink-0">
        <div className="flex justify-center px-1 py-2 mb-2">
          <div className="w-full flex items-center justify-center p-2 rounded-2xl bg-white/80 dark:bg-white/95 shadow-xs border border-slate-100 dark:border-slate-800 transition-all">
            <img src="/logo.png" alt="Admin Familiar" className="w-full max-h-20 object-contain" />
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            // Definir color de badge/item según módulo
            let activeColor = 'bg-slate-900 dark:bg-indigo-600 text-white';
            if (isActive) {
              if (item.path === '/hotel-1') activeColor = 'bg-emerald-600 text-white shadow-md shadow-emerald-100 dark:shadow-none';
              if (item.path === '/hotel-2') activeColor = 'bg-teal-600 text-white shadow-md shadow-teal-100 dark:shadow-none';
              if (item.path === '/restaurante') activeColor = 'bg-rose-600 text-white shadow-md shadow-rose-100 dark:shadow-none';
              if (item.path === '/lichigueria') activeColor = 'bg-amber-500 text-white shadow-md shadow-amber-100 dark:shadow-none';
              if (item.path === '/configuracion') activeColor = 'bg-indigo-600 text-white shadow-md shadow-indigo-100 dark:shadow-none';
              if (item.path === '/') activeColor = 'bg-indigo-600 text-white shadow-md shadow-indigo-100 dark:shadow-none';
            }

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-between px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? activeColor
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </div>
                {isActive && <ChevronRight className="w-4 h-4 text-white/70" />}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={handleLogout}
          className="flex items-center space-x-3 px-3 py-3 w-full rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all text-left"
        >
          <LogOut className="w-5 h-5" />
          <span>Cerrar sesión</span>
        </button>
      </aside>

      {/* Sidebar Móvil Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden bg-slate-900/60 backdrop-blur-xs">
          <div className="w-64 bg-white dark:bg-slate-900 p-6 flex flex-col space-y-6 animate-in slide-in-from-left duration-200 border-r border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center p-1.5 rounded-xl bg-white/80 dark:bg-white/95 border border-slate-100 dark:border-slate-800">
                <img src="/logo.png" alt="Admin Familiar" className="max-h-12 object-contain" />
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;

                let activeColor = 'bg-slate-900 dark:bg-indigo-600 text-white';
                if (isActive) {
                  if (item.path === '/hotel-1') activeColor = 'bg-emerald-600 text-white';
                  if (item.path === '/hotel-2') activeColor = 'bg-teal-600 text-white';
                  if (item.path === '/restaurante') activeColor = 'bg-rose-600 text-white';
                  if (item.path === '/lichigueria') activeColor = 'bg-amber-500 text-white';
                  if (item.path === '/configuracion') activeColor = 'bg-indigo-600 text-white';
                  if (item.path === '/') activeColor = 'bg-indigo-600 text-white';
                }

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? activeColor
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className="w-5 h-5 mr-3" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>

            <button
              onClick={handleLogout}
              className="flex items-center space-x-3 px-3 py-3 w-full rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all text-left"
            >
              <LogOut className="w-5 h-5" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      )}

      {/* Área de contenido principal */}
      <div className={`flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${
        location.pathname === '/hotel-1' ? 'bg-emerald-100/40 dark:bg-slate-950' :
        location.pathname === '/hotel-2' ? 'bg-teal-100/40 dark:bg-slate-950' :
        location.pathname === '/restaurante' ? 'bg-rose-100/40 dark:bg-slate-950' :
        location.pathname === '/lichigueria' ? 'bg-amber-100/45 dark:bg-slate-950' :
        'bg-slate-100 dark:bg-slate-950'
      }`}>
        {/* Header móvil */}
        <header className="md:hidden flex items-center justify-between bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="font-semibold text-slate-850 dark:text-slate-100 text-base">{currentModule}</h2>
          </div>
          <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-150 dark:border-slate-700 shadow-2xs">
            <img src="/favicon.png" alt="Admin Logo" className="w-full h-full object-cover" />
          </div>
        </header>

        {/* Contenedor de scroll de ancho completo para que la barra quede en el borde derecho de la pantalla */}
        <div className="flex-1 overflow-y-auto">
          <main className="p-6 md:p-10 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
