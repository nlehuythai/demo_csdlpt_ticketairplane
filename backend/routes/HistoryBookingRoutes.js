const express = require('express');
const router = express.Router();
const HistoryBookingController = require('../controllers/HistoryBooking');
router.get('/', HistoryBookingController.getHistoryBooking);
module.exports = router;