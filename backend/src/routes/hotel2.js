const express = require('express');
const router = express.Router();
const hotel2Controller = require('../controllers/hotel2');
const requireAuth = require('../middleware/auth');

router.get('/dashboard', requireAuth, hotel2Controller.getDashboard);
router.get('/rooms', requireAuth, hotel2Controller.getRooms);
router.post('/rooms', requireAuth, hotel2Controller.createRoom);
router.get('/rooms/:id', requireAuth, hotel2Controller.getRoomDetail);
router.put('/rooms/:id', requireAuth, hotel2Controller.updateRoom);
router.post('/rooms/:roomId/guest', requireAuth, hotel2Controller.assignGuest);
router.post('/rooms/:roomId/payment', requireAuth, hotel2Controller.registerPayment);
router.post('/rooms/:roomId/checkout', requireAuth, hotel2Controller.checkoutGuest);
router.post('/transactions', requireAuth, hotel2Controller.createTransaction);
router.get('/transactions', requireAuth, hotel2Controller.getTransactions);
router.delete('/transactions/:id', requireAuth, hotel2Controller.deleteTransaction);

module.exports = router;
