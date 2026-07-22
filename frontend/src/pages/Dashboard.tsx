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
  const circumference = 2 * Math.PI * radius;
  const center = 50;

  const activeSegments = segments.filter(seg => seg.value > 0);
  let accumulatedPercentage = 0;

  return (
    <div className="flex items-center space-x-5 bg-white/40 backdrop-blur-xs p-4 rounded-2xl border border-slate-100/80 shadow-xs">
      <div className="relative w-24 h-24 flex-shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
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
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-lg font-black text-slate-800 leading-none">{totalValue}</span>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{totalLabel}</span>
        </div>
      </div>
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
      color: 'bg-emerald-500 text-white border-emerald-600 shadow-lg shadow-emerald-100',
      badge: 'Hotelero',
      borderHover: 'hover:border-emerald-250 hover:shadow-[0_20px_40px_-15px_rgba(16,185,129,0.18)]',
      borderTop: 'border-t-4 border-t-emerald-500',
      renderProgress: () => {
        if (loading || !stats) return <div className="h-24 bg-slate-100/50 animate-pulse rounded-2xl"></div>;
        const { occupied, total, percentage } = stats.hotel1;
        const free = total - occupied;
        const freePercentage = total ? Math.round((free / total) * 100) : 0;
        
        return (
          <DoughnutChart
            totalValue={total}
            totalLabel="Habs"
            segments={[
              { value: percentage, color: '#f43f5e' },
              { value: freePercentage, color: '#10b981' }
            ]}
            legend={
              <div className="space-y-2 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-sm"></span>
                  <span className="text-slate-600 font-medium truncate">Libres: <b className="text-slate-800 font-semibold">{free}</b></span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-sm"></span>
                  <span className="text-slate-600 font-medium truncate">Ocupadas: <b className="text-slate-800 font-semibold">{occupied}</b></span>
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
      color: 'bg-teal-500 text-white border-teal-600 shadow-lg shadow-teal-100',
      badge: 'Hotelero',
      borderHover: 'hover:border-teal-250 hover:shadow-[0_20px_40px_-15px_rgba(13,148,136,0.18)]',
      borderTop: 'border-t-4 border-t-teal-500',
      renderProgress: () => {
        if (loading || !stats) return <div className="h-24 bg-slate-100/50 animate-pulse rounded-2xl"></div>;
        const { occupied, total, percentage } = stats.hotel2;
        const free = total - occupied;
        const freePercentage = total ? Math.round((free / total) * 100) : 0;

        return (
          <DoughnutChart
            totalValue={total}
            totalLabel="Habs"
            segments={[
              { value: percentage, color: '#f43f5e' },
              { value: freePercentage, color: '#0d9488' }
            ]}
            legend={
              <div className="space-y-2 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block shadow-sm"></span>
                  <span className="text-slate-600 font-medium truncate">Libres: <b className="text-slate-800 font-semibold">{free}</b></span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-sm"></span>
                  <span className="text-slate-600 font-medium truncate">Ocupadas: <b className="text-slate-800 font-semibold">{occupied}</b></span>
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
      color: 'bg-rose-500 text-white border-rose-600 shadow-lg shadow-rose-100',
      badge: 'Gastronomía',
      borderHover: 'hover:border-rose-250 hover:shadow-[0_20px_40px_-15px_rgba(244,63,94,0.18)]',
      borderTop: 'border-t-4 border-t-rose-500',
      renderProgress: () => {
        if (loading || !stats) return <div className="h-24 bg-slate-100/50 animate-pulse rounded-2xl"></div>;
        const { salesToday, target, percentage } = stats.restaurante;
        const pending = Math.max(0, 100 - percentage);

        return (
          <DoughnutChart
            totalValue={`${percentage}%`}
            totalLabel="Meta"
            segments={[
              { value: percentage, color: '#ec4899' },
              { value: pending, color: '#cbd5e1' }
            ]}
            legend={
              <div className="space-y-1 text-[11px] leading-tight">
                <div className="text-slate-450 font-bold uppercase tracking-wider text-[9px]">Ventas de hoy</div>
                <div className="text-slate-850 font-extrabold text-base truncate">${Number(salesToday || 0).toLocaleString('de-DE')}</div>
                <div className="text-slate-400 text-[10px]">Meta: ${Number(target || 0).toLocaleString('de-DE')}</div>
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
      color: 'bg-amber-500 text-white border-amber-600 shadow-lg shadow-amber-100',
      badge: 'Abastecimiento',
      borderHover: 'hover:border-amber-250 hover:shadow-[0_20px_40px_-15px_rgba(245,158,11,0.18)]',
      borderTop: 'border-t-4 border-t-amber-500',
      renderProgress: () => {
        if (loading || !stats) return <div className="h-24 bg-slate-100/50 animate-pulse rounded-2xl"></div>;
        const { salesToday, target, percentage } = stats.lichigueria;
        const pending = Math.max(0, 100 - percentage);

        return (
          <DoughnutChart
            totalValue={`${percentage}%`}
            totalLabel="Meta"
            segments={[
              { value: percentage, color: '#f59e0b' },
              { value: pending, color: '#cbd5e1' }
            ]}
            legend={
              <div className="space-y-1 text-[11px] leading-tight">
                <div className="text-slate-450 font-bold uppercase tracking-wider text-[9px]">Ventas de hoy</div>
                <div className="text-slate-850 font-extrabold text-base truncate">${Number(salesToday || 0).toLocaleString('de-DE')}</div>
                <div className="text-slate-400 text-[10px]">Meta: ${Number(target || 0).toLocaleString('de-DE')}</div>
              </div>
            }
          />
        );
      }
    }
  ];

  return (
    <div className="relative space-y-8 animate-fade-in">
      {/* Elementos decorativos de fondo tipo Glow Blobs */}
      <div className="absolute top-[-10%] left-[-15%] w-[350px] h-[350px] bg-indigo-200/35 rounded-full blur-[90px] -z-10 pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[350px] h-[350px] bg-teal-200/25 rounded-full blur-[100px] -z-10 pointer-events-none"></div>

      <div className="space-y-2">
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-900 bg-clip-text text-transparent">
          Hola, Administrador
        </h1>
        <p className="text-slate-500 max-w-lg font-medium text-sm leading-relaxed">
          Selecciona uno de los módulos a continuación para empezar a gestionar los negocios familiares de forma inteligente.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.path}
              to={card.path}
              className={`group relative bg-white/70 backdrop-blur-md p-7 rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:-translate-y-1.5 transition-all flex flex-col justify-between h-[390px] ${card.borderTop} ${card.borderHover}`}
            >
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className={`p-3.5 rounded-2xl border ${card.color}`}>
                    <Icon className="w-5.5 h-5.5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-3.5 py-1.5 bg-slate-50 border border-slate-100 text-slate-500 rounded-full shadow-2xs">
                    {card.badge}
                  </span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-800 group-hover:text-indigo-950 transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-xs text-slate-450 leading-relaxed max-w-xs font-medium">
                    {card.description}
                  </p>
                </div>
              </div>

              {/* Gráfico circular */}
              <div className="my-2">
                {card.renderProgress()}
              </div>
              
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-650 group-hover:text-indigo-650 transition-all self-start">
                <span>Ingresar al módulo</span>
                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1.5 transition-transform" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
