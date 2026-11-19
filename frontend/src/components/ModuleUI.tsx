import React from 'react';
import { AlertTriangle, CheckCircle2, Search, X } from 'lucide-react';

/* =========================================================================
   Componentes visuales compartidos por los módulos operativos (Caja,
   Recepción…). Solo presentación: sin lógica de negocio ni llamadas a API.

   Paleta (colores sólidos con significado fijo):
   - emerald  → disponible / abierto / entradas / confirmar
   - rose     → ocupado / salidas / cerrar / anular
   - amber    → pendiente / advertencia / limpieza
   - sky      → efectivo / información
   - indigo   → acciones principales / navegación
   - slate    → totales / neutro
   Las tarjetas estáticas usan tonos -700 (los -500/-600 tienen brillo
   "neón" al pasar el mouse por reglas globales de style.css).
========================================================================= */

export const INPUT =
  'w-full h-12 px-3.5 rounded-xl bg-white/95 dark:bg-slate-800 border-2 border-slate-400 dark:border-slate-500 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-indigo-500/25 focus:border-indigo-600';

export type Tone = 'slate' | 'emerald' | 'rose' | 'amber' | 'sky' | 'indigo' | 'violet' | 'teal';

/** Relleno tenue + contorno definido para cada familia de color. */
const TONES: Record<Tone, string> = {
  slate: 'bg-slate-200 dark:bg-slate-800 border-slate-500 dark:border-slate-400',
  emerald: 'bg-emerald-200 dark:bg-emerald-500/25 border-emerald-500 dark:border-emerald-400',
  rose: 'bg-rose-200 dark:bg-rose-500/25 border-rose-500 dark:border-rose-400',
  amber: 'bg-amber-200 dark:bg-amber-500/25 border-amber-500 dark:border-amber-400',
  sky: 'bg-sky-200 dark:bg-sky-500/25 border-sky-500 dark:border-sky-400',
  indigo: 'bg-indigo-200 dark:bg-indigo-500/25 border-indigo-500 dark:border-indigo-400',
  violet: 'bg-violet-200 dark:bg-violet-500/25 border-violet-500 dark:border-violet-400',
  teal: 'bg-teal-200 dark:bg-teal-500/25 border-teal-500 dark:border-teal-400'
};

/** Clases de una tarjeta con color tenue y contorno marcado. */
export const tone = (t: Tone) => `border shadow-sm ${TONES[t]}`;

/** Versión plana (sin sombra). strong = contorno de 2px para tarjetas principales. */
export const flat = (t: Tone, strong = false) => `${strong ? 'border-2' : 'border'} ${TONES[t]}`;

/** Fondo sólido por familia (íconos, números de paso, etiquetas de estado). */
export const SOLID: Record<Tone, string> = {
  slate: 'bg-slate-700',
  emerald: 'bg-emerald-700',
  rose: 'bg-rose-700',
  amber: 'bg-amber-700',
  sky: 'bg-sky-700',
  indigo: 'bg-indigo-700',
  violet: 'bg-violet-700',
  teal: 'bg-teal-700'
};

/** Contorno de 2px por familia, para secciones planas. */
const EDGE: Record<Tone, string> = {
  slate: 'border-slate-500 dark:border-slate-500',
  emerald: 'border-emerald-600 dark:border-emerald-500',
  rose: 'border-rose-600 dark:border-rose-500',
  amber: 'border-amber-600 dark:border-amber-500',
  sky: 'border-sky-600 dark:border-sky-500',
  indigo: 'border-indigo-600 dark:border-indigo-500',
  violet: 'border-violet-600 dark:border-violet-500',
  teal: 'border-teal-600 dark:border-teal-500'
};

/** Sección plana: contorno de 2px del tono indicado. */
export const SECTION = (t: Tone) =>
  `rounded-2xl overflow-hidden border-2 ${EDGE[t]} bg-white/95 dark:bg-slate-900`;

/**
 * Encabezado de sección: franja de color SÓLIDO con texto blanco.
 * La clase "head-solid" (style.css) vuelve blancos los textos grises de adentro.
 */
export const SECTION_HEAD = (t: Tone) => `px-4 sm:px-5 py-3.5 head-solid text-white ${SOLID[t]}`;

/** Botón blanco para usar dentro de un encabezado sólido (Agregar, Nuevo…). */
export const HEAD_BTN =
  'h-11 px-4 rounded-xl bg-white/95 dark:bg-slate-900 border-2 border-white dark:border-slate-900 text-slate-900 dark:text-white text-sm font-black inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0';

/** Cuadro sólido para el ícono de un encabezado de sección. */
export function HeadIcon({ t, children }: { t: Tone; children: React.ReactNode }) {
  return (
    <span className={`head-icon w-10 h-10 rounded-xl ${SOLID[t]} text-white flex items-center justify-center shrink-0`}>
      {children}
    </span>
  );
}

/** Deduce el tono a partir de una clase de fondo sólido (ej. "bg-sky-700"). */
export const toneFromBg = (bg: string): Tone =>
  ((bg.match(/bg-(slate|emerald|rose|amber|sky|indigo|violet|teal)-/) || [])[1] as Tone) || 'slate';

/**
 * Superficie de los paneles grandes que agrupan otras tarjetas.
 * Usa bg-white/95 (no bg-white) porque style.css fuerza el borde de
 * ".dark .bg-white" a un tono casi invisible.
 */
export const SURFACE =
  'bg-white/95 dark:bg-slate-900 border border-indigo-100 dark:border-slate-700 shadow-md shadow-indigo-200/40 dark:shadow-sm dark:shadow-black/20';

export const money = (val: number | string | null | undefined) =>
  Number(val || 0).toLocaleString('es-CO');

export function StatCard({
  color,
  label,
  value,
  hint,
  icon,
  compact,
  onClick,
  active,
  variant = 'solid',
  className = ''
}: {
  variant?: 'solid' | 'flat';
  color: string;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  compact?: boolean;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  const cls = `min-w-0 ${color} text-white rounded-2xl ${variant === 'flat' ? '' : 'shadow-sm'} flex flex-col justify-between text-left ${
    compact ? 'p-3 sm:p-4 gap-1' : 'p-4 gap-3 min-h-[112px]'
  } ${active ? 'ring-4 ring-offset-2 ring-offset-slate-100 dark:ring-offset-slate-950 ring-indigo-400' : ''} ${className}`;
  const content = (
    <>
      <div className="flex items-start justify-between gap-1.5 min-w-0">
        <span className="min-w-0 text-xs sm:text-sm font-bold leading-tight text-white/90 line-clamp-2 break-words">{label}</span>
        {icon}
      </div>
      <div className="min-w-0">
        <span
          className={`font-black block break-all leading-tight ${compact ? 'text-base sm:text-xl' : 'text-xl sm:text-2xl'}`}
        >
          {value}
        </span>
        {hint && (
          <span className="text-xs sm:text-sm font-semibold text-white/80 block line-clamp-2 leading-snug">{hint}</span>
        )}
      </div>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={`${cls} cursor-pointer`}>
        {content}
      </button>
    );
  }
  return <div className={cls}>{content}</div>;
}

export function MiniFigure({
  label,
  value,
  tone
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'in' | 'out';
}) {
  const cls =
    tone === 'in'
      ? `${TONES.emerald} text-emerald-800 dark:text-emerald-200`
      : tone === 'out'
      ? `${TONES.rose} text-rose-800 dark:text-rose-200`
      : `${TONES.slate} text-slate-800 dark:text-slate-100`;
  return (
    <div className={`p-2.5 rounded-xl border shadow-sm text-center ${cls}`}>
      <span className="text-xs font-semibold block opacity-80">{label}</span>
      <strong className="text-sm sm:text-base font-black block truncate">{value}</strong>
    </div>
  );
}

/** Título numerado de un paso. Debe ir dentro de un <fieldset>. */
export function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <legend className="flex items-center gap-2.5 text-base font-bold text-slate-900 dark:text-white mb-1">
      <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-sm font-black flex items-center justify-center shrink-0">
        {n}
      </span>
      {children}
    </legend>
  );
}

export function Field({
  label,
  children,
  className = ''
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="text-sm font-bold text-slate-800 dark:text-slate-100 block">{label}</span>
      {children}
    </label>
  );
}

export function MoneyInput({
  value,
  onChange,
  required,
  big,
  placeholder
}: {
  value: string;
  onChange: (digits: string) => void;
  required?: boolean;
  big?: boolean;
  placeholder?: string;
}) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return (
    <div className="relative">
      <span
        className={`absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 pointer-events-none ${
          big ? 'text-2xl' : 'text-base'
        }`}
      >
        $
      </span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        value={digits ? money(digits) : ''}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        placeholder={placeholder}
        className={`w-full rounded-xl bg-white/95 dark:bg-slate-800 border-2 border-slate-400 dark:border-slate-500 font-black text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 ${
          big ? 'h-16 pl-10 pr-4 text-3xl' : 'h-12 pl-8 pr-3 text-lg'
        }`}
      />
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className = ''
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${INPUT} pl-11`}
      />
    </div>
  );
}

/** Grupo de botones donde solo uno puede estar activo (filtros, opciones). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = ''
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ id: T; label: React.ReactNode; color?: string }>;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-1.5 p-1.5 rounded-xl bg-slate-200/70 dark:bg-slate-800 border-2 border-slate-400 dark:border-slate-500 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={`min-h-10 px-2 rounded-lg text-sm font-bold cursor-pointer flex items-center justify-center gap-1.5 text-center leading-tight ${
              on
                ? `${o.color || 'bg-indigo-600'} text-white shadow-sm`
                : 'bg-white/95 dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-white dark:hover:bg-slate-950'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Opción grande seleccionable (tipo de pago, turno, noches…). */
export function OptionButton({
  selected,
  onClick,
  color = 'bg-indigo-600 border-indigo-600',
  children,
  className = ''
}: {
  selected: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-12 px-2 py-1.5 rounded-xl border-2 text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-1 text-center leading-tight cursor-pointer ${
        selected
          ? `${color} text-white`
          : 'bg-white/95 dark:bg-slate-900 border-slate-400 dark:border-slate-500 text-slate-800 dark:text-slate-100 hover:border-slate-600 dark:hover:border-slate-300'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function PayMethodPicker({
  value,
  onChange,
  color
}: {
  value: string;
  onChange: (v: string) => void;
  color?: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { id: 'EFECTIVO', emoji: '💵', label: 'Efectivo' },
        { id: 'TRANSFERENCIA', emoji: '📱', label: 'Nequi / Transf.' },
        { id: 'TARJETA', emoji: '💳', label: 'Tarjeta' }
      ].map((pm) => (
        <OptionButton key={pm.id} selected={value === pm.id} onClick={() => onChange(pm.id)} color={color}>
          <span aria-hidden>{pm.emoji}</span>
          <span>{pm.label}</span>
        </OptionButton>
      ))}
    </div>
  );
}

export function Row({
  label,
  value,
  valueClass
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <strong className={`text-right ${valueClass || 'text-slate-900 dark:text-white'}`}>{value}</strong>
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  icon,
  actions,
  children,
  accent,
  bodyClassName = 'p-4 sm:p-5 space-y-4',
  className = ''
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Diseño plano: encabezado con franja de color y contorno del mismo tono. */
  accent?: Tone;
  /** Solo con accent: clases del cuerpo (ej. "p-0" para tablas de borde a borde). */
  bodyClassName?: string;
  className?: string;
}) {
  if (accent) {
    return (
      <section
        className={`rounded-2xl overflow-hidden border-2 ${EDGE[accent]} bg-white/95 dark:bg-slate-900 ${className}`}
      >
        <header
          className={`${SECTION_HEAD(accent)} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <span
                className="head-icon w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0"
              >
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-white leading-tight">
                {title}
              </h2>
              {subtitle && (
                <p className="text-sm font-medium text-white/90 mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          {actions}
        </header>
        <div className={bodyClassName}>{children}</div>
      </section>
    );
  }
  return (
    <section
      className={`rounded-3xl p-4 sm:p-5 space-y-4 ${SURFACE} ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            {icon}
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function EmptyText({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 py-4 text-center">{children}</p>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action
}: {
  icon?: React.ReactNode;
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-10 px-4 text-center space-y-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700">
      {icon && <div className="text-slate-300 dark:text-slate-600 flex justify-center">{icon}</div>}
      <p className="text-base font-bold text-slate-800 dark:text-slate-100">{title}</p>
      {text && <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">{text}</p>}
      {action}
    </div>
  );
}

export function Notice({
  tone,
  onClose,
  children
}: {
  tone: 'success' | 'error';
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ok = tone === 'success';
  return (
    <div
      role={ok ? 'status' : 'alert'}
      className={`p-4 rounded-2xl text-white flex items-center justify-between gap-3 ${
        ok ? 'bg-emerald-700' : 'bg-rose-700'
      }`}
    >
      <div className="flex items-center gap-2.5 text-sm font-bold min-w-0">
        {ok ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
        <span>{children}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar aviso"
        className="w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center shrink-0 cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function SecondaryBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 px-4 rounded-xl bg-white/95 dark:bg-slate-900 border-2 border-slate-400 dark:border-slate-500 hover:border-slate-600 text-slate-800 dark:text-slate-100 text-sm font-bold cursor-pointer"
    >
      {children}
    </button>
  );
}

export function PrimaryBtn({
  color,
  children,
  onClick
}: {
  color: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type={onClick ? 'button' : 'submit'}
      onClick={onClick}
      className={`h-12 px-4 rounded-xl ${color} text-white text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer`}
    >
      {children}
    </button>
  );
}

const MODAL_SIZE = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
  '2xl': 'sm:max-w-4xl'
};

/**
 * Ventana emergente con encabezado de color sólido. En el celular se abre
 * desde abajo y deja los botones del pie siempre visibles.
 * Si recibe onSubmit, todo el contenido es un <form>; si no, es un <div>
 * (necesario cuando el contenido tiene formularios propios).
 */
export function Modal({
  color,
  icon,
  title,
  subtitle,
  onClose,
  onSubmit,
  footer,
  size = 'md',
  children
}: {
  color: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  onSubmit?: (e: React.FormEvent) => void;
  footer?: React.ReactNode;
  size?: keyof typeof MODAL_SIZE;
  children: React.ReactNode;
}) {
  const body = (
    <>
      <div className={`${color} text-white px-5 py-4 flex items-start justify-between gap-3 shrink-0`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-black leading-tight truncate">{title}</h3>
            {subtitle && <p className="text-sm font-medium text-white/85 truncate">{subtitle}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-5 space-y-5 overflow-y-auto flex-1">{children}</div>
      {footer && (
        <div className="p-4 border-t border-slate-300 dark:border-slate-700 grid grid-flow-col auto-cols-fr gap-2 shrink-0">
          {footer}
        </div>
      )}
    </>
  );
  const shell = `w-full ${MODAL_SIZE[size]} max-h-[94vh] sm:max-h-[90vh] flex flex-col bg-white/95 dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl`;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {onSubmit ? (
        <form onSubmit={onSubmit} className={shell}>
          {body}
        </form>
      ) : (
        <div className={shell}>{body}</div>
      )}
    </div>
  );
}

/** Encabezado fijo con título del módulo y pestañas de navegación. */
export function ModuleHeader<T extends string>({
  icon,
  iconColor,
  title,
  subtitle,
  tabs,
  active,
  onChange
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  tabs: Array<{ id: T; label: string; short: string; icon: React.ReactNode; badge?: number }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="sticky top-0 z-20 bg-white/60 dark:bg-slate-950/95 backdrop-blur-md -mx-3 sm:-mx-6 md:-mx-8 px-3 sm:px-6 md:px-8 py-3 border-b border-indigo-100 dark:border-slate-700">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="hidden sm:flex items-center gap-3 min-w-0">
          <div className={`w-11 h-11 rounded-2xl ${iconColor} text-white flex items-center justify-center shrink-0`}>
            {icon}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-black text-slate-900 dark:text-white leading-tight truncate">{title}</h1>
            {subtitle && (
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 truncate">{subtitle}</p>
            )}
          </div>
        </div>

        <nav
          className="grid gap-1 p-1 rounded-2xl bg-white/95 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 w-full lg:w-auto lg:min-w-[540px]"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
          aria-label="Secciones"
        >
          {tabs.map((t) => {
            const on = active === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange(t.id)}
                aria-current={on ? 'page' : undefined}
                className={`h-12 px-1.5 sm:px-2 rounded-xl text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 cursor-pointer ${
                  on
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {t.icon}
                <span className="truncate max-w-full sm:hidden">{t.short}</span>
                <span className="truncate hidden sm:inline">{t.label}</span>
                {t.badge !== undefined && (
                  <span
                    className={`hidden sm:inline-flex min-w-6 h-6 px-1.5 rounded-full text-xs font-black items-center justify-center ${
                      on
                        ? 'bg-white/25 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
