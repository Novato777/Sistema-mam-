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
  ArrowRight,
  Phone,
  Mail,
  MapPin
} from 'lucide-react';

// Tecnologías que se muestran en el Footer (del sitio de NeXo)
const techList = [
  { name: "React", color: "text-sky-400" },
  { name: "Vite", color: "text-yellow-400" },
  { name: "Tailwind CSS", color: "text-cyan-400" },
  { name: "JavaScript", color: "text-amber-400" },
  { name: "Node.js", color: "text-emerald-500" },
  { name: "Express", color: "text-slate-300" },
  { name: "PostgreSQL", color: "text-sky-500" },
  { name: "MongoDB", color: "text-emerald-600" },
  { name: "Vercel", color: "text-white" },
  { name: "Render", color: "text-indigo-400" },
  { name: "Git", color: "text-orange-500" }
];

export default function Landing() {
  const whatsappNumber = "573222067870";
  const whatsappDisplay = "322 206 7870";
  const email = "cardozobrayan334@gmail.com";
  const location = "La Dorada, Caldas";
  const developer = "Brayan Cardozo";
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
    "Hola NeXo, vi su página web y me interesa una cotización."
  )}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans relative overflow-hidden flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Luces y esferas de brillo premium de fondo */}
      <div className="absolute top-[-10%] left-[-5%] w-[550px] h-[550px] bg-indigo-600/10 rounded-full blur-[140px] -z-10 pointer-events-none"></div>
      <div className="absolute top-[30%] right-[-10%] w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[140px] -z-10 pointer-events-none"></div>
      <div className="absolute bottom-[-5%] left-[10%] w-[500px] h-[500px] bg-emerald-600/10 rounded-full blur-[140px] -z-10 pointer-events-none"></div>

      {/* Cabecera / Navbar */}
      <header className="max-w-7xl mx-auto w-full px-6 py-6 flex items-center justify-between border-b border-slate-900/60 sticky top-0 bg-slate-950/70 backdrop-blur-md z-50">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-lg blur-xs opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
            <img src="/favicon.png" alt="Logo" className="relative w-9 h-9 object-contain rounded-lg border border-slate-700/50 bg-slate-900 shadow-md" />
          </div>
          <span className="font-black text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Mamá Admin
          </span>
        </div>
        <Link 
          to="/login"
          className="relative group overflow-hidden px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm shadow-lg shadow-indigo-500/25 transition-all active:scale-[0.98] flex items-center space-x-1.5"
        >
          <span>Ingresar</span>
          <ArrowRight className="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </header>

      {/* Sección Hero */}
      <main className="max-w-7xl mx-auto w-full px-6 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center flex-1">
        
        {/* Presentación - Izquierda */}
        <div className="lg:col-span-6 space-y-8 text-left">
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-xs font-black uppercase tracking-widest">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Desarrollo de Software Exclusivo</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-none">
            Administración <br />
            Empresarial <br />
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
              Ingresar al Sistema
            </Link>
            <div className="inline-flex items-center justify-center space-x-2.5 px-5 py-3 border border-slate-800 bg-slate-900/50 rounded-2xl text-slate-400 text-sm font-semibold select-none">
              <ShieldCheck className="w-4.5 h-4.5 text-emerald-400" />
              <span>Acceso Seguro y Encriptado</span>
            </div>
          </div>
        </div>

        {/* Tarjetas de Módulos - Derecha */}
        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
          
          <div className="p-6 bg-slate-900/40 border border-slate-800/80 rounded-3xl space-y-4 hover:border-indigo-500/40 transition-all hover:shadow-[0_15px_30px_-10px_rgba(99,102,241,0.08)] group">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-2xl w-fit">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-lg">Módulo Hotelero</h3>
            <p className="text-slate-450 text-xs leading-relaxed font-medium">
              Control de habitaciones, asignación de huéspedes, cronograma de próximos pagos y alertas de morosidad en tiempo real.
            </p>
          </div>

          <div className="p-6 bg-slate-900/40 border border-slate-800/80 rounded-3xl space-y-4 hover:border-rose-500/40 transition-all hover:shadow-[0_15px_30px_-10px_rgba(244,63,94,0.08)] group">
            <div className="p-3 bg-rose-500/10 text-rose-450 border border-rose-500/20 rounded-2xl w-fit">
              <UtensilsCrossed className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-lg">Gastronomía</h3>
            <p className="text-slate-450 text-xs leading-relaxed font-medium">
              Ventas rápidas de restaurante, control de métodos de pago (Efectivo/Transferencia) y reporte diario de caja.
            </p>
          </div>

          <div className="p-6 bg-slate-900/40 border border-slate-800/80 rounded-3xl space-y-4 hover:border-amber-500/40 transition-all hover:shadow-[0_15px_30px_-10px_rgba(245,158,11,0.08)] group">
            <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-2xl w-fit">
              <Leaf className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-lg">Lichiguería</h3>
            <p className="text-slate-450 text-xs leading-relaxed font-medium">
              Gestión de proveedores locales, registro por pesaje e inventario simplificado para máxima agilidad comercial.
            </p>
          </div>

          <div className="p-6 bg-slate-900/40 border border-slate-800/80 rounded-3xl space-y-4 hover:border-emerald-500/40 transition-all hover:shadow-[0_15px_30px_-10px_rgba(16,185,129,0.08)] group">
            <div className="p-3 bg-emerald-500/10 text-emerald-450 border border-emerald-500/20 rounded-2xl w-fit">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-lg">Reportes PDF</h3>
            <p className="text-slate-450 text-xs leading-relaxed font-medium">
              Generación de informes de venta e historiales financieros en formato PDF de alta velocidad, listos para descargar.
            </p>
          </div>

        </div>

      </main>

      {/* FOOTER IMPORTADO DEL PORTAFOLIO DE NeXo */}
      <footer className="relative overflow-hidden border-t border-slate-800 bg-slate-950">
        {/* Línea de acento superior */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />

        {/* Carrusel/Grid de tecnologías */}
        <div className="border-b border-slate-900 py-10">
          <p className="mb-6 text-center text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
            Tecnologías que usamos
          </p>
          <div className="max-w-6xl mx-auto px-6 flex flex-wrap justify-center gap-3">
            {techList.map((tech) => (
              <span 
                key={tech.name} 
                className={`px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800/80 text-xs font-semibold ${tech.color} shadow-xs select-none hover:scale-105 transition-all`}
              >
                {tech.name}
              </span>
            ))}
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
            
            {/* Columna 1: Marca NeXo */}
            <div className="lg:col-span-1 space-y-4">
              <a href="#inicio" className="flex items-center gap-3">
                <span className="text-3xl font-black tracking-tight text-white">
                  Ne<span className="text-cyan-400">X</span>o
                </span>
              </a>
              <p className="max-w-xs text-sm leading-relaxed text-slate-400 font-medium">
                Impulsamos tu negocio al siguiente nivel. Desarrollo de software y web para negocios que quieren crecer.
              </p>
            </div>

            {/* Columna 2: Navegación */}
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wider text-white">
                Navegación
              </h4>
              <ul className="mt-4 space-y-2 text-sm font-medium">
                <li>
                  <a href="#inicio" className="text-slate-400 hover:text-cyan-400 transition-colors">Inicio</a>
                </li>
                <li>
                  <a href="#servicios" className="text-slate-400 hover:text-cyan-400 transition-colors">Servicios</a>
                </li>
                <li>
                  <a href="#portafolio" className="text-slate-400 hover:text-cyan-400 transition-colors">Portafolio</a>
                </li>
                <li>
                  <a href="#contacto" className="text-slate-400 hover:text-cyan-400 transition-colors">Contacto</a>
                </li>
              </ul>
            </div>

            {/* Columna 3: Servicios */}
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wider text-white">
                Servicios
              </h4>
              <ul className="mt-4 space-y-2 text-sm font-medium text-slate-450">
                <li>Páginas web</li>
                <li>Sistemas a medida</li>
                <li>Automatizaciones</li>
                <li>Soporte y mantenimiento</li>
              </ul>
            </div>

            {/* Columna 4: Contacto */}
            <div>
              <h4 className="text-sm font-bold uppercase tracking-wider text-white">
                Contacto
              </h4>
              <ul className="mt-4 space-y-3 text-sm font-medium">
                <li>
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-2.5 text-slate-400 hover:text-cyan-400 transition-colors"
                  >
                    <Phone className="h-4.5 w-4.5 text-cyan-450" />
                    <span>{whatsappDisplay}</span>
                  </a>
                </li>
                <li>
                  <a
                    href={`mailto:${email}`}
                    className="group flex items-center gap-2.5 text-slate-400 hover:text-cyan-400 transition-colors"
                  >
                    <Mail className="h-4.5 w-4.5 text-cyan-450" />
                    <span className="truncate">{email}</span>
                  </a>
                </li>
                <li className="flex items-center gap-2.5 text-slate-400">
                  <MapPin className="h-4.5 w-4.5 text-cyan-450" />
                  <span>{location}</span>
                </li>
              </ul>
            </div>

          </div>
        </div>

        {/* Barra inferior */}
        <div className="border-t border-slate-900 bg-slate-950/60">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-5 text-sm font-medium text-slate-500 sm:flex-row">
            <p>© 2026 NeXo. Todos los derechos reservados.</p>
            <p>
              Diseñado y desarrollado por{" "}
              <span className="font-semibold text-slate-350">{developer}</span>
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
