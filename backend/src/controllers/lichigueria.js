const db = require('../config/db');

const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
    const sales = await db.query(
      'SELECT * FROM lichigueria_sales ORDER BY date DESC, id DESC LIMIT 50'
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
    const expenses = await db.query(
      'SELECT * FROM lichigueria_expenses ORDER BY date DESC, id DESC LIMIT 50'
    );
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener gastos.' });
  }
};
