const pool = require('../config/db');

const getHistoryBooking = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const queryText = `
            SELECT 
                r.id, 
                r.flight_id, 
                r.seat_number, 
                r.status, 
                r.created_at, 
                u.full_name,
                f.flight_number
            FROM reservations r
            INNER JOIN users u ON r.user_id = u.id
            INNER JOIN flights f ON r.flight_id = f.id
            ORDER BY r.created_at DESC
            LIMIT 50;
        `;

        const result = await client.query(queryText);
        res.status(200).json({
            success: true,
            data: result.rows
        });

    } catch (err) {
        console.error("❌ Lỗi khi truy vấn lịch sử đặt vé từ CockroachDB:", err.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi hệ thống khi truy vấn dữ liệu từ các node phân tán!'
        });
    } finally {
        if (client) {
            client.release();
        }
    }
};

module.exports = {
    getHistoryBooking
};