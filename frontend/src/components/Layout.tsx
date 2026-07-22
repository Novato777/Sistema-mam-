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
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar para pantallas grandes */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-100 p-6 space-y-6 shrink-0">
        <div className="flex justify-center px-1 py-2 mb-2">
          <img src="/logo.png" alt="Logo" className="w-full max-h-24 object-contain" />
        </div>

        <nav className="flex-1 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            // Definir color de badge/item según módulo
            let activeColor = 'bg-slate-900 text-white';
            if (isActive) {
              if (item.path === '/hotel-1') activeColor = 'bg-emerald-600 text-white shadow-md shadow-emerald-100';
              if (item.path === '/hotel-2') activeColor = 'bg-teal-600 text-white shadow-md shadow-teal-100';
              if (item.path === '/restaurante') activeColor = 'bg-rose-600 text-white shadow-md shadow-rose-100';
              if (item.path === '/lichigueria') activeColor = 'bg-amber-500 text-white shadow-md shadow-amber-100';
              if (item.path === '/') activeColor = 'bg-indigo-600 text-white shadow-md shadow-indigo-100';
            }

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-between px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? activeColor
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
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
          className="flex items-center space-x-3 px-3 py-3 w-full rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all text-left"
        >
          <LogOut className="w-5 h-5" />
          <span>Cerrar sesión</span>
        </button>
      </aside>

      {/* Sidebar Móvil Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden bg-slate-900/40 backdrop-blur-xs">
          <div className="w-64 bg-white p-6 flex flex-col space-y-6 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center px-1">
                <img src="/logo.png" alt="Logo" className="max-h-14 object-contain" />
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 text-slate-500 bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;

                let activeColor = 'bg-slate-900 text-white';
                if (isActive) {
                  if (item.path === '/hotel-1') activeColor = 'bg-emerald-600 text-white';
                  if (item.path === '/hotel-2') activeColor = 'bg-teal-600 text-white';
                  if (item.path === '/restaurante') activeColor = 'bg-rose-600 text-white';
                  if (item.path === '/lichigueria') activeColor = 'bg-amber-500 text-white';
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
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
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
              className="flex items-center space-x-3 px-3 py-3 w-full rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all text-left"
            >
              <LogOut className="w-5 h-5" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      )}

      {/* Área de contenido principal */}
      <div className={`flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${
        location.pathname === '/hotel-1' ? 'bg-emerald-100/40' :
        location.pathname === '/hotel-2' ? 'bg-teal-100/40' :
        location.pathname === '/restaurante' ? 'bg-rose-100/40' :
        location.pathname === '/lichigueria' ? 'bg-amber-100/45' :
        location.pathname === '/' ? 'bg-slate-100' :
        'bg-slate-100'
      }`}>
        {/* Header móvil */}
        <header className="md:hidden flex items-center justify-between bg-white border-b border-slate-100 px-6 py-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 text-slate-600 bg-slate-50 rounded-xl border border-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="font-semibold text-slate-850 text-base">{currentModule}</h2>
          </div>
          <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-150 shadow-2xs">
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
