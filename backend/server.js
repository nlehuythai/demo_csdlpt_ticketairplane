
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const ticketRoutes = require('./routes/TicketRoutes');
app.use('/api/tickets', ticketRoutes);
const nodeRoutes = require('./routes/NodeRoutes');
app.use('/api/nodes', nodeRoutes);
const historyBookingRoutes = require('./routes/HistoryBookingRoutes');
app.use('/api/history-booking', historyBookingRoutes);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại: http://localhost:${PORT}`);
});