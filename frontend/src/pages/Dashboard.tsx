import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Building2, 
  UtensilsCrossed, 
  Leaf, 
  ArrowRight 
} from 'lucide-react';
import API_URL from '../config/api';

interface BusinessStats {
  hotel1: { occupied: number; total: number; percentage: number };
  hotel2: { occupied: number; total: number; percentage: number };
  restaurante: { salesToday: number; target: number; percentage: number };
  lichigueria: { salesToday: number; target: number; percentage: number };
}

export default function Dashboard() {
  const [stats, setStats] = useState<BusinessStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllStats = async () => {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      try {
        const [h1Res, h2Res, restRes, lichiRes] = await Promise.all([
          fetch(`${API_URL}/api/hotel-1/dashboard`, { headers }),
          fetch(`${API_URL}/api/hotel-2/dashboard`, { headers }),
          fetch(`${API_URL}/api/restaurante/dashboard`, { headers }),
          fetch(`${API_URL}/api/lichigueria/dashboard`, { headers })
        ]);

        if (h1Res.ok && h2Res.ok && restRes.ok && lichiRes.ok) {
          const h1Data = await h1Res.json();
          const h2Data = await h2Res.json();
          const restData = await restRes.json();
          const lichiData = await lichiRes.json();

          // Objetivos de venta diaria para los negocios de comercio
          const restTarget = 200000; // $200.000 diario
          const lichiTarget = 150000; // $150.000 diario

          setStats({
            hotel1: {
              occupied: h1Data.rooms.occupied || 0,
              total: h1Data.rooms.total || 0,
              percentage: h1Data.rooms.total ? Math.round((h1Data.rooms.occupied / h1Data.rooms.total) * 100) : 0
            },
            hotel2: {
              occupied: h2Data.rooms.occupied || 0,
              total: h2Data.rooms.total || 0,
              percentage: h2Data.rooms.total ? Math.round((h2Data.rooms.occupied / h2Data.rooms.total) * 100) : 0
            },
            restaurante: {
              salesToday: restData.today.sales || 0,
              target: restTarget,
              percentage: Math.min(100, Math.round(( (restData.today.sales || 0) / restTarget) * 100))
            },
            lichigueria: {
              salesToday: lichiData.today.sales || 0,
              target: lichiTarget,
              percentage: Math.min(100, Math.round(( (lichiData.today.sales || 0) / lichiTarget) * 100))
            }
          });
        }
      } catch (error) {
        console.error('Error al cargar estadísticas del dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllStats();
  }, []);

  const cards = [
    {
      title: 'Hotel 1',
      description: 'Gestión de habitaciones, tarifas, huéspedes y transacciones.',
      icon: Building2,
      path: '/hotel-1',
      color: 'bg-emerald-500 text-white border-emerald-600 shadow-sm shadow-emerald-100',
      badge: 'Hotelero',
      borderHover: 'hover:border-emerald-500 hover:shadow-emerald-100/50',
      renderProgress: () => {
        if (loading || !stats) return <div className="h-8 bg-slate-100 animate-pulse rounded-lg"></div>;
        const { occupied, total, percentage } = stats.hotel1;
        return (
          <div className="space-y-1.5 mt-2">
            <div className="flex justify-between text-xs font-semibold text-slate-500">
              <span>Ocupación: {occupied} / {total} habs.</span>
              <span className="text-emerald-600">{percentage}%</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
          </div>
        );
      }
    },
    {
      title: 'Hotel 2',
      description: 'Administración independiente para el segundo hotel.',
      icon: Building2,
      path: '/hotel-2',
      color: 'bg-teal-500 text-white border-teal-600 shadow-sm shadow-teal-100',
      badge: 'Hotelero',
      borderHover: 'hover:border-teal-500 hover:shadow-teal-100/50',
      renderProgress: () => {
        if (loading || !stats) return <div className="h-8 bg-slate-100 animate-pulse rounded-lg"></div>;
        const { occupied, total, percentage } = stats.hotel2;
        return (
          <div className="space-y-1.5 mt-2">
            <div className="flex justify-between text-xs font-semibold text-slate-500">
              <span>Ocupación: {occupied} / {total} habs.</span>
              <span className="text-teal-650">{percentage}%</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-teal-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
          </div>
        );
      }
    },
    {
      title: 'Restaurante',
      description: 'Registro rápido de ventas, egresos diarios y balances.',
      icon: UtensilsCrossed,
      path: '/restaurante',
      color: 'bg-rose-500 text-white border-rose-600 shadow-sm shadow-rose-100',
      badge: 'Gastronomía',
      borderHover: 'hover:border-rose-500 hover:shadow-rose-100/50',
      renderProgress: () => {
        if (loading || !stats) return <div className="h-8 bg-slate-100 animate-pulse rounded-lg"></div>;
        const { salesToday, target, percentage } = stats.restaurante;
        return (
          <div className="space-y-1.5 mt-2">
            <div className="flex justify-between text-xs font-semibold text-slate-500">
              <span>Hoy: ${salesToday.toLocaleString()} / ${target.toLocaleString()}</span>
              <span className="text-rose-600">{percentage}%</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-rose-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
          </div>
        );
      }
    },
    {
      title: 'Lichiguería',
      description: 'Gestión de proveedores locales y ventas rápidas con pesaje.',
      icon: Leaf,
      path: '/lichigueria',
      color: 'bg-amber-500 text-white border-amber-600 shadow-sm shadow-amber-100',
      badge: 'Abastecimiento',
      borderHover: 'hover:border-amber-500 hover:shadow-amber-100/50',
      renderProgress: () => {
        if (loading || !stats) return <div className="h-8 bg-slate-100 animate-pulse rounded-lg"></div>;
        const { salesToday, target, percentage } = stats.lichigueria;
        return (
          <div className="space-y-1.5 mt-2">
            <div className="flex justify-between text-xs font-semibold text-slate-500">
              <span>Hoy: ${salesToday.toLocaleString()} / ${target.toLocaleString()}</span>
              <span className="text-amber-600">{percentage}%</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-amber-500 h-full rounded-full transition-all duration-500" 
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Hola, Administrador
        </h1>
        <p className="text-slate-500 max-w-lg">
          Selecciona uno de los módulos a continuación para empezar a gestionar los negocios familiares.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.path}
              to={card.path}
              className={`group relative bg-white p-6 rounded-2xl border border-slate-150/60 shadow-xs hover:shadow-md ${card.borderHover} active:scale-[0.99] transition-all flex flex-col justify-between h-72`}
            >
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className={`p-3.5 rounded-xl border ${card.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full">
                    {card.badge}
                  </span>
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-slate-800 group-hover:text-slate-900">
                    {card.title}
                  </h3>
                  <p className="text-xs text-slate-450 leading-relaxed max-w-xs">
                    {card.description}
                  </p>
                </div>
              </div>

              {/* Diagrama de Progreso en Color */}
              <div className="my-2">
                {card.renderProgress()}
              </div>
              
              <div className="flex items-center space-x-2 text-xs font-medium text-slate-600 group-hover:text-slate-900 self-start">
                <span>Ingresar al módulo</span>
                <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
