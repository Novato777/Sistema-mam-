import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Building2, 
  UtensilsCrossed, 
  Leaf, 
  FileText, 
  ShieldCheck, 
  Sparkles,
  ArrowRight
} from 'lucide-react';
import {
  SiReact,
  SiVite,
  SiTailwindcss,
  SiJavascript,
  SiNodedotjs,
  SiExpress,
  SiPostgresql,
  SiMongodb,
  SiVercel,
  SiRender,
  SiCloudinary,
  SiGit,
  SiThreedotjs,
  SiGreensock,
  SiHtml5,
  SiCss
} from "react-icons/si";

// Lista de tecnologías para el Loop
const techLogos = [
  { node: <SiReact />, title: "React", href: "https://react.dev" },
  { node: <SiVite />, title: "Vite", href: "https://vite.dev" },
  { node: <SiTailwindcss />, title: "Tailwind CSS", href: "https://tailwindcss.com" },
  { node: <SiJavascript />, title: "JavaScript", href: "https://developer.mozilla.org/docs/Web/JavaScript" },
  { node: <SiNodedotjs />, title: "Node.js", href: "https://nodejs.org" },
  { node: <SiExpress />, title: "Express", href: "https://expressjs.com" },
  { node: <SiPostgresql />, title: "PostgreSQL", href: "https://www.postgresql.org" },
  { node: <SiMongodb />, title: "MongoDB", href: "https://www.mongodb.com" },
  { node: <SiVercel />, title: "Vercel", href: "https://vercel.com" },
  { node: <SiRender />, title: "Render", href: "https://render.com" },
  { node: <SiCloudinary />, title: "Cloudinary", href: "https://cloudinary.com" },
  { node: <SiGit />, title: "Git", href: "https://git-scm.com" },
  { node: <SiThreedotjs />, title: "Three.js", href: "https://threejs.org" },
  { node: <SiGreensock />, title: "GSAP", href: "https://gsap.com" },
  { node: <SiHtml5 />, title: "HTML5", href: "https://developer.mozilla.org/docs/Web/HTML" },
  { node: <SiCss />, title: "CSS3", href: "https://developer.mozilla.org/docs/Web/CSS" }
];

export default function Landing() {
  const whatsappNumber = "573222067870";
  const whatsappDisplay = "322 206 7870";
  const email = "cardozobrayan334@gmail.com";
  const location = "La Dorada, Caldas";
  const developer = "Brayan Cardozo";
  const slogan = "Impulsamos tu negocio al siguiente nivel.";
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
    "Hola NeXo, vi su página web y me interesa una cotización."
  )}`;

  return (
    <div 
      className="min-h-screen text-slate-100 font-sans relative overflow-hidden flex flex-col justify-between selection:bg-indigo-500 selection:text-white"
      style={{
        backgroundColor: '#02040a',
        backgroundImage: `
          radial-gradient(circle at 75% 30%, rgba(99, 102, 241, 0.20), transparent 60%),
          radial-gradient(circle at 20% 25%, rgba(99, 102, 241, 0.10), transparent 50%),
          radial-gradient(circle at 80% 80%, rgba(16, 185, 129, 0.05), transparent 50%),
          linear-gradient(rgba(255, 255, 255, 0.007) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.007) 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 100% 100%, 100% 100%, 32px 32px, 32px 32px'
      }}
    >
      {/* Imagen de fondo cinematográfica - ALINEADA A LA DERECHA Y DIFUMINADA A LA IZQUIERDA */}
      <div 
        className="absolute top-0 right-0 z-0 pointer-events-none overflow-hidden h-[750px] md:h-[950px] w-full md:w-[60%] lg:w-[50%]"
        style={{
          maskImage: 'linear-gradient(to left, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)',
          WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)'
        }}
      >
        <img 
          src="/fondoPAGE.png" 
          alt="Background Banner" 
          className="w-full h-full object-cover opacity-60" 
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-955/60 to-slate-950"></div>
      </div>

      {/* Luces decorativas de fondo adicionales */}
      <div className="absolute top-[-10%] left-[-5%] w-[450px] h-[450px] bg-indigo-600/5 rounded-full blur-[130px] -z-10 pointer-events-none"></div>

      {/* Navbar Superior (Transparente sin fondos) */}
      <header className="max-w-7xl mx-auto w-full px-6 py-6 flex items-center justify-between border-b border-slate-900/30 sticky top-0 bg-transparent z-50">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-lg blur-xs opacity-75"></div>
            <img src="/favicon.png" alt="Logo" className="relative w-9 h-9 object-contain rounded-lg border border-slate-700/50 bg-slate-900 shadow-md" />
          </div>
          <span className="font-black text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            SystemPro
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

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto w-full px-6 pt-20 pb-16 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center relative z-10">
        
        {/* Info Izquierda */}
        <div className="lg:col-span-7 space-y-8">
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-xs font-semibold uppercase tracking-widest">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>Desarrollo de Software Exclusivo</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Software de Gestión <br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent font-black">
              Altamente Personalizado
            </span>
          </h1>

          <p className="text-slate-450 text-base sm:text-lg leading-relaxed max-w-xl font-medium">
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

        {/* Columna derecha vacía para apreciar la imagen de fondo */}
        <div className="lg:col-span-5 h-[100px] lg:h-auto"></div>
      </main>

      {/* Sección de Cards al Fondo (Abajo de la Hero con espaciado equilibrado) */}
      <section className="max-w-7xl mx-auto w-full px-6 mt-8 mb-24 relative z-10">
        <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500 mb-8 text-center lg:text-left">
          Módulos Integrados del Sistema
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          <div className="p-6 bg-slate-900/35 backdrop-blur-xs border border-slate-900 hover:border-indigo-500/30 rounded-3xl space-y-4 hover:-translate-y-1 transition-all duration-300 hover:shadow-[0_15px_30px_-10px_rgba(99,102,241,0.05)] group">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-2xl w-fit">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-lg group-hover:text-indigo-400 transition-colors">Módulo Hotelero</h3>
            <p className="text-slate-450 text-xs leading-relaxed font-medium">
              Control de habitaciones, asignación de huéspedes, cronograma de próximos pagos y alertas de morosidad en tiempo real.
            </p>
          </div>

          <div className="p-6 bg-slate-900/35 backdrop-blur-xs border border-slate-900 hover:border-rose-500/30 rounded-3xl space-y-4 hover:-translate-y-1 transition-all duration-300 hover:shadow-[0_15px_30px_-10px_rgba(244,63,94,0.05)] group">
            <div className="p-3 bg-rose-500/10 text-rose-45 border border-rose-500/20 rounded-2xl w-fit">
              <UtensilsCrossed className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-lg group-hover:text-rose-400 transition-colors">Gastronomía</h3>
            <p className="text-slate-450 text-xs leading-relaxed font-medium">
              Ventas rápidas de restaurante, control de métodos de pago (Efectivo/Transferencia) y reporte diario de caja.
            </p>
          </div>

          <div className="p-6 bg-slate-900/35 backdrop-blur-xs border border-slate-900 hover:border-amber-500/30 rounded-3xl space-y-4 hover:-translate-y-1 transition-all duration-300 hover:shadow-[0_15px_30px_-10px_rgba(245,158,11,0.05)] group">
            <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-2xl w-fit">
              <Leaf className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-lg group-hover:text-amber-400 transition-colors">Lichiguería</h3>
            <p className="text-slate-450 text-xs leading-relaxed font-medium">
              Gestión de proveedores locales, registro por pesaje e inventario simplificado para máxima agilidad comercial.
            </p>
          </div>

          <div className="p-6 bg-slate-900/35 backdrop-blur-xs border border-slate-900 hover:border-emerald-500/30 rounded-3xl space-y-4 hover:-translate-y-1 transition-all duration-300 hover:shadow-[0_15px_30px_-10px_rgba(16,185,129,0.05)] group">
            <div className="p-3 bg-emerald-500/10 text-emerald-455 border border-emerald-500/20 rounded-2xl w-fit">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-lg group-hover:text-emerald-400 transition-colors">Reportes PDF</h3>
            <p className="text-slate-450 text-xs leading-relaxed font-medium">
              Generación de informes de venta e historiales financieros en formato PDF de alta velocidad, listos para descargar.
            </p>
          </div>

        </div>
      </section>

      {/* FOOTER COPIADO TAL CUAL DE NEXU */}
      <footer className="relative overflow-hidden border-t border-[#1c2740] bg-[#060912]">
        {/* Línea de acento superior */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#22d3ee]/50 to-transparent" />

        {/* Carrusel de tecnologías */}
        <div className="border-b border-[#1c2740] py-12">
          <p className="mb-9 text-center text-sm font-semibold uppercase tracking-[0.3em] text-[#94a3b8]">
            Tecnologías que usamos
          </p>
          
          <div className="relative overflow-hidden w-full flex">
            {/* Degradados laterales para difuminar */}
            <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#060912] to-transparent z-10 pointer-events-none"></div>
            <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#060912] to-transparent z-10 pointer-events-none"></div>

            <div className="animate-marquee flex items-center gap-16 py-2 select-none">
              {/* Primer bloque */}
              {techLogos.map((tech, i) => (
                <a 
                  key={`t1-${i}`} 
                  href={tech.href} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-[#94a3b8] hover:text-white text-[32px] transition-all hover:scale-115 flex items-center justify-center"
                  title={tech.title}
                >
                  {tech.node}
                </a>
              ))}
              {/* Segundo bloque para bucle continuo */}
              {techLogos.map((tech, i) => (
                <a 
                  key={`t2-${i}`} 
                  href={tech.href} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-[#94a3b8] hover:text-white text-[32px] transition-all hover:scale-115 flex items-center justify-center"
                  title={tech.title}
                >
                  {tech.node}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Información Principal del Footer */}
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4">
            
            {/* Marca */}
            <div className="lg:col-span-1 space-y-5">
              <a href="#inicio" className="flex items-center gap-3">
                <img
                  src="/nexo-logo.png"
                  alt="Logo NeXo"
                  className="w-14 h-14 object-contain"
                  draggable={false}
                />
                <span className="text-4xl font-bold tracking-tight text-[#e8eefc]">
                  Ne<span className="text-[#22d3ee]">X</span>o
                </span>
              </a>
              <p className="max-w-xs text-base leading-relaxed text-[#94a3b8] font-medium">
                {slogan} Desarrollo de software y web para negocios que quieren crecer.
              </p>
            </div>

            {/* Navegación */}
            <div>
              <h4 className="text-base font-semibold uppercase tracking-wider text-[#e8eefc]">
                Navegación
              </h4>
              <ul className="mt-5 space-y-3 font-medium text-sm">
                <li>
                  <a href="#inicio" className="text-base text-[#94a3b8] transition-colors hover:text-[#22d3ee]">
                    Inicio
                  </a>
                </li>
                <li>
                  <a href="#servicios" className="text-base text-[#94a3b8] transition-colors hover:text-[#22d3ee]">
                    Servicios
                  </a>
                </li>
                <li>
                  <a href="#portafolio" className="text-base text-[#94a3b8] transition-colors hover:text-[#22d3ee]">
                    Portafolio
                  </a>
                </li>
                <li>
                  <a href="#contacto" className="text-base text-[#94a3b8] transition-colors hover:text-[#22d3ee]">
                    Contacto
                  </a>
                </li>
              </ul>
            </div>

            {/* Servicios */}
            <div>
              <h4 className="text-base font-semibold uppercase tracking-wider text-[#e8eefc]">
                Servicios
              </h4>
              <ul className="mt-5 space-y-3 text-base font-medium text-[#94a3b8]">
                <li>Páginas web</li>
                <li>Sistemas a medida</li>
                <li>Automatizaciones</li>
                <li>Soporte y mantenimiento</li>
              </ul>
            </div>

            {/* Contacto */}
            <div>
              <h4 className="text-base font-semibold uppercase tracking-wider text-[#e8eefc]">
                Contacto
              </h4>
              <ul className="mt-5 space-y-4 font-medium text-sm">
                <li>
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-3 text-base text-[#94a3b8] transition-colors hover:text-[#22d3ee]"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-[#22d3ee]" aria-hidden>
                      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.8.37-.27.3-1.05 1.02-1.05 2.49 0 1.47 1.07 2.89 1.22 3.09.15.2 2.11 3.22 5.11 4.51.71.31 1.27.49 1.71.63.72.23 1.37.2 1.89.12.58-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z" />
                      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.13h-.01c-1.5 0-2.97-.4-4.25-1.16l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.36c0-4.54 3.7 8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24z" />
                    </svg>
                    <span>{whatsappDisplay}</span>
                  </a>
                </li>
                <li>
                  <a
                    href={`mailto:${email}`}
                    className="group flex items-center gap-3 text-base text-[#94a3b8] transition-colors hover:text-[#22d3ee]"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-[#22d3ee]" aria-hidden>
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-10 6L2 7" />
                    </svg>
                    <span className="truncate">{email}</span>
                  </a>
                </li>
                <li className="flex items-center gap-3 text-base text-[#94a3b8]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-[#22d3ee]" aria-hidden>
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span>{location}</span>
                </li>
              </ul>
            </div>

          </div>
        </div>

        {/* Barra inferior */}
        <div className="border-t border-[#1c2740]">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-base text-[#94a3b8] sm:flex-row">
            <p>© 2026 NeXo. Todos los derechos reservados.</p>
            <p>
              Diseñado y desarrollado por{" "}
              <span className="font-semibold text-white">{developer}</span>
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
