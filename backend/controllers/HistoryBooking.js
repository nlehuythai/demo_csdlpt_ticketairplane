const pool = require('../config/db');

const getHistoryBooking = async (req, res) => {
    let client;
    try {
        // Lấy một kết nối từ pool để đảm bảo an toàn giao dịch trong môi trường phân tán
        client = await pool.connect();

        // Sử dụng INNER JOIN để gom dữ liệu từ 3 bảng: reservations, users, và flights
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

        // Trả về cấu trúc JSON đúng định dạng { success: true, data: [...] } mà Frontend đang đợi
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
        // Luôn giải phóng kết nối trả lại cho pool, tránh bị tràn connection (Leaking Connections) khi test Chaos
        if (client) {
            client.release();
        }
    }
};

module.exports = {
    getHistoryBooking
};