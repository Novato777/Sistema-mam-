import React, { useState, useEffect } from 'react';
import { 
  UtensilsCrossed, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  X, 
  DollarSign,
  ClipboardList,
  FileText,
  Trash2
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import API_URL from '../config/api';
import { getTodayString } from '../utils/date';

interface Sale {
  id: number;
  product: string;
  quantity: number;
  value: number;
  payment_method: string;
  date: string;
  observations?: string;
  total: number;
}

interface Expense {
  id: number;
  provider: string;
  concept: string;
  value: number;
  date: string;
  observations?: string;
}

interface DashboardData {
  today: { sales: number; expense: number; balance: number };
  month: { sales: number; expense: number; balance: number };
}

export default function Restaurante() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // Modales
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);

  // Fecha para reporte PDF
  const [pdfDate, setPdfDate] = useState(getTodayString());
  const [pdfGenerating, setPdfGenerating] = useState(false);

  // Formularios
  const [saleForm, setSaleForm] = useState({
    product: '',
    quantity: '1',
    value: '',
    payment_method: 'Efectivo',
    date: getTodayString(),
    observations: ''
  });

  const [expenseForm, setExpenseForm] = useState({
    provider: '',
    concept: '',
    value: '',
    date: getTodayString(),
    observations: ''
  });

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    try {
      const [dbRes, salesRes, expRes] = await Promise.all([
        fetch(`${API_URL}/api/restaurante/dashboard`, { headers }),
        fetch(`${API_URL}/api/restaurante/sales`, { headers }),
        fetch(`${API_URL}/api/restaurante/expenses`, { headers })
      ]);

      if (!dbRes.ok || !salesRes.ok || !expRes.ok) {
        throw new Error('Error al conectar con la API del restaurante');
      }

      const dbData = await dbRes.json();
      const salesData = await salesRes.json();
      const expData = await expRes.json();

      setDashboard(dbData);
      setSales(salesData);
      setExpenses(expData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/restaurante/sales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({
          product: saleForm.product,
          quantity: parseInt(saleForm.quantity),
          value: parseFloat(saleForm.value.replace(/\./g, '')),
          payment_method: saleForm.payment_method,
          date: saleForm.date,
          observations: saleForm.observations
        })
      });

      if (!response.ok) {
        throw new Error('Error al registrar venta');
      }

      setShowSaleModal(false);
      setSaleForm({
        product: '',
        quantity: '1',
        value: '',
        payment_method: 'Efectivo',
        date: getTodayString(),
        observations: ''
      });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/restaurante/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({
          provider: expenseForm.provider,
          concept: expenseForm.concept,
          value: parseFloat(expenseForm.value.replace(/\./g, '')),
          date: expenseForm.date,
          observations: expenseForm.observations
        })
      });

      if (!response.ok) {
        throw new Error('Error al registrar gasto');
      }

      setShowExpenseModal(false);
      setExpenseForm({
        provider: '',
        concept: '',
        value: '',
        date: getTodayString(),
        observations: ''
      });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteSale = async (id: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta venta? Se descontará del reporte y balance.')) {
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/restaurante/sales/${id}`, {
        method: 'DELETE',
        headers
      });

      if (!response.ok) {
        throw new Error('Error al eliminar venta');
      }
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteExpense = async (id: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este gasto? Se recalcularán los reportes.')) {
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/restaurante/expenses/${id}`, {
        method: 'DELETE',
        headers
      });

      if (!response.ok) {
        throw new Error('Error al eliminar gasto');
      }
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const generatePdfReport = async () => {
    setPdfGenerating(true);
    try {
      const response = await fetch(`${API_URL}/api/reports/daily?module=restaurante&date=${pdfDate}`, { headers });
      if (!response.ok) {
        throw new Error('Error al consultar reporte diario.');
      }
      const data = await response.json();

      const doc = new jsPDF() as any;

      // Título y Cabecera
      doc.setFontSize(18);
      doc.setTextColor(33, 43, 54);
      doc.text('REPORTE DIARIO DE CAJA - RESTAURANTE', 14, 20);

      doc.setFontSize(10);
      doc.setTextColor(99, 115, 129);
      doc.text(`Fecha del Reporte: ${data.date}`, 14, 27);
      doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 32);

      // Tabla Resumen
      autoTable(doc, {
        startY: 40,
        head: [['Resumen de Caja', 'Valor']],
        body: [
          ['Total de Ventas (Ingresos)', `$${Number(data.summary.sales || 0).toLocaleString()}`],
          ['Total de Gastos (Egresos)', `$${Number(data.summary.expenses || 0).toLocaleString()}`],
          ['Balance del Día', `$${Number(data.summary.balance || 0).toLocaleString()}`]
        ],
        theme: 'striped',
        headStyles: { fillColor: [249, 115, 22] } // Naranja
      });

      // Tabla Ventas
      const salesRows = data.sales.map((s: any) => [
        s.product,
        s.quantity,
        `$${Number(s.value || 0).toLocaleString()}`,
        s.payment_method,
        `$${Number((s.value || 0) * (s.quantity || 0)).toLocaleString()}`
      ]);
      doc.text('DETALLE DE VENTAS', 14, (doc as any).lastAutoTable.finalY + 15);
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 18,
        head: [['Producto', 'Cant', 'V. Unit', 'Pago', 'Total']],
        body: salesRows.length > 0 ? salesRows : [['Sin ventas registradas en esta fecha', '', '', '', '']],
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229] } // Azul/Indigo
      });

      // Tabla Gastos
      const expenseRows = data.expenses.map((e: any) => [
        e.provider,
        e.concept,
        `$${Number(e.value || 0).toLocaleString()}`
      ]);
      doc.text('DETALLE DE GASTOS', 14, (doc as any).lastAutoTable.finalY + 15);
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 18,
        head: [['Proveedor', 'Concepto', 'Valor']],
        body: expenseRows.length > 0 ? expenseRows : [['Sin gastos registrados en esta fecha', '', '']],
        theme: 'grid',
        headStyles: { fillColor: [239, 68, 68] } // Rojo
      });

      doc.save(`Reporte_Restaurante_${data.date}.pdf`);
      setShowPdfModal(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setPdfGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-slate-500 font-medium animate-pulse">Cargando datos del Restaurante...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Listón Superior */}
      <div className="w-full h-2.5 bg-rose-500 rounded-full mb-4 shadow-sm"></div>

      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-3">
            <span className="p-2 bg-rose-500 text-white rounded-2xl border border-rose-600 shadow-sm"><UtensilsCrossed className="w-6 h-6" /></span>
            Restaurante
          </h1>
          <p className="text-slate-655 dark:text-slate-400 text-sm">Registro rápido de caja, ventas diarias y reporte de egresos.</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setShowPdfModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-350 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 font-medium rounded-xl text-sm shadow-xs active:scale-[0.98] transition-all"
          >
            <FileText className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <span>Generar Reporte PDF</span>
          </button>
          <button
            onClick={() => setShowExpenseModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-350 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 font-medium rounded-xl text-sm shadow-xs active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Gasto</span>
          </button>
          <button
            onClick={() => setShowSaleModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-slate-900 dark:bg-rose-600 hover:bg-slate-800 dark:hover:bg-rose-700 text-white font-medium rounded-xl text-sm shadow-xs active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Venta</span>
          </button>
        </div>
      </div>

      {/* Tarjetas de Métricas */}
      {dashboard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-150/60 dark:border-slate-800 shadow-xs space-y-4">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
              Ventas de hoy
              <span className="inline-flex p-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-lg"><TrendingUp className="w-3.5 h-3.5" /></span>
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-slate-800 dark:text-slate-100">${Number(dashboard.today.sales || 0).toLocaleString('de-DE')}</span>
              <span className="text-xs text-slate-400">Hoy</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-150/60 dark:border-slate-800 shadow-xs space-y-4">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
              Ventas del mes
              <span className="inline-flex p-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-lg"><TrendingUp className="w-3.5 h-3.5" /></span>
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-slate-800 dark:text-slate-100">${Number(dashboard.month.sales || 0).toLocaleString('de-DE')}</span>
              <span className="text-xs text-slate-400">Mes actual</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-150/60 dark:border-slate-800 shadow-xs space-y-4">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
              Balance Mensual (Caja)
              <span className="inline-flex p-1 bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 rounded-lg"><DollarSign className="w-3.5 h-3.5" /></span>
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-slate-800 dark:text-slate-100">${Number(dashboard.month.balance || 0).toLocaleString('de-DE')}</span>
              <span className="text-xs text-slate-550 dark:text-slate-400 font-medium">Gastos mes: ${Number(dashboard.month.expense || 0).toLocaleString('de-DE')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Dos Columnas: Historial de Ventas vs Historial de Gastos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Tabla Ventas */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150/60 dark:border-slate-800 shadow-xs p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            Ventas Recientes
          </h2>
          <div className="overflow-x-auto max-h-[350px] overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl pr-1">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-400 font-medium">
                  <th className="py-3 px-2">Producto</th>
                  <th className="py-3 px-2">Cant.</th>
                  <th className="py-3 px-2">Pago</th>
                  <th className="py-3 px-2 text-right">Total</th>
                  <th className="py-3 px-2 text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-2 font-medium text-slate-800 dark:text-slate-100">{sale.product}</td>
                    <td className="py-3 px-2 text-slate-500 dark:text-slate-400">x{sale.quantity}</td>
                    <td className="py-3 px-2 text-slate-500 dark:text-slate-400 text-xs">{sale.payment_method}</td>
                    <td className="py-3 px-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      ${Number(sale.total || 0).toLocaleString('de-DE')}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <button
                        onClick={() => handleDeleteSale(sale.id)}
                        className="p-1 text-red-500 hover:text-red-750 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-all"
                        title="Eliminar venta"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-450 dark:text-slate-400">No hay ventas hoy.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tabla Gastos */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-150/60 dark:border-slate-800 shadow-xs p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            Gastos Recientes
          </h2>
          <div className="overflow-x-auto max-h-[350px] overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl pr-1">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-400 font-medium">
                  <th className="py-3 px-2">Proveedor</th>
                  <th className="py-3 px-2">Concepto</th>
                  <th className="py-3 px-2 text-right">Valor</th>
                  <th className="py-3 px-2 text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr key={exp.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-2 font-medium text-slate-800 dark:text-slate-100">{exp.provider}</td>
                    <td className="py-3 px-2 text-slate-500 dark:text-slate-400 max-w-[130px] truncate">{exp.concept}</td>
                    <td className="py-3 px-2 text-right font-semibold text-red-600 dark:text-red-400">
                      ${Number(exp.value || 0).toLocaleString('de-DE')}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <button
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="p-1 text-red-500 hover:text-red-750 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-all"
                        title="Eliminar gasto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-450 dark:text-slate-400">No hay gastos hoy.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- MODAL REGISTRAR VENTA --- */}
      {showSaleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-5 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <h3 className="text-xl font-bold text-slate-900">Registrar Venta</h3>
              <button onClick={() => setShowSaleModal(false)} className="p-1 text-slate-400 bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSale} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Producto *</label>
                <input
                  type="text"
                  required
                  value={saleForm.product}
                  onChange={(e) => setSaleForm({ ...saleForm, product: e.target.value })}
                  placeholder="Nombre de producto / comida"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Cantidad *</label>
                  <input
                    type="number"
                    required
                    value={saleForm.quantity}
                    onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })}
                    placeholder="1"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  />
                </div>
                 <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Precio Unitario *</label>
                  <input
                    type="text"
                    required
                    value={saleForm.value}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\./g, '');
                      if (!isNaN(Number(raw)) || raw === '') {
                        const formatted = raw ? Number(raw).toLocaleString('de-DE') : '';
                        setSaleForm({ ...saleForm, value: formatted });
                      }
                    }}
                    placeholder="Monto"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Forma de Pago *</label>
                <select
                  value={saleForm.payment_method}
                  onChange={(e) => setSaleForm({ ...saleForm, payment_method: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-655 uppercase tracking-wider">Observaciones</label>
                <textarea
                  value={saleForm.observations}
                  onChange={(e) => setSaleForm({ ...saleForm, observations: e.target.value })}
                  placeholder="Detalles de preparación, etc."
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl text-sm transition-all"
              >
                Completar Venta
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL REGISTRAR GASTO --- */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-5 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <h3 className="text-xl font-bold text-slate-900">Registrar Gasto</h3>
              <button onClick={() => setShowExpenseModal(false)} className="p-1 text-slate-400 bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Proveedor *</label>
                <input
                  type="text"
                  required
                  value={expenseForm.provider}
                  onChange={(e) => setExpenseForm({ ...expenseForm, provider: e.target.value })}
                  placeholder="Nombre de proveedor / local comercial"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Concepto *</label>
                <input
                  type="text"
                  required
                  value={expenseForm.concept}
                  onChange={(e) => setExpenseForm({ ...expenseForm, concept: e.target.value })}
                  placeholder="Ej: Insumos de cocina, Carnes"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Valor total ($) *</label>
                <input
                  type="text"
                  required
                  value={expenseForm.value}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\./g, '');
                    if (!isNaN(Number(raw)) || raw === '') {
                      const formatted = raw ? Number(raw).toLocaleString('de-DE') : '';
                      setExpenseForm({ ...expenseForm, value: formatted });
                    }
                  }}
                  placeholder="Monto"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl text-sm transition-all"
              >
                Completar Gasto
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL REPORTES PDF --- */}
      {showPdfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-5 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <h3 className="text-xl font-bold text-slate-900">Reporte Diario PDF</h3>
              <button onClick={() => setShowPdfModal(false)} className="p-1 text-slate-400 bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-655 uppercase tracking-wider">Seleccionar Fecha *</label>
                <input
                  type="date"
                  required
                  value={pdfDate}
                  onChange={(e) => setPdfDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <button
                onClick={generatePdfReport}
                disabled={pdfGenerating}
                className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-xl text-sm transition-all shadow-xs flex items-center justify-center gap-2"
              >
                {pdfGenerating ? 'Generando PDF...' : 'Descargar Reporte PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
