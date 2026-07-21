const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports');
const requireAuth = require('../middleware/auth');

router.get('/daily', requireAuth, reportsController.getDailyReport);

module.exports = router;
