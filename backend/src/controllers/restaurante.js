const db = require('../config/db');
const { getTodayString } = require('../utils/date');

exports.getDashboard = async (req, res) => {
  try {
    const today = getTodayString();
    const currentMonth = today.substring(0, 7);

    // 1. Ventas (Ingresos) hoy
    const salesToday = await db.get(
      'SELECT SUM(value * quantity) as sum FROM restaurant_sales WHERE date = ?',
      [today]
    );

    // 2. Gastos hoy
    const expensesToday = await db.get(
      'SELECT SUM(value) as sum FROM restaurant_expenses WHERE date = ?',
      [today]
    );

    // 3. Ventas (Ingresos) mes
    const salesMonth = await db.get(
      'SELECT SUM(value * quantity) as sum FROM restaurant_sales WHERE date LIKE ?',
      [`${currentMonth}%`]
    );

    // 4. Gastos mes
    const expensesMonth = await db.get(
      'SELECT SUM(value) as sum FROM restaurant_expenses WHERE date LIKE ?',
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
    res.status(500).json({ error: 'Error al obtener dashboard del restaurante.' });
  }
};

exports.createSale = async (req, res) => {
  const { product, quantity, value, payment_method, date, observations } = req.body;

  if (!product || !quantity || !value || !payment_method) {
    return res.status(400).json({ error: 'Producto, cantidad, valor y forma de pago son requeridos.' });
  }

  const saleDate = date || getTodayString();

  try {
    await db.run(
      'INSERT INTO restaurant_sales (product, quantity, value, payment_method, date, observations) VALUES (?, ?, ?, ?, ?, ?)',
      [product, parseInt(quantity), parseFloat(value), payment_method, saleDate, observations || '']
    );
    res.status(201).json({ message: 'Venta registrada con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar venta.' });
  }
};

exports.getSales = async (req, res) => {
  try {
    const today = getTodayString();
    const sales = await db.query(
      'SELECT *, (value * quantity) as total FROM restaurant_sales WHERE date = ? ORDER BY id DESC',
      [today]
    );
    res.json(sales);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar ventas.' });
  }
};

exports.createExpense = async (req, res) => {
  const { provider, concept, value, date, observations } = req.body;

  if (!provider || !concept || !value) {
    return res.status(400).json({ error: 'Proveedor, concepto y valor son requeridos.' });
  }

  const expenseDate = date || getTodayString();

  try {
    await db.run(
      'INSERT INTO restaurant_expenses (provider, concept, value, date, observations) VALUES (?, ?, ?, ?, ?)',
      [provider, concept, parseFloat(value), expenseDate, observations || '']
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
      'SELECT * FROM restaurant_expenses WHERE date = ? ORDER BY id DESC',
      [today]
    );
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar gastos.' });
  }
};

// Eliminar venta
exports.deleteSale = async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM restaurant_sales WHERE id = ?', [id]);
    res.json({ message: 'Venta eliminada con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar venta.' });
  }
};

// Eliminar gasto
exports.deleteExpense = async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM restaurant_expenses WHERE id = ?', [id]);
    res.json({ message: 'Gasto eliminado con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar gasto.' });
  }
};
