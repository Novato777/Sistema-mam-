import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Building2,
  CalendarRange,
  UserCheck,
  BedDouble,
  Wallet,
  Sparkles,
  UtensilsCrossed,
  Boxes,
  Landmark,
  Wrench,
  UserCog,
  BarChart3,
  LayoutDashboard,
  Settings,
  Users,
  Bell,
  LogOut,
  Menu,
  X,
  ChevronRight,
  ShieldCheck,
  FileBarChart2
} from 'lucide-react';
import { useHotel } from '../context/HotelContext';
import API_URL from '../config/api';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { hotels, activeHotel, activeHotelId, setActiveHotelId, user, hasPermission } = useHotel();
  const scrollRef = useRef<HTMLDivElement>(null);

  // El Layout queda montado entre módulos: al cambiar de ruta se vuelve arriba
  // y se cierra el menú móvil.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setSidebarOpen(false);
  }, [location.pathname]);

  // Menú móvil: se cierra con la tecla Escape.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  const handleLogout = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (_) {
        // Ignorar error de red al cerrar sesión
      }
    }
    localStorage.removeItem('token');
    localStorage.removeItem('activeHotelId');
    navigate('/login');
  };

  const handleSwitchHotel = (id: number) => {
    setActiveHotelId(id);
    if (location.pathname.startsWith('/hotel')) {
      navigate(id === 1 ? '/hotel-1' : id === 2 ? '/hotel-2' : `/hotels/${id}`);
    }
  };

  // 5 Módulos Principales del Sistema (Ultracompacto y a prueba de errores)
  const allMenuItems = [
    {
      name: 'Recepción',
      path: '/recepcion',
      icon: BedDouble,
      visible: hasPermission('reception.view') || hasPermission('reception.checkin') || hasPermission('rooms.view')
    },
    {
      name: 'Caja',
      path: '/caja',
      icon: Wallet,
      visible: hasPermission('cash.view') || hasPermission('cash.operate')
    },
    {
      name: 'Servicios',
      path: '/restaurante',
      icon: UtensilsCrossed,
      visible: hasPermission('restaurant.view') || hasPermission('restaurant.operate')
    },
    {
      name: 'Inventario',
      path: '/inventario',
      icon: Boxes,
      visible: hasPermission('inventory.view') || hasPermission('inventory.manage')
    },
    {
      name: 'Personal',
      path: '/personal',
      icon: Users,
      visible: hasPermission('users.view') || hasPermission('users.manage')
    },
    {
      name: 'Reportes',
      path: '/reportes',
      icon: FileBarChart2,
      visible: hasPermission('reports.view') || user?.role === 'PROPIETARIO' || user?.role === 'ADMIN'
    },
    {
      name: 'Configuración',
      path: '/configuracion',
      icon: Settings,
      visible: hasPermission('config.view') || user?.role === 'PROPIETARIO' || user?.role === 'ADMIN'
    }
  ];

  const menuItems = allMenuItems.filter((item) => item.visible);

  // Títulos de los módulos que no aparecen en el menú (se abren desde otras pantallas).
  const extraTitles: Record<string, string> = {
    '/dashboard': 'Panel general',
    '/reservas': 'Reservas',
    '/limpieza': 'Limpieza',
    '/contabilidad': 'Contabilidad',
    '/mantenimiento': 'Mantenimiento',
    '/usuarios': 'Usuarios',
    '/notificaciones': 'Notificaciones'
  };

  const currentModule =
    menuItems.find((item) => item.path === location.pathname)?.name ||
    extraTitles[location.pathname] ||
    activeHotel?.name ||
    'HOVENTRA';

  return (
    <div className="h-screen h-dvh overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex transition-colors duration-200">
      {/* Sidebar para pantallas grandes (100% Fijo lateralmente) */}
      <aside className="hidden lg:flex flex-col w-60 xl:w-68 bg-indigo-50 dark:bg-slate-900 border-r border-indigo-100 dark:border-slate-800 p-5 xl:p-6 space-y-5 shrink-0 h-full overflow-y-auto z-20">
        <div className="flex justify-center px-1 py-1">
          <div className="w-full flex items-center justify-center p-2 rounded-2xl bg-white/80 dark:bg-slate-950 shadow-xs border border-slate-100 dark:border-sky-500/40 transition-all">
            <img
              src={activeHotel?.logo_url || '/logo.png'}
              alt={activeHotel?.name || 'HOVENTRA'}
              className="w-full max-h-28 object-contain"
            />
          </div>
        </div>

        {/* Información del Hotel */}
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/60 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg font-bold shrink-0">
            🏨
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
              {activeHotel?.name || 'Hotel Activo'}
            </p>
            <p className="text-[10px] text-slate-400 font-semibold truncate">
              {activeHotel?.city || 'Sede Principal'}
            </p>
          </div>
        </div>

        {/* Selector de Hotel solo si tiene más de 1 asignado */}
        {hotels.length > 1 && (
          <div className="p-2 rounded-xl bg-slate-100/80 dark:bg-slate-800/50 border border-slate-200/50">
            <select
              value={activeHotelId}
              onChange={(e) => handleSwitchHotel(Number(e.target.value))}
              className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
            >
              {hotels.map((h) => (
                <option key={h.id} value={h.id}>
                  🏨 {h.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav className="flex-1 space-y-1.5 overflow-y-auto py-2 px-1.5 -mx-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            let activeColor = 'bg-indigo-600 text-white shadow-md shadow-indigo-200/80 dark:shadow-none';
            if (isActive) {
              if (item.path === '/recepcion')
                activeColor = 'bg-emerald-600 text-white shadow-md shadow-emerald-200/80 dark:shadow-none';
              else if (item.path === '/caja')
                activeColor = 'bg-indigo-600 text-white shadow-md shadow-indigo-200/80 dark:shadow-none';
              else if (item.path === '/restaurante')
                activeColor = 'bg-amber-600 text-white shadow-md shadow-amber-200/80 dark:shadow-none';
              else if (item.path === '/inventario')
                activeColor = 'bg-teal-600 text-white shadow-md shadow-teal-200/80 dark:shadow-none';
              else if (item.path === '/personal')
                activeColor = 'bg-purple-600 text-white shadow-md shadow-purple-200/80 dark:shadow-none';
              else if (item.path === '/reportes')
                activeColor = 'bg-sky-600 text-white shadow-md shadow-sky-200/80 dark:shadow-none';
              else if (item.path === '/configuracion')
                activeColor = 'bg-slate-800 dark:bg-slate-700 text-white shadow-md dark:shadow-none';
            }

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition-all duration-150 ${
                  isActive
                    ? activeColor
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:translate-x-0.5'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="truncate tracking-wide">{item.name}</span>
                </div>
                {isActive && <ChevronRight className="w-4 h-4 text-white/80 shrink-0" />}
              </Link>
            );
          })}
        </nav>

        {user && (
          <div className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <div className="min-w-0">
              <p className="font-bold text-slate-800 dark:text-slate-100 truncate">
                {user.full_name}
              </p>
              <p className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                {user.role} · {user.permissions.length} permisos
              </p>
            </div>
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          </div>
        )}

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
        <div
          className="fixed inset-0 z-50 flex lg:hidden bg-slate-900/60 backdrop-blur-xs"
          onClick={() => setSidebarOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="nav-drawer w-72 max-w-[85vw] h-full overflow-y-auto overscroll-contain bg-indigo-50 dark:bg-slate-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col space-y-5 border-r border-slate-100 dark:border-slate-800"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center min-w-0 p-1.5 rounded-xl bg-white/80 dark:bg-slate-950 border border-slate-100 dark:border-sky-500/40">
                <img src={activeHotel?.logo_url || '/logo.png'} alt={activeHotel?.name || 'HOVENTRA'} className="max-h-16 max-w-full object-contain" />
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Cerrar menú"
                className="p-2.5 shrink-0 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {hotels.length > 1 && (
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Hotel Activo
                </span>
                <select
                  value={activeHotelId}
                  onChange={(e) => {
                    handleSwitchHotel(Number(e.target.value));
                    setSidebarOpen(false);
                  }}
                  className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                >
                  {hotels.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <nav className="flex-1 space-y-1.5 py-2 px-1.5 -mx-1.5">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;

                let activeColor = 'bg-indigo-600 text-white shadow-md shadow-indigo-200/80 dark:shadow-none';
                if (isActive) {
                  if (item.path === '/recepcion')
                    activeColor = 'bg-emerald-600 text-white shadow-md shadow-emerald-200/80 dark:shadow-none';
                  else if (item.path === '/caja')
                    activeColor = 'bg-indigo-600 text-white shadow-md shadow-indigo-200/80 dark:shadow-none';
                  else if (item.path === '/restaurante')
                    activeColor = 'bg-amber-600 text-white shadow-md shadow-amber-200/80 dark:shadow-none';
                  else if (item.path === '/inventario')
                    activeColor = 'bg-teal-600 text-white shadow-md shadow-teal-200/80 dark:shadow-none';
                  else if (item.path === '/personal')
                    activeColor = 'bg-purple-600 text-white shadow-md shadow-purple-200/80 dark:shadow-none';
                  else if (item.path === '/reportes')
                    activeColor = 'bg-sky-600 text-white shadow-md shadow-sky-200/80 dark:shadow-none';
                  else if (item.path === '/configuracion')
                    activeColor = 'bg-slate-800 dark:bg-slate-700 text-white shadow-md dark:shadow-none';
                }

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center px-3.5 py-3 rounded-xl text-xs font-bold transition-all duration-150 ${
                      isActive
                        ? activeColor
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:translate-x-0.5'
                    }`}
                  >
                    <Icon className="w-5 h-5 mr-3 shrink-0" />
                    <span className="truncate">{item.name}</span>
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

      {/* Área de contenido principal con scroll independiente y barra superior fija */}
      <div
        className={`flex-1 flex flex-col min-w-0 h-full overflow-hidden transition-all duration-300 ${
          location.pathname === '/hotel-1'
            ? 'bg-emerald-100/40 dark:bg-slate-950'
            : location.pathname === '/hotel-2'
            ? 'bg-teal-100/40 dark:bg-slate-950'
            : 'app-canvas dark:bg-slate-950'
        }`}
      >
        {/* Barra superior permanente y FIJA (Mobile + Desktop Sticky Top) */}
        <header className="sticky top-0 z-30 shrink-0 bg-white/80 dark:bg-slate-900/95 backdrop-blur-md border-b border-indigo-100 dark:border-slate-800 px-3 sm:px-6 md:px-8 pb-2.5 sm:pb-3 pt-[max(0.625rem,env(safe-area-inset-top))] sm:pt-3 shadow-2xs flex items-center justify-between gap-3">
          {/* Lado izquierdo: Botón menú móvil + Título del módulo + Badge de Hotel */}
          <div className="flex items-center space-x-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menú"
              className="lg:hidden p-2.5 text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 active:scale-95 transition-transform shrink-0"
              title="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0 flex items-center gap-2.5">
              <h2 className="font-black text-slate-900 dark:text-slate-100 text-sm sm:text-base md:text-lg truncate">
                {currentModule}
              </h2>
              <span className="hidden sm:inline-flex min-w-0 max-w-[40vw] items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200/60 dark:border-indigo-500/70 truncate">
                🏨 {activeHotel?.name || 'Hotel Activo'}
              </span>
            </div>
          </div>

          {/* Lado derecho: Estado del sistema + Fecha + Usuario */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/70 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Sistema Operativo</span>
            </div>

            {user && (
              <div className="flex items-center gap-2 pl-2">
                <div className="hidden sm:block text-right">
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate max-w-[120px]">
                    {user.full_name?.split(' ')[0] || user.username}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {user.role}
                  </p>
                </div>
                <div className="w-8 h-8 shrink-0 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-xs">
                  {(user.full_name || user.username || 'U')[0].toUpperCase()}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Contenedor del contenido con scroll vertical fluido */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
          <main className="w-full max-w-[1600px] mx-auto px-3 sm:px-6 md:px-8 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-12">
            {children}
          </main>
        </div>

        {/* Barra de Navegación Inferior FIJA en Móvil (Acceso directo en 1 toque a los módulos principales) */}
        {menuItems.length > 0 && (
          <nav aria-label="Accesos rápidos" className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/90 dark:bg-slate-900/95 backdrop-blur-md border-t border-indigo-100 dark:border-slate-800 px-1.5 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-around gap-1 max-w-2xl mx-auto">
              {menuItems
                .filter((item) => item.path !== '/configuracion')
                .slice(0, 5)
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  let pillClass =
                    'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800';
                  if (isActive) {
                    if (item.path === '/recepcion')
                      pillClass = 'bg-emerald-600 text-white shadow-sm shadow-emerald-200 dark:shadow-none';
                    else if (item.path === '/caja')
                      pillClass = 'bg-indigo-600 text-white shadow-sm shadow-indigo-200 dark:shadow-none';
                    else if (item.path === '/restaurante')
                      pillClass = 'bg-amber-600 text-white shadow-sm shadow-amber-200 dark:shadow-none';
                    else if (item.path === '/inventario')
                      pillClass = 'bg-teal-600 text-white shadow-sm shadow-teal-200 dark:shadow-none';
                    else if (item.path === '/personal')
                      pillClass = 'bg-purple-600 text-white shadow-sm shadow-purple-200 dark:shadow-none';
                    else if (item.path === '/reportes')
                      pillClass = 'bg-sky-600 text-white shadow-sm shadow-sky-200 dark:shadow-none';
                  }
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex-1 flex flex-col items-center justify-center min-h-12 py-1.5 px-1 rounded-xl transition-all active:scale-95 min-w-0 ${pillClass}`}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="text-[10px] sm:text-xs font-extrabold truncate mt-0.5 max-w-full">
                        {item.name}
                      </span>
                    </Link>
                  );
                })}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
