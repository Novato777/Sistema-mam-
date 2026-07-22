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

interface DoughnutSegment {
  value: number;
  color: string;
}

function DoughnutChart({ 
  segments, 
  totalLabel, 
  totalValue,
  legend
}: { 
  segments: DoughnutSegment[]; 
  totalLabel: string; 
  totalValue: string | number;
  legend: React.ReactNode;
}) {
  const radius = 36;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius; // ~226.2
  const center = 50;

  // Filtrar segmentos con valor mayor a 0 para evitar errores visuales
  const activeSegments = segments.filter(seg => seg.value > 0);
  
  // Calcular offsets acumulados para apilar los segmentos correctamente
  let accumulatedPercentage = 0;

  return (
    <div className="flex items-center space-x-5 bg-slate-50/50 p-3.5 rounded-2xl border border-slate-100">
      <div className="relative w-24 h-24 flex-shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
          {/* Círculo de fondo gris */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
          />
          {activeSegments.map((seg, idx) => {
            const strokeLength = (seg.value / 100) * circumference;
            // El offset se calcula para posicionar el segmento después del anterior
            const strokeOffset = circumference - strokeLength - (accumulatedPercentage / 100) * circumference;
            accumulatedPercentage += seg.value;

            return (
              <circle
                key={idx}
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeOffset}
                strokeLinecap="round"
                className="transition-all duration-700 ease-out"
              />
            );
          })}
        </svg>
        {/* Texto en el Centro */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-lg font-black text-slate-800 leading-none">{totalValue}</span>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{totalLabel}</span>
        </div>
      </div>
      
      {/* Leyenda a la derecha */}
      <div className="flex-1 min-w-0">
        {legend}
      </div>
    </div>
  );
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

          const restTarget = 200000;
          const lichiTarget = 150000;

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
        if (loading || !stats) return <div className="h-24 bg-slate-100 animate-pulse rounded-2xl"></div>;
        const { occupied, total, percentage } = stats.hotel1;
        const free = total - occupied;
        const freePercentage = total ? Math.round((free / total) * 100) : 0;
        
        return (
          <DoughnutChart
            totalValue={total}
            totalLabel="Habs"
            segments={[
              { value: percentage, color: '#f43f5e' }, // Ocupadas - Rojo/Rosa
              { value: freePercentage, color: '#10b981' } // Libres - Verde
            ]}
            legend={
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                  <span className="text-slate-600 font-medium truncate">Libres: <b className="text-slate-800">{free}</b></span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                  <span className="text-slate-600 font-medium truncate">Ocupadas: <b className="text-slate-800">{occupied}</b></span>
                </div>
              </div>
            }
          />
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
        if (loading || !stats) return <div className="h-24 bg-slate-100 animate-pulse rounded-2xl"></div>;
        const { occupied, total, percentage } = stats.hotel2;
        const free = total - occupied;
        const freePercentage = total ? Math.round((free / total) * 100) : 0;

        return (
          <DoughnutChart
            totalValue={total}
            totalLabel="Habs"
            segments={[
              { value: percentage, color: '#f43f5e' }, // Ocupadas - Rojo/Rosa
              { value: freePercentage, color: '#0d9488' } // Libres - Teal
            ]}
            legend={
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block"></span>
                  <span className="text-slate-600 font-medium truncate">Libres: <b className="text-slate-800">{free}</b></span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                  <span className="text-slate-600 font-medium truncate">Ocupadas: <b className="text-slate-800">{occupied}</b></span>
                </div>
              </div>
            }
          />
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
        if (loading || !stats) return <div className="h-24 bg-slate-100 animate-pulse rounded-2xl"></div>;
        const { salesToday, target, percentage } = stats.restaurante;
        const pending = Math.max(0, 100 - percentage);

        return (
          <DoughnutChart
            totalValue={`${percentage}%`}
            totalLabel="Meta"
            segments={[
              { value: percentage, color: '#ec4899' }, // Ventas hoy - Rosa
              { value: pending, color: '#cbd5e1' } // Pendiente - Gris
            ]}
            legend={
              <div className="space-y-1 text-[11px] leading-tight">
                <div className="text-slate-500 font-semibold uppercase tracking-wider text-[9px]">Ventas de hoy</div>
                <div className="text-slate-800 font-bold text-sm truncate">${salesToday.toLocaleString()}</div>
                <div className="text-slate-400 text-[10px]">Meta: ${target.toLocaleString()}</div>
              </div>
            }
          />
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
        if (loading || !stats) return <div className="h-24 bg-slate-100 animate-pulse rounded-2xl"></div>;
        const { salesToday, target, percentage } = stats.lichigueria;
        const pending = Math.max(0, 100 - percentage);

        return (
          <DoughnutChart
            totalValue={`${percentage}%`}
            totalLabel="Meta"
            segments={[
              { value: percentage, color: '#f59e0b' }, // Ventas hoy - Ámbar/Naranja
              { value: pending, color: '#cbd5e1' } // Pendiente - Gris
            ]}
            legend={
              <div className="space-y-1 text-[11px] leading-tight">
                <div className="text-slate-500 font-semibold uppercase tracking-wider text-[9px]">Ventas de hoy</div>
                <div className="text-slate-800 font-bold text-sm truncate">${salesToday.toLocaleString()}</div>
                <div className="text-slate-400 text-[10px]">Meta: ${target.toLocaleString()}</div>
              </div>
            }
          />
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.path}
              to={card.path}
              className={`group relative bg-white p-6 rounded-2xl border border-slate-150/60 shadow-xs hover:shadow-md ${card.borderHover} active:scale-[0.99] transition-all flex flex-col justify-between h-[360px]`}
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

              {/* Gráfico circular de progreso (Doughnut Chart) */}
              <div className="my-3">
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
