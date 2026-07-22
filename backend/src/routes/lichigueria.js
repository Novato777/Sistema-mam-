const express = require('express');
const router = express.Router();
const lichigueriaController = require('../controllers/lichigueria');
const requireAuth = require('../middleware/auth');

router.get('/dashboard', requireAuth, lichigueriaController.getDashboard);
router.post('/providers', requireAuth, lichigueriaController.createProvider);
router.get('/providers', requireAuth, lichigueriaController.getProviders);
router.post('/sales', requireAuth, lichigueriaController.createSale);
router.get('/sales', requireAuth, lichigueriaController.getSales);
router.delete('/sales/:id', requireAuth, lichigueriaController.deleteSale);
router.post('/expenses', requireAuth, lichigueriaController.createExpense);
router.get('/expenses', requireAuth, lichigueriaController.getExpenses);
router.delete('/expenses/:id', requireAuth, lichigueriaController.deleteExpense);

module.exports = router;
