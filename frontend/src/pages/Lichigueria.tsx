import React, { useState, useEffect } from 'react';
import { 
  Leaf, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  X, 
  Users, 
  ClipboardList,
  ChevronRight,
  FileText,
  Trash2
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import API_URL from '../config/api';

interface Provider {
  id: number;
  name: string;
  phone?: string;
  product?: string;
}

interface Sale {
  id: number;
  product: string;
  quantity: number;
  unit: string;
  value: number;
  payment_method: string;
  date: string;
}

interface Expense {
  id: number;
  concept: string;
  value: number;
  date: string;
  observations?: string;
}

interface DashboardData {
  today: { sales: number; expense: number; balance: number };
  month: { sales: number; expense: number; balance: number };
}

export default function Lichigueria() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // Modales
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);

  // Fecha para reporte PDF
  const [pdfDate, setPdfDate] = useState(new Date().toISOString().split('T')[0]);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  // Formularios
  const [saleForm, setSaleForm] = useState({
    product: '',
    quantity: '',
    unit: 'lb',
    value: '',
    payment_method: 'Efectivo',
    date: new Date().toISOString().split('T')[0]
  });

  const [expenseForm, setExpenseForm] = useState({
    concept: '',
    value: '',
    date: new Date().toISOString().split('T')[0],
    observations: ''
  });

  const [providerForm, setProviderForm] = useState({
    name: '',
    phone: '',
    product: ''
  });

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    try {
      const [dbRes, provRes, salesRes, expRes] = await Promise.all([
        fetch(`${API_URL}/api/lichigueria/dashboard`, { headers }),
        fetch(`${API_URL}/api/lichigueria/providers`, { headers }),
        fetch(`${API_URL}/api/lichigueria/sales`, { headers }),
        fetch(`${API_URL}/api/lichigueria/expenses`, { headers })
      ]);

      if (!dbRes.ok || !provRes.ok || !salesRes.ok || !expRes.ok) {
        throw new Error('Error al conectar con la API de la lichiguería');
      }

      const dbData = await dbRes.json();
      const provData = await provRes.json();
      const salesData = await salesRes.json();
      const expData = await expRes.json();

      setDashboard(dbData);
      setProviders(provData);
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
      const response = await fetch(`${API_URL}/api/lichigueria/sales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({
          product: saleForm.product,
          quantity: parseFloat(saleForm.quantity),
          unit: saleForm.unit,
          value: parseFloat(saleForm.value.replace(/\./g, '')),
          payment_method: saleForm.payment_method,
          date: saleForm.date
        })
      });

      if (!response.ok) {
        throw new Error('Error al registrar venta');
      }

      setShowSaleModal(false);
      setSaleForm({
        product: '',
        quantity: '',
        unit: 'lb',
        value: '',
        payment_method: 'Efectivo',
        date: new Date().toISOString().split('T')[0]
      });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/lichigueria/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({
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
        concept: '',
        value: '',
        date: new Date().toISOString().split('T')[0],
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
      const response = await fetch(`${API_URL}/api/lichigueria/sales/${id}`, {
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
      const response = await fetch(`${API_URL}/api/lichigueria/expenses/${id}`, {
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

  const handleCreateProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/lichigueria/providers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify(providerForm)
      });

      if (!response.ok) {
        throw new Error('Error al crear proveedor');
      }

      setShowProviderModal(false);
      setProviderForm({ name: '', phone: '', product: '' });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const generatePdfReport = async () => {
    setPdfGenerating(true);
    try {
      const response = await fetch(`${API_URL}/api/reports/daily?module=lichigueria&date=${pdfDate}`, { headers });
      if (!response.ok) {
        throw new Error('Error al consultar reporte diario.');
      }
      const data = await response.json();

      const doc = new jsPDF() as any;

      // Cabecera
      doc.setFontSize(18);
      doc.setTextColor(33, 43, 54);
      doc.text('REPORTE DIARIO DE CAJA - LICHIGUERÍA', 14, 20);

      doc.setFontSize(10);
      doc.setTextColor(99, 115, 129);
      doc.text(`Fecha del Reporte: ${data.date}`, 14, 27);
      doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 32);

      // Resumen
      autoTable(doc, {
        startY: 40,
        head: [['Resumen de Caja', 'Valor']],
        body: [
          ['Total de Ventas', `$${Number(data.summary.sales || 0).toLocaleString()}`],
          ['Total de Gastos/Compras', `$${Number(data.summary.expenses || 0).toLocaleString()}`],
          ['Balance Neto', `$${Number(data.summary.balance || 0).toLocaleString()}`]
        ],
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] } // Índigo
      });

      // Ventas
      const salesRows = data.sales.map((s: any) => [
        s.product,
        `${s.quantity} ${s.unit}`,
        `$${Number(s.value || 0).toLocaleString()}`,
        s.payment_method
      ]);
      doc.text('DETALLE DE VENTAS', 14, (doc as any).lastAutoTable.finalY + 15);
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 18,
        head: [['Producto/Verdura', 'Cant. / Unid.', 'Monto Pagado', 'Forma de Pago']],
        body: salesRows.length > 0 ? salesRows : [['Sin ventas registradas en esta fecha', '', '', '']],
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129] } // Verde
      });

      // Gastos
      const expenseRows = data.expenses.map((e: any) => [
        e.concept,
        `$${Number(e.value || 0).toLocaleString()}`,
        e.date
      ]);
      doc.text('DETALLE DE GASTOS / COMPRAS', 14, (doc as any).lastAutoTable.finalY + 15);
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 18,
        head: [['Concepto / Insumo', 'Valor', 'Fecha']],
        body: expenseRows.length > 0 ? expenseRows : [['Sin gastos registrados en esta fecha', '', '']],
        theme: 'grid',
        headStyles: { fillColor: [239, 68, 68] } // Rojo
      });

      doc.save(`Reporte_Lichigueria_${data.date}.pdf`);
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
        <div className="text-slate-500 font-medium animate-pulse">Cargando datos de la Lichiguería...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Listón Superior */}
      <div className="w-full h-2.5 bg-amber-500 rounded-full mb-4 shadow-sm"></div>

      {/* Cabecera */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight flex items-center gap-3">
            <span className="p-2 bg-amber-500 text-white rounded-2xl border border-amber-600 shadow-sm"><Leaf className="w-6 h-6" /></span>
            Lichiguería
          </h1>
          <p className="text-slate-655 text-sm">Registro de ventas de legumbres y verduras, proveedores e historial financiero.</p>
        </div>

        <div className="flex flex-wrap gap-3 w-full xl:w-auto">
          <button
            onClick={() => setShowPdfModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-350 hover:bg-slate-50 text-slate-700 font-medium rounded-xl text-sm shadow-xs active:scale-[0.98] transition-all"
          >
            <FileText className="w-4 h-4 text-indigo-600" />
            <span>Reporte PDF</span>
          </button>
          <button
            onClick={() => setShowProviderModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-350 hover:bg-slate-50 text-slate-700 font-medium rounded-xl text-sm shadow-xs active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Proveedor</span>
          </button>
          <button
            onClick={() => setShowExpenseModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-350 hover:bg-slate-50 text-slate-700 font-medium rounded-xl text-sm shadow-xs active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Gasto</span>
          </button>
          <button
            onClick={() => setShowSaleModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl text-sm shadow-xs active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Venta</span>
          </button>
        </div>
      </div>

      {/* Métricas */}
      {dashboard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-150/60 shadow-xs space-y-4">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
              Ventas de hoy
              <span className="inline-flex p-1 bg-emerald-50 text-emerald-600 rounded-lg"><TrendingUp className="w-3.5 h-3.5" /></span>
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-slate-800">${dashboard.today.sales.toLocaleString()}</span>
              <span className="text-xs text-slate-400">Hoy</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-150/60 shadow-xs space-y-4">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
              Ventas del mes
              <span className="inline-flex p-1 bg-emerald-50 text-emerald-600 rounded-lg"><TrendingUp className="w-3.5 h-3.5" /></span>
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-slate-800">${dashboard.month.sales.toLocaleString()}</span>
              <span className="text-xs text-slate-400">Mes actual</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-150/60 shadow-xs space-y-4">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Balance Mensual</span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-slate-800">${dashboard.month.balance.toLocaleString()}</span>
              <span className="text-xs text-slate-500">Gastos mes: ${dashboard.month.expense.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tres Secciones: Proveedores, Ventas y Gastos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Proveedores */}
        <div className="bg-white rounded-2xl border border-slate-150/60 shadow-xs p-6 space-y-4 h-[420px] flex flex-col">
          <h2 className="text-lg font-semibold text-slate-800 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-500" />
            Proveedores locales
          </h2>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {providers.map((p) => (
              <div key={p.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center text-sm">
                <div>
                  <h4 className="font-semibold text-slate-800">{p.name}</h4>
                  <span className="text-xs text-slate-500">Suministro: {p.product || 'Legumbres'}</span>
                </div>
                {p.phone && <span className="text-xs text-indigo-650 font-medium">{p.phone}</span>}
              </div>
            ))}
            {providers.length === 0 && (
              <div className="text-center text-slate-400 py-12 text-sm">No hay proveedores registrados.</div>
            )}
          </div>
        </div>

        {/* Ventas */}
        <div className="bg-white rounded-2xl border border-slate-150/60 shadow-xs p-6 space-y-4 h-[420px] flex flex-col">
          <h2 className="text-lg font-semibold text-slate-800 tracking-tight flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-slate-500" />
            Registro de Ventas
          </h2>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {sales.map((sale) => (
              <div key={sale.id} className="p-3 border-b border-slate-50 flex justify-between items-center text-sm">
                <div>
                  <h4 className="font-medium text-slate-800">{sale.product}</h4>
                  <span className="text-xs text-slate-400">{sale.quantity} {sale.unit} | {sale.payment_method}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-emerald-600">${sale.value.toLocaleString()}</span>
                  <button
                    onClick={() => handleDeleteSale(sale.id)}
                    className="p-1 text-red-500 hover:text-red-750 hover:bg-red-50 rounded-lg transition-all"
                    title="Eliminar venta"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {sales.length === 0 && (
              <div className="text-center text-slate-400 py-12 text-sm">No hay ventas registradas.</div>
            )}
          </div>
        </div>

        {/* Gastos */}
        <div className="bg-white rounded-2xl border border-slate-150/60 shadow-xs p-6 space-y-4 h-[420px] flex flex-col">
          <h2 className="text-lg font-semibold text-slate-800 tracking-tight flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-slate-500" />
            Gastos e Insumos
          </h2>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {expenses.map((exp) => (
              <div key={exp.id} className="p-3 border-b border-slate-50 flex justify-between items-center text-sm">
                <div>
                  <h4 className="font-medium text-slate-800">{exp.concept}</h4>
                  <span className="text-xs text-slate-400">{exp.date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-red-600">${exp.value.toLocaleString()}</span>
                  <button
                    onClick={() => handleDeleteExpense(exp.id)}
                    className="p-1 text-red-500 hover:text-red-750 hover:bg-red-50 rounded-lg transition-all"
                    title="Eliminar gasto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {expenses.length === 0 && (
              <div className="text-center text-slate-400 py-12 text-sm">No hay egresos registrados.</div>
            )}
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
                  placeholder="Ej: Papa, Cebolla, Tomate"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Cantidad *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={saleForm.quantity}
                    onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })}
                    placeholder="Ej: 3"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Unidad *</label>
                  <select
                    value={saleForm.unit}
                    onChange={(e) => setSaleForm({ ...saleForm, unit: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  >
                    <option value="lb">Libras (lb)</option>
                    <option value="kg">Kilos (kg)</option>
                    <option value="unidad">Unidades</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-655 uppercase tracking-wider">Monto Cobrado ($) *</label>
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
                  placeholder="Valor total"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
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

              <button
                type="submit"
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl text-sm transition-all"
              >
                Registrar Venta
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
                <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Concepto *</label>
                <input
                  type="text"
                  required
                  value={expenseForm.concept}
                  onChange={(e) => setExpenseForm({ ...expenseForm, concept: e.target.value })}
                  placeholder="Ej: Suministro papa criolla"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-655 uppercase tracking-wider">Valor total ($) *</label>
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

      {/* --- MODAL AGREGAR PROVEEDOR --- */}
      {showProviderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-5 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <h3 className="text-xl font-bold text-slate-900">Agregar Proveedor</h3>
              <button onClick={() => setShowProviderModal(false)} className="p-1 text-slate-400 bg-slate-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProvider} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Nombre de Proveedor *</label>
                <input
                  type="text"
                  required
                  value={providerForm.name}
                  onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                  placeholder="Ej: Distribuidora del Campo"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Teléfono de Contacto</label>
                <input
                  type="text"
                  value={providerForm.phone}
                  onChange={(e) => setProviderForm({ ...providerForm, phone: e.target.value })}
                  placeholder="Ej: 300 123 4567"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-650 uppercase tracking-wider">Producto que Suministra</label>
                <input
                  type="text"
                  value={providerForm.product}
                  onChange={(e) => setProviderForm({ ...providerForm, product: e.target.value })}
                  placeholder="Ej: Papas y tubérculos"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl text-sm transition-all"
              >
                Guardar Proveedor
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
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm transition-all shadow-xs flex items-center justify-center gap-2"
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
