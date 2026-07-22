const db = require('../config/db');

exports.getDailyReport = async (req, res) => {
  const { date, module } = req.query; // date: YYYY-MM-DD, module: 'restaurante' o 'lichigueria'

  if (!date || !module) {
    return res.status(400).json({ error: 'La fecha y el módulo son requeridos.' });
  }

  try {
    if (module === 'restaurante') {
      // Obtener ventas de esa fecha
      const sales = await db.query(
        'SELECT *, (value * quantity) as total FROM restaurant_sales WHERE date = ? ORDER BY id ASC',
        [date]
      );
      // Obtener gastos de esa fecha
      const expenses = await db.query(
        'SELECT * FROM restaurant_expenses WHERE date = ? ORDER BY id ASC',
        [date]
      );

      // Totales
      const totalSales = sales.reduce((acc, curr) => acc + Number(curr.total || 0), 0);
      const totalExpenses = expenses.reduce((acc, curr) => acc + Number(curr.value || 0), 0);

      return res.json({
        date,
        module,
        sales,
        expenses,
        summary: {
          sales: totalSales,
          expenses: totalExpenses,
          balance: totalSales - totalExpenses
        }
      });
    } else if (module === 'lichigueria') {
      // Obtener ventas de esa fecha
      const sales = await db.query(
        'SELECT * FROM lichigueria_sales WHERE date = ? ORDER BY id ASC',
        [date]
      );
      // Obtener gastos de esa fecha
      const expenses = await db.query(
        'SELECT * FROM lichigueria_expenses WHERE date = ? ORDER BY id ASC',
        [date]
      );

      // Totales
      const totalSales = sales.reduce((acc, curr) => acc + Number(curr.value || 0), 0);
      const totalExpenses = expenses.reduce((acc, curr) => acc + Number(curr.value || 0), 0);

      return res.json({
        date,
        module,
        sales,
        expenses,
        summary: {
          sales: totalSales,
          expenses: totalExpenses,
          balance: totalSales - totalExpenses
        }
      });
    } else {
      return res.status(400).json({ error: 'Módulo inválido.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al generar datos del reporte diario.' });
  }
};
