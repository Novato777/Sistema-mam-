/* =========================================================================
   Formato único de reportes PDF de HOVENTRA.

   Cada reporte se describe con un ReportSpec (título, resumen y tablas) y
   esta utilidad se encarga del diseño: encabezado con logo y datos del
   hotel, tipo de reporte, periodo, recuadros de resumen, tablas con el
   color de la categoría y pie de página numerado.
========================================================================= */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type RGB = [number, number, number];

export interface HotelInfo {
  name: string;
  legal_name?: string;
  tax_id?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  tra_code?: string;
}

export interface ReportKpi {
  label: string;
  value: string;
  tone?: 'good' | 'bad' | 'neutral';
}

export interface ReportSection {
  title: string;
  note?: string;
  head: string[];
  body: Array<Array<string | number>>;
  /** Fila de totales al final de la tabla. */
  foot?: Array<string | number>;
  /** Alineación por columna; por defecto los números a la derecha. */
  align?: Array<'left' | 'right' | 'center'>;
  /** Ancho relativo por columna (opcional). */
  widths?: number[];
}

export interface ReportSpec {
  /** Tipo de reporte, ej. "Movimientos de caja". */
  title: string;
  /** Categoría, ej. "Caja y dinero". */
  category: string;
  color: RGB;
  /** Periodo YYYY-MM-DD; null si el reporte es "a la fecha". */
  period: { from: string; to: string } | null;
  generatedBy?: string;
  orientation?: 'portrait' | 'landscape';
  kpis?: ReportKpi[];
  sections: ReportSection[];
  fileName: string;
}

/* -------------------------------------------------------------------------
   Formatos
------------------------------------------------------------------------- */

export const pdfMoney = (v: number | string | null | undefined) =>
  `$ ${Math.round(Number(v || 0)).toLocaleString('es-CO')}`;

export const pdfNumber = (v: number | string | null | undefined, decimals = 0) =>
  Number(v || 0).toLocaleString('es-CO', { maximumFractionDigits: decimals });

/** "2026-11-19" o ISO → "19/11/2026". */
export const pdfDate = (v?: string | null) => {
  if (!v) return '';
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
};

/** ISO con hora → "19/11/2026 14:30". */
export const pdfDateTime = (v?: string | null) => {
  if (!v) return '';
  const d = pdfDate(v);
  const t = String(v).match(/T(\d{2}:\d{2})/) || String(v).match(/ (\d{2}:\d{2})/);
  return t ? `${d} ${t[1]}` : d;
};

/** Quita caracteres que la fuente estándar del PDF no puede dibujar (emojis, etc.). */
const clean = (v: unknown) =>
  String(v ?? '')
    .replace(/[−–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ\n]/g, '')
    .trim();

/* -------------------------------------------------------------------------
   Logo
------------------------------------------------------------------------- */

const logoCache = new Map<string, { data: string; w: number; h: number } | null>();

async function loadLogo(src: string) {
  if (logoCache.has(src)) return logoCache.get(src)!;
  const result = await new Promise<{ data: string; w: number; h: number } | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        // Se reduce a máx. 320px y se guarda como JPEG sobre blanco para que el PDF pese poco
        const scale = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ data: canvas.toDataURL('image/jpeg', 0.88), w: canvas.width, h: canvas.height });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  logoCache.set(src, result);
  return result;
}

/* -------------------------------------------------------------------------
   Construcción del PDF
------------------------------------------------------------------------- */

const SLATE: RGB = [51, 65, 85];
const MUTED: RGB = [100, 116, 139];
const tint = (c: RGB, k: number): RGB => c.map((v) => Math.round(v + (255 - v) * k)) as RGB;

export async function buildReportPdf(hotel: HotelInfo, spec: ReportSpec): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: spec.orientation || 'portrait', unit: 'mm', format: 'a4', compress: true });
  const W = doc.internal.pageSize.getWidth();
  const M = 14; // margen
  const color = spec.color;
  const now = new Date();
  // Fecha y hora de Colombia (toISOString daría la fecha UTC, que de noche ya es "mañana")
  const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(now);
  const generatedAt = `${pdfDate(todayLocal)} ${now.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota'
  })}`;

  /* ---------- Encabezado de la primera página ---------- */
  doc.setFillColor(...color);
  doc.rect(0, 0, W, 4, 'F');

  const logo = await loadLogo(hotel.logo_url || '/logo.png');
  let textX = M;
  if (logo) {
    const box = 26;
    const ratio = logo.w / logo.h;
    const lw = ratio >= 1 ? box : box * ratio;
    const lh = ratio >= 1 ? box / ratio : box;
    doc.addImage(logo.data, 'JPEG', M, 9 + (box - lh) / 2, lw, lh);
    textX = M + lw + 5;
  }

  const rightW = 78;
  const hotelMaxW = W - textX - M - rightW - 4;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(doc.splitTextToSize(clean(hotel.name || 'Hotel'), hotelMaxW)[0], textX, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  const infoLines = [
    [hotel.legal_name && hotel.legal_name !== hotel.name ? hotel.legal_name : '', hotel.tax_id ? `NIT ${hotel.tax_id}` : '']
      .filter(Boolean)
      .join('  ·  '),
    [hotel.address, hotel.city].filter(Boolean).join(', '),
    [hotel.phone ? `Tel. ${hotel.phone}` : '', hotel.email].filter(Boolean).join('  ·  '),
    hotel.tra_code ? `RNT ${hotel.tra_code}` : ''
  ]
    .map(clean)
    .filter(Boolean);
  infoLines.slice(0, 4).forEach((l, i) => doc.text(doc.splitTextToSize(l, hotelMaxW)[0], textX, 20.5 + i * 4));

  // Recuadro derecho: tipo de reporte y periodo
  const bx = W - M - rightW;
  doc.setFillColor(...tint(color, 0.9));
  doc.setDrawColor(...tint(color, 0.55));
  doc.roundedRect(bx, 8, rightW, 29, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...color);
  doc.text(clean(spec.category).toUpperCase(), bx + 4, 13.5);
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(clean(spec.title), rightW - 8).slice(0, 2);
  doc.text(titleLines, bx + 4, 19);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(...SLATE);
  const periodText = spec.period
    ? spec.period.from === spec.period.to
      ? `Fecha: ${pdfDate(spec.period.from)}`
      : `Periodo: ${pdfDate(spec.period.from)} al ${pdfDate(spec.period.to)}`
    : `Corte a la fecha: ${pdfDate(todayLocal)}`;
  const py = 19 + titleLines.length * 4.6 + 0.5;
  doc.text(periodText, bx + 4, py);
  doc.setTextColor(...MUTED);
  doc.text(clean(`Generado: ${generatedAt}${spec.generatedBy ? ` · ${spec.generatedBy}` : ''}`).slice(0, 60), bx + 4, py + 4);

  doc.setDrawColor(...tint(color, 0.4));
  doc.setLineWidth(0.6);
  doc.line(M, 41, W - M, 41);
  doc.setLineWidth(0.2);

  let y = 47;

  /* ---------- Recuadros de resumen ---------- */
  if (spec.kpis && spec.kpis.length) {
    const perRow = spec.orientation === 'landscape' ? 6 : 4;
    const gap = 3;
    const bw = (W - M * 2 - gap * (perRow - 1)) / perRow;
    const bh = 17;
    spec.kpis.forEach((k, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = M + col * (bw + gap);
      const yy = y + row * (bh + gap);
      doc.setFillColor(...tint(color, 0.93));
      doc.setDrawColor(...tint(color, 0.7));
      doc.roundedRect(x, yy, bw, bh, 1.8, 1.8, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(...MUTED);
      doc.text(doc.splitTextToSize(clean(k.label), bw - 6)[0], x + 3, yy + 5.5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      const valueColor: RGB = k.tone === 'good' ? [4, 120, 87] : k.tone === 'bad' ? [190, 18, 60] : [15, 23, 42];
      doc.setTextColor(...valueColor);
      // Reduce la letra si el valor no cabe
      let fs = 11.5;
      while (fs > 7 && doc.getTextWidth(clean(k.value)) > bw - 6) {
        fs -= 0.5;
        doc.setFontSize(fs);
      }
      doc.text(clean(k.value), x + 3, yy + 12.8);
    });
    y += Math.ceil(spec.kpis.length / perRow) * (bh + gap) + 4;
  }

  /* ---------- Tablas ---------- */
  const pageH = doc.internal.pageSize.getHeight();
  for (const sec of spec.sections) {
    if (y > pageH - 40) {
      doc.addPage();
      y = 24;
    }
    doc.setFillColor(...color);
    doc.rect(M, y - 3.6, 1.6, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(clean(sec.title), M + 3.5, y);
    if (sec.note) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.setTextColor(...MUTED);
      const noteLines = doc.splitTextToSize(clean(sec.note), W - M * 2 - 4);
      doc.text(noteLines, M + 3.5, y + 4.2);
      y += noteLines.length * 3.4;
    }
    y += 3;

    const isNumeric = (s: string) => /^[\s$+\-]*[\d.,]+\s*(%|x)?$/.test(s);
    // Números de habitación, documentos, teléfonos y códigos se leen mejor a la izquierda
    const ID_COLS = /^(hab\.?|habitaci[oó]n|documento|tel[eé]fono|c[oó]digo|orden|recibo|n[uú]mero|factura|piso|tipo doc\.?|#)$/i;
    const sample = sec.body[0] || [];
    const align =
      sec.align ||
      sec.head.map(
        (h, i) => (!ID_COLS.test(h.trim()) && isNumeric(clean(sample[i] ?? '')) ? 'right' : 'left') as 'left' | 'right'
      );
    const columnStyles: Record<number, { halign: 'left' | 'right' | 'center'; cellWidth?: number }> = {};
    const usable = W - M * 2;
    const totalW = sec.widths ? sec.widths.reduce((a, b) => a + b, 0) : 0;
    sec.head.forEach((_, i) => {
      columnStyles[i] = { halign: align[i] || 'left' };
      if (sec.widths && totalW) columnStyles[i].cellWidth = (sec.widths[i] / totalW) * usable;
    });

    const body = sec.body.length
      ? sec.body.map((r) => r.map((c) => clean(c)))
      : [[{ content: 'Sin registros en este periodo.', colSpan: sec.head.length, styles: { halign: 'center' as const, textColor: MUTED, fontStyle: 'italic' as const } }]];

    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: 24, bottom: 18 },
      head: [sec.head.map(clean)],
      body: body as any,
      foot: sec.foot && sec.body.length ? [sec.foot.map((c) => clean(c))] : undefined,
      showFoot: 'lastPage',
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.15, overflow: 'linebreak' },
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      footStyles: { fillColor: tint(color, 0.85), textColor: [15, 23, 42], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles,
      didParseCell: (data) => {
        if (data.section === 'head' || data.section === 'foot') {
          data.cell.styles.halign = align[data.column.index] || 'left';
        }
      }
    });
    // @ts-expect-error lastAutoTable lo agrega el plugin
    y = (doc.lastAutoTable?.finalY || y) + 10;
  }

  /* ---------- Encabezado corto y pie en todas las páginas ---------- */
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (i > 1) {
      doc.setFillColor(...color);
      doc.rect(0, 0, W, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(clean(hotel.name || 'Hotel'), M, 12);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(clean(`${spec.title} · ${periodText}`), W - M, 12, { align: 'right' });
      doc.setDrawColor(226, 232, 240);
      doc.line(M, 15, W - M, 15);
    }
    doc.setDrawColor(226, 232, 240);
    doc.line(M, pageH - 12, W - M, pageH - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('HOVENTRA · Todo tu hotel. Una sola plataforma.', M, pageH - 7);
    doc.text(clean(`${spec.title} · ${generatedAt}`), W / 2, pageH - 7, { align: 'center' });
    doc.text(`Página ${i} de ${pages}`, W - M, pageH - 7, { align: 'right' });
  }

  return doc;
}
