const express = require('express');
const router = express.Router();
const BookTicket = require('../controllers/TicketControllers');

router.post('/book-ticket', BookTicket.BookTicket);
router.get('/flights', BookTicket.GetFlights);
router.post('/book-flight-stimulate', BookTicket.BookFlightStimulate);

module.exports = router;