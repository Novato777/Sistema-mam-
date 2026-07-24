const express = require('express');
const router = express.Router();
const hotel1Controller = require('../controllers/hotel1');
const requireAuth = require('../middleware/auth');

// Rutas protegidas por token
router.get('/dashboard', requireAuth, hotel1Controller.getDashboard);
router.get('/rooms', requireAuth, hotel1Controller.getRooms);
router.post('/rooms', requireAuth, hotel1Controller.createRoom);
router.get('/rooms/:id', requireAuth, hotel1Controller.getRoomDetail);
router.put('/rooms/:id', requireAuth, hotel1Controller.updateRoom);
router.post('/rooms/:roomId/guest', requireAuth, hotel1Controller.assignGuest);
router.post('/rooms/:roomId/payment', requireAuth, hotel1Controller.registerPayment);
router.post('/rooms/:roomId/checkout', requireAuth, hotel1Controller.checkoutGuest);
router.post('/transactions', requireAuth, hotel1Controller.createTransaction);
router.get('/transactions', requireAuth, hotel1Controller.getTransactions);
router.delete('/transactions/:id', requireAuth, hotel1Controller.deleteTransaction);

module.exports = router;
