const db = require('../config/db');
const { getTodayString } = require('../utils/date');

exports.getDashboard = async (req, res) => {
  try {
    const today = getTodayString();
    const currentMonth = today.substring(0, 7);

    // 1. Ventas de hoy
    const salesToday = await db.get(
      'SELECT SUM(value) as sum FROM lichigueria_sales WHERE date = ?',
      [today]
    );

    // 2. Gastos de hoy
    const expensesToday = await db.get(
      'SELECT SUM(value) as sum FROM lichigueria_expenses WHERE date = ?',
      [today]
    );

    // 3. Ventas del mes
    const salesMonth = await db.get(
      'SELECT SUM(value) as sum FROM lichigueria_sales WHERE date LIKE ?',
      [`${currentMonth}%`]
    );

    // 4. Gastos del mes
    const expensesMonth = await db.get(
      'SELECT SUM(value) as sum FROM lichigueria_expenses WHERE date LIKE ?',
      [`${currentMonth}%`]
    );

    const valSalesToday = salesToday.sum || 0;
    const valExpToday = expensesToday.sum || 0;
    const valSalesMonth = salesMonth.sum || 0;
    const valExpMonth = expensesMonth.sum || 0;

    res.json({
      today: {
        sales: valSalesToday,
        expense: valExpToday,
        balance: valSalesToday - valExpToday
      },
      month: {
        sales: valSalesMonth,
        expense: valExpMonth,
        balance: valSalesMonth - valExpMonth
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener dashboard de lichiguería.' });
  }
};

// --- PROVEEDORES ---
exports.createProvider = async (req, res) => {
  const { name, phone, product } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'El nombre del proveedor es obligatorio.' });
  }

  try {
    await db.run(
      'INSERT INTO lichigueria_providers (name, phone, product) VALUES (?, ?, ?)',
      [name, phone || '', product || '']
    );
    res.status(201).json({ message: 'Proveedor creado con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear proveedor.' });
  }
};

exports.getProviders = async (req, res) => {
  try {
    const providers = await db.query('SELECT * FROM lichigueria_providers ORDER BY name ASC');
    res.json(providers);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar proveedores.' });
  }
};

// --- VENTAS ---
exports.createSale = async (req, res) => {
  const { product, quantity, unit, value, payment_method, date } = req.body;

  if (!product || !quantity || !unit || !value || !payment_method) {
    return res.status(400).json({ error: 'Todos los campos de la venta son obligatorios.' });
  }

  const saleDate = date || getTodayString();

  try {
    await db.run(
      'INSERT INTO lichigueria_sales (product, quantity, unit, value, payment_method, date) VALUES (?, ?, ?, ?, ?, ?)',
      [product, parseFloat(quantity), unit, parseFloat(value), payment_method, saleDate]
    );
    res.status(201).json({ message: 'Venta registrada con éxito.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar venta en lichiguería.' });
  }
};

exports.getSales = async (req, res) => {
  try {
    const today = getTodayString();
    const sales = await db.query(
      'SELECT * FROM lichigueria_sales WHERE date = ? ORDER BY id DESC',
      [today]
    );
    res.json(sales);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar ventas.' });
  }
};

// --- GASTOS ---
exports.createExpense = async (req, res) => {
  const { concept, value, date, observations } = req.body;

  if (!concept || !value) {
    return res.status(400).json({ error: 'Concepto y valor son obligatorios.' });
  }

  const expenseDate = date || getTodayString();

  try {
    await db.run(
      'INSERT INTO lichigueria_expenses (concept, value, date, observations) VALUES (?, ?, ?, ?)',
      [concept, parseFloat(value), expenseDate, observations || '']
    );
    res.status(201).json({ message: 'Gasto registrado con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar gasto.' });
  }
};

exports.getExpenses = async (req, res) => {
  try {
    const today = getTodayString();
    const expenses = await db.query(
      'SELECT * FROM lichigueria_expenses WHERE date = ? ORDER BY id DESC',
      [today]
    );
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener gastos.' });
  }
};

// Eliminar venta
exports.deleteSale = async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM lichigueria_sales WHERE id = ?', [id]);
    res.json({ message: 'Venta eliminada con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar venta.' });
  }
};

// Eliminar gasto
exports.deleteExpense = async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM lichigueria_expenses WHERE id = ?', [id]);
    res.json({ message: 'Gasto eliminado con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar gasto.' });
  }
};
