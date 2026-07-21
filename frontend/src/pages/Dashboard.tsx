import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Building2, 
  UtensilsCrossed, 
  Leaf, 
  ArrowRight 
} from 'lucide-react';

export default function Dashboard() {
  const cards = [
    {
      title: 'Hotel 1',
      description: 'Gestión de habitaciones, tarifas, huéspedes y transacciones.',
      icon: Building2,
      path: '/hotel-1',
      color: 'bg-emerald-500 text-white border-emerald-600 shadow-sm shadow-emerald-100',
      badge: 'Hotelero',
      borderHover: 'hover:border-emerald-500 hover:shadow-emerald-100/50'
    },
    {
      title: 'Hotel 2',
      description: 'Administración independiente para el segundo hotel.',
      icon: Building2,
      path: '/hotel-2',
      color: 'bg-teal-500 text-white border-teal-600 shadow-sm shadow-teal-100',
      badge: 'Hotelero',
      borderHover: 'hover:border-teal-500 hover:shadow-teal-100/50'
    },
    {
      title: 'Restaurante',
      description: 'Registro rápido de ventas, egresos diarios y balances.',
      icon: UtensilsCrossed,
      path: '/restaurante',
      color: 'bg-rose-500 text-white border-rose-600 shadow-sm shadow-rose-100',
      badge: 'Gastronomía',
      borderHover: 'hover:border-rose-500 hover:shadow-rose-100/50'
    },
    {
      title: 'Lichiguería',
      description: 'Gestión de proveedores locales y ventas rápidas con pesaje.',
      icon: Leaf,
      path: '/lichigueria',
      color: 'bg-amber-500 text-white border-amber-600 shadow-sm shadow-amber-100',
      badge: 'Abastecimiento',
      borderHover: 'hover:border-amber-500 hover:shadow-amber-100/50'
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
              className={`group relative bg-white p-8 rounded-2xl border border-slate-150/60 shadow-xs hover:shadow-md ${card.borderHover} active:scale-[0.99] transition-all flex flex-col justify-between h-64`}
            >
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className={`p-4 rounded-2xl border ${card.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full">
                    {card.badge}
                  </span>
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-semibold text-slate-800 group-hover:text-slate-900">
                    {card.title}
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed max-w-xs">
                    {card.description}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 text-sm font-medium text-slate-600 group-hover:text-slate-900 self-start">
                <span>Ingresar al módulo</span>
                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
