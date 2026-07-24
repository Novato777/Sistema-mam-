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

function DoughnutChart({ 
  percentage, 
  color, 
  backgroundColor = "#e2e8f0",
  totalLabel, 
  totalValue,
  legend
}: { 
  percentage: number; 
  color: string; 
  backgroundColor?: string;
  totalLabel: string; 
  totalValue: string | number;
  legend: React.ReactNode;
}) {
  const radius = 36;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius; // ~226.2
  const center = 50;
  
  // Calcular el offset de la barra de progreso
  const strokeOffset = circumference - (Math.min(100, Math.max(0, percentage)) / 100) * circumference;

  return (
    <div className="flex items-center space-x-5 bg-white/45 dark:bg-slate-800/60 backdrop-blur-xs p-4 rounded-2xl border border-slate-100/80 dark:border-slate-700/50 shadow-xs">
      <div className="relative w-24 h-24 flex-shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
          {/* Círculo de fondo base */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke={backgroundColor}
            strokeWidth={strokeWidth}
            className="dark:opacity-30"
          />
          {/* Círculo de progreso de color en la parte superior */}
          {percentage > 0 && (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          )}
        </svg>
        {/* Texto en el Centro */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-lg font-black text-slate-800 dark:text-slate-100 leading-none">{totalValue}</span>
          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-widest mt-0.5">{totalLabel}</span>
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

          // Metas de venta diaria incrementadas por solicitud del usuario
          const restTarget = 500000;  // $500.000 diario
          const lichiTarget = 300000; // $300.000 diario

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
              salesToday: Number(restData.today.sales || 0),
              target: restTarget,
              percentage: Math.min(100, Math.round((Number(restData.today.sales || 0) / restTarget) * 100))
            },
            lichigueria: {
              salesToday: Number(lichiData.today.sales || 0),
              target: lichiTarget,
              percentage: Math.min(100, Math.round((Number(lichiData.today.sales || 0) / lichiTarget) * 100))
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
      color: 'bg-emerald-500 text-white border-emerald-600 shadow-lg shadow-emerald-100 dark:shadow-none',
      badge: 'Hotelero',
      borderHover: 'hover:border-emerald-250 hover:shadow-[0_20px_40px_-15px_rgba(16,185,129,0.18)] dark:hover:border-emerald-500',
      borderTop: 'border-t-4 border-t-emerald-500',
      renderProgress: () => {
        if (loading || !stats) return <div className="h-24 bg-slate-100/50 dark:bg-slate-800/50 animate-pulse rounded-2xl"></div>;
        const { occupied, total, percentage } = stats.hotel1;
        const free = total - occupied;
        
        return (
          <DoughnutChart
            totalValue={total}
            totalLabel="Habs"
            percentage={percentage}
            color="#f43f5e" // Ocupadas - Rojo
            backgroundColor="#10b981" // Libres - Verde de fondo base
            legend={
              <div className="space-y-2 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-sm"></span>
                  <span className="text-slate-600 dark:text-slate-300 font-medium truncate">Libres: <b className="text-slate-800 dark:text-slate-100 font-semibold">{free}</b></span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-sm"></span>
                  <span className="text-slate-600 dark:text-slate-300 font-medium truncate">Ocupadas: <b className="text-slate-800 dark:text-slate-100 font-semibold">{occupied}</b></span>
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
      color: 'bg-teal-500 text-white border-teal-600 shadow-lg shadow-teal-100 dark:shadow-none',
      badge: 'Hotelero',
      borderHover: 'hover:border-teal-250 hover:shadow-[0_20px_40px_-15px_rgba(13,148,136,0.18)] dark:hover:border-teal-500',
      borderTop: 'border-t-4 border-t-teal-500',
      renderProgress: () => {
        if (loading || !stats) return <div className="h-24 bg-slate-100/50 dark:bg-slate-800/50 animate-pulse rounded-2xl"></div>;
        const { occupied, total, percentage } = stats.hotel2;
        const free = total - occupied;

        return (
          <DoughnutChart
            totalValue={total}
            totalLabel="Habs"
            percentage={percentage}
            color="#f43f5e" // Ocupadas - Rojo
            backgroundColor="#0d9488" // Libres - Teal de fondo base
            legend={
              <div className="space-y-2 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block shadow-sm"></span>
                  <span className="text-slate-600 dark:text-slate-300 font-medium truncate">Libres: <b className="text-slate-800 dark:text-slate-100 font-semibold">{free}</b></span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-sm"></span>
                  <span className="text-slate-600 dark:text-slate-300 font-medium truncate">Ocupadas: <b className="text-slate-800 dark:text-slate-100 font-semibold">{occupied}</b></span>
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
      color: 'bg-rose-500 text-white border-rose-600 shadow-lg shadow-rose-100 dark:shadow-none',
      badge: 'Gastronomía',
      borderHover: 'hover:border-rose-250 hover:shadow-[0_20px_40px_-15px_rgba(244,63,94,0.18)] dark:hover:border-rose-500',
      borderTop: 'border-t-4 border-t-rose-500',
      renderProgress: () => {
        if (loading || !stats) return <div className="h-24 bg-slate-100/50 dark:bg-slate-800/50 animate-pulse rounded-2xl"></div>;
        const { salesToday, target, percentage } = stats.restaurante;

        return (
          <DoughnutChart
            totalValue={`${percentage}%`}
            totalLabel="Meta"
            percentage={percentage}
            color="#ec4899" // Rosa vibrante para progreso
            backgroundColor="#e2e8f0" // Gris base para pendiente
            legend={
              <div className="space-y-1 text-[11px] leading-tight">
                <div className="text-slate-450 dark:text-slate-400 font-bold uppercase tracking-wider text-[9px]">Ventas de hoy</div>
                <div className="text-slate-850 dark:text-slate-100 font-extrabold text-base truncate">${Number(salesToday || 0).toLocaleString('de-DE')}</div>
                <div className="text-slate-400 dark:text-slate-400 text-[10px]">Meta: ${Number(target || 0).toLocaleString('de-DE')}</div>
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
      color: 'bg-amber-500 text-white border-amber-600 shadow-lg shadow-amber-100 dark:shadow-none',
      badge: 'Abastecimiento',
      borderHover: 'hover:border-amber-250 hover:shadow-[0_20px_40px_-15px_rgba(245,158,11,0.18)] dark:hover:border-amber-500',
      borderTop: 'border-t-4 border-t-amber-500',
      renderProgress: () => {
        if (loading || !stats) return <div className="h-24 bg-slate-100/50 dark:bg-slate-800/50 animate-pulse rounded-2xl"></div>;
        const { salesToday, target, percentage } = stats.lichigueria;

        return (
          <DoughnutChart
            totalValue={`${percentage}%`}
            totalLabel="Meta"
            percentage={percentage}
            color="#f59e0b" // Ámbar para progreso
            backgroundColor="#e2e8f0" // Gris base para pendiente
            legend={
              <div className="space-y-1 text-[11px] leading-tight">
                <div className="text-slate-450 dark:text-slate-400 font-bold uppercase tracking-wider text-[9px]">Ventas de hoy</div>
                <div className="text-slate-850 dark:text-slate-100 font-extrabold text-base truncate">${Number(salesToday || 0).toLocaleString('de-DE')}</div>
                <div className="text-slate-400 dark:text-slate-400 text-[10px]">Meta: ${Number(target || 0).toLocaleString('de-DE')}</div>
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
      <div className="absolute top-[-10%] left-[-15%] w-[350px] h-[350px] bg-indigo-200/35 dark:bg-indigo-900/20 rounded-full blur-[90px] -z-10 pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[350px] h-[350px] bg-teal-200/25 dark:bg-teal-900/20 rounded-full blur-[100px] -z-10 pointer-events-none"></div>

      <div className="space-y-2">
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-900 dark:from-white dark:via-indigo-200 dark:to-indigo-300 bg-clip-text text-transparent">
          Hola, Administrador
        </h1>
        <p className="text-slate-500 dark:text-slate-400 max-w-lg font-medium text-sm leading-relaxed">
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
              className={`group relative bg-white/70 dark:bg-slate-900/90 backdrop-blur-md p-7 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:-translate-y-1.5 transition-all flex flex-col justify-between h-[390px] ${card.borderTop} ${card.borderHover}`}
            >
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className={`p-3.5 rounded-2xl border ${card.color}`}>
                    <Icon className="w-5.5 h-5.5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-3.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-300 rounded-full shadow-2xs">
                    {card.badge}
                  </span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-950 dark:group-hover:text-indigo-300 transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-xs text-slate-450 dark:text-slate-400 leading-relaxed max-w-xs font-medium">
                    {card.description}
                  </p>
                </div>
              </div>

              {/* Gráfico circular */}
              <div className="my-2">
                {card.renderProgress()}
              </div>
              
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-650 dark:text-slate-300 group-hover:text-indigo-650 dark:group-hover:text-indigo-400 transition-all self-start">
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
