const express = require('express');
const router = express.Router();
const restController = require('../controllers/restaurante');
const requireAuth = require('../middleware/auth');

router.get('/dashboard', requireAuth, restController.getDashboard);
router.post('/sales', requireAuth, restController.createSale);
router.get('/sales', requireAuth, restController.getSales);
router.post('/expenses', requireAuth, restController.createExpense);
router.get('/expenses', requireAuth, restController.getExpenses);

module.exports = router;
