import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Building2, 
  UtensilsCrossed, 
  Leaf, 
  FileText, 
  ShieldCheck, 
  Cpu, 
  Sparkles,
  ArrowRight
} from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans relative overflow-hidden flex flex-col justify-between">
      {/* Glow Blobs de Fondo */}
      <div className="absolute top-[-10%] left-[-10%] w-[450px] h-[450px] bg-indigo-500/10 rounded-full blur-[130px] -z-10"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[450px] h-[450px] bg-emerald-500/10 rounded-full blur-[130px] -z-10"></div>

      {/* Navbar Superior */}
      <header className="max-w-7xl mx-auto w-full px-6 py-6 flex items-center justify-between border-b border-slate-800/60">
        <div className="flex items-center space-x-3">
          <img src="/favicon.png" alt="Logo" className="w-9 h-9 object-contain rounded-lg border border-slate-700/60 shadow-md" />
          <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Sistema Administrador
          </span>
        </div>
        <Link 
          to="/login"
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center space-x-1.5"
        >
          <span>Ingresar</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto w-full px-6 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center flex-1">
        
        {/* Info Izquierda */}
        <div className="lg:col-span-6 space-y-8">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Desarrollo de Software Exclusivo</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
            Gestión Inteligente y <br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
              a la Medida
            </span>
          </h1>

          <p className="text-slate-400 text-base sm:text-lg leading-relaxed max-w-xl font-medium">
            Esta plataforma representa un **software desarrollado a medida**, adaptado con precisión milimétrica según los flujos de trabajo, necesidades y requerimientos específicos del cliente. Sin licenciamientos innecesarios, ligero y optimizado para potenciar los negocios familiares en tiempo real.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 pt-2">
            <Link 
              to="/login"
              className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-650 text-white font-bold rounded-2xl text-base shadow-xl shadow-indigo-650/30 transition-all hover:scale-[1.02] active:scale-[0.98] text-center"
            >
              Iniciar Sesión
            </Link>
            <div className="inline-flex items-center justify-center space-x-2 px-5 py-3 border border-slate-800 bg-slate-850/50 rounded-2xl text-slate-350 text-sm font-semibold select-none">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Acceso Seguro y Encriptado</span>
            </div>
          </div>
        </div>

        {/* Módulos Derecha */}
        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          <div className="p-6 bg-slate-850/60 border border-slate-800/80 rounded-3xl space-y-4 hover:border-indigo-500/30 transition-all group">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-2xl w-fit">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-lg">Módulo Hotelero</h3>
            <p className="text-slate-450 text-xs leading-relaxed font-medium">
              Control de habitaciones, asignación de huéspedes, cronograma de próximos pagos y alertas de morosidad en tiempo real.
            </p>
          </div>

          <div className="p-6 bg-slate-850/60 border border-slate-800/80 rounded-3xl space-y-4 hover:border-emerald-500/30 transition-all group">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl w-fit">
              <UtensilsCrossed className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-lg">Gastronomía</h3>
            <p className="text-slate-450 text-xs leading-relaxed font-medium">
              Ventas rápidas de restaurante, control de métodos de pago (Efectivo/Transferencia) y reporte diario de caja.
            </p>
          </div>

          <div className="p-6 bg-slate-850/60 border border-slate-800/80 rounded-3xl space-y-4 hover:border-amber-500/30 transition-all group">
            <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-2xl w-fit">
              <Leaf className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-lg">Lichiguería</h3>
            <p className="text-slate-450 text-xs leading-relaxed font-medium">
              Gestión de proveedores locales, registro por pesaje e inventario simplificado para máxima agilidad comercial.
            </p>
          </div>

          <div className="p-6 bg-slate-850/60 border border-slate-800/80 rounded-3xl space-y-4 hover:border-purple-500/30 transition-all group">
            <div className="p-3 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-2xl w-fit">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-lg">Reportes PDF</h3>
            <p className="text-slate-450 text-xs leading-relaxed font-medium">
              Generación de informes de venta e historiales financieros en formato PDF de alta velocidad, listos para descargar.
            </p>
          </div>

        </div>

      </main>

      {/* Beneficios a Medida / Footer */}
      <section className="bg-slate-950/80 border-t border-slate-900 py-10">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-6 text-center md:text-left">
          
          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 bg-slate-900 rounded-xl text-indigo-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">Arquitectura Ligera</h4>
              <p className="text-slate-450 text-xs mt-0.5 font-medium">Despliegue ultra rápido y mínimo consumo de recursos.</p>
            </div>
          </div>

          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 bg-slate-900 rounded-xl text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">Privacidad Total</h4>
              <p className="text-slate-450 text-xs mt-0.5 font-medium">Tus datos en tu control absoluto, sin analíticas externas.</p>
            </div>
          </div>

          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 bg-slate-900 rounded-xl text-amber-450">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">Diseño de Portafolio</h4>
              <p className="text-slate-450 text-xs mt-0.5 font-medium">Un proyecto a medida premium para destacar en portafolio.</p>
            </div>
          </div>

        </div>
        <div className="max-w-7xl mx-auto px-6 text-center text-[10px] text-slate-650 mt-8">
          © {new Date().getFullYear()} Sistema Administrador Familiar a Medida. Desarrollado con tecnología moderna.
        </div>
      </section>

    </div>
  );
}
