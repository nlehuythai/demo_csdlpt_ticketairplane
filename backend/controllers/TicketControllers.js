const pool = require('../config/db');

// =================================================================
// 1. HÀM ĐẶT VÉ CHÍNH THỨC (Có BEGIN/COMMIT và Retry Transaction)
// =================================================================
const BookTicket = async (req, res) => {
    // Frontend giờ truyền lên userId (ví dụ: 1) và seatNumber (ví dụ: '12A') thay vì customerName
    const flightId = parseInt(req.body.flightId || req.body.flight_id);
    const userId = parseInt(req.body.userId || req.body.user_id) || 1;
    const seatNumber = req.body.seatNumber || req.body.seat_number || 'B1';
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
        attempt++;
        let client;
        let isInTransaction = false;

        try {
            client = await pool.connect();
            // Thiết lập timeout 3 giây tránh treo kết nối khi Node DB bị kill ngầm bởi Chaos Mesh
            await client.query('SET statement_timeout = 3000');
            await client.query('BEGIN');
            isInTransaction = true;

            // Kiểm tra số ghế trống và LOCK hàng dữ liệu bằng FOR UPDATE chống ghi đè đồng thời
            const flightCheck = await client.query(
                'SELECT available_seats FROM flights WHERE id = $1 FOR UPDATE',
                [flightId]
            );

            if (flightCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                isInTransaction = false;
                return res.status(444).json({ success: false, message: 'Không tìm thấy chuyến bay!' });
            }

            const availableSeats = flightCheck.rows[0].available_seats;

            if (availableSeats <= 0) {
                await client.query('ROLLBACK');
                isInTransaction = false;
                return res.status(400).json({ success: false, message: 'Rất tiếc, chuyến bay đã hết ghế!' });
            }

            // Thực hiện trừ bớt 1 ghế trống trực tiếp trong bảng flights
            await client.query(
                'UPDATE flights SET available_seats = available_seats - 1 WHERE id = $1 AND available_seats > 0',
                [flightId]
            );

            // Chèn bản ghi mới vào bảng trung gian reservations liên kết với bảng users bằng userId
            await client.query(
                `INSERT INTO reservations (user_id, flight_id, seat_number, status,created_at) 
                 VALUES ($1, $2, $3, 'confirmed', NOW())`,
                [userId, flightId, seatNumber]
            );


            await client.query('COMMIT');
            isInTransaction = false;

            const userQuery = await client.query('SELECT full_name FROM users WHERE id = $1', [userId]);
            const customerName = userQuery.rows[0]?.full_name || 'Hành khách';

            return res.status(200).json({
                success: true,
                message: `Chúc mừng ${customerName}, bạn đã đặt thành công ghế ${seatNumber || ''}! (Lượt thử: ${attempt})`
            });

        } catch (err) {
            console.error(`🚨 [SQL BookTicket - Lượt ${attempt}/${MAX_RETRIES}]:`, err.message);

            if (client && isInTransaction) {
                try {
                    await client.query('ROLLBACK');
                } catch (rollbackErr) {
                    console.error("Không thể rollback giao dịch:", rollbackErr.message);
                }
            }

            // Định nghĩa các mã lỗi hệ thống phân tán có thể Retry (Tranh chấp 40001, Pod DB Terminated, Network timeout)
            const isRetryableError =
                err.code === '40001' ||
                err.code === '57P01' ||
                err.code === '08006' ||
                err.message.includes('timeout') ||
                err.message.includes('terminated');

            if (isRetryableError && attempt < MAX_RETRIES) {
                const delay = attempt * 300; // Hoãn binh tăng dần (Exponential Backoff)
                console.warn(`🔄 Đang tự động thực thi lại lệnh SQL sau ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));

                if (client) {
                    try { client.release(); } catch (e) { }
                }
                continue; // Nhảy lên đầu vòng lặp while để lấy client mới chạy lại từ đầu BEGIN
            }

            // Trả về lỗi 503 cho Frontend nếu thử lại hết lượt mà cụm DB vẫn sập diện rộng
            return res.status(503).json({
                success: false,
                message: `Hạ tầng dữ liệu gián đoạn do sự cố Chaos Mesh sau ${attempt} lần thử lại. Chi tiết: ${err.message}`
            });

        } finally {
            // CHỐNG CRASH SẬP POD BACKEND: Luôn kiểm tra sự tồn tại của client trước khi nhả về pool
            if (client) {
                try {
                    client.release();
                } catch (releaseErr) {
                    console.error("Lỗi giải phóng client:", releaseErr.message);
                }
            }
        }
    }
};

// =================================================================
// 2. HÀM LẤY DANH SÁCH CHUYẾN BAY (Phục vụ hiển thị Dashboard)
// =================================================================
const GetFlights = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT * FROM flights ORDER BY id ASC');
        return res.status(200).json(result.rows);
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    } finally {
        if (client) {
            try { client.release(); } catch (e) { }
        }
    }
};

// =================================================================
// 3. HÀM GIẢ LẬP ĐẶT VÉ NHANH (Atomic Update - Dùng cho Auto-Pilot)
// =================================================================
const BookFlightStimulate = async (req, res) => {
    const { flight_id, user_id, seat_number } = req.body;

    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
        attempt++;
        let client;
        try {
            client = await pool.connect();
            await client.query('SET statement_timeout = 3000');

            // 🌟 SỬA 1: Bắt đầu một Transaction nghiêm ngặt
            await client.query('BEGIN');

            // 🌟 SỬA 2: Sử dụng SELECT FOR UPDATE NOWAIT để khóa cứng dòng chuyến bay này lại
            // Thằng nào vào sau sẽ lập tức dính lỗi xung đột transaction, không cho xếp hàng chờ
            const checkFlight = await client.query(
                `SELECT available_seats FROM flights WHERE id = $1 FOR UPDATE NOWAIT`,
                [flight_id]
            );

            if (checkFlight.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: 'Không tìm thấy chuyến bay!' });
            }

            const currentSeats = checkFlight.rows[0].available_seats;

            // Kiểm tra nếu hết ghế thì hủy transaction ngay
            if (currentSeats <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Rất tiếc, chuyến bay đã hết ghế!' });
            }

            // Tiến hành trừ ghế
            await client.query(
                `UPDATE flights SET available_seats = available_seats - 1 WHERE id = $1`,
                [flight_id]
            );

            // Thêm bản ghi đặt vé
            await client.query(
                `INSERT INTO reservations (user_id, flight_id, seat_number, status) 
                 VALUES ($1, $2, $3, 'confirmed')`,
                [user_id || 1, flight_id, seat_number || 'K8S-Stimulate']
            );

            // 🌟 SỬA 3: Chốt giao dịch thành công toàn vẹn
            await client.query('COMMIT');

            return res.status(200).json({
                success: true,
                message: `Đặt vé thành công ở lượt thử thứ ${attempt}!`
            });

        } catch (err) {
            // Nếu có lỗi, phải ROLLBACK ngay để giải phóng bộ nhớ khóa dòng
            if (client) { try { await client.query('ROLLBACK'); } catch (e) { } }

            console.error(`🚨 [SQL Stimulate - Lượt ${attempt}/${MAX_RETRIES}]:`, err.message);

            // 🌟 SỬA 4: XÓA '40001' ra khỏi đây. 
            // Khi dính lỗi xung đột dũ liệu 40001, ta muốn hệ thống trả lỗi thẳng về Frontend 
            // để Frontend báo THẤT BẠI cho User B, giúp mô phỏng đúng kịch bản tranh chấp.
            const isRetryableError =
                err.code === '57P01' || // Node bị crash
                err.code === '08006' || // Mất kết nối mạng hoàn toàn
                err.message.includes('timeout') ||
                err.message.includes('terminated');

            if (isRetryableError && attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, attempt * 200));
                if (client) { try { client.release(); } catch (e) { } }
                continue;
            }

            // Nếu dính lỗi 40001 (Xung đột ghi đồng thời) hoặc quá lượt retry, báo lỗi về Frontend
            const isConflict = err.code === '40001' || err.message.includes('lock');
            return res.status(isConflict ? 409 : 500).json({
                success: false,
                message: isConflict
                    ? 'Xung đột giao dịch (Serializable Conflict) - Bạn đã chậm hơn một mili-giây!'
                    : 'Lỗi hệ thống phân tán: ' + err.message
            });
        } finally {
            if (client) {
                try { client.release(); } catch (e) { }
            }
        }
    }
};

module.exports = { BookTicket, GetFlights, BookFlightStimulate };