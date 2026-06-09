import React, { useState, useEffect } from "react";

const HistoryBooking = ({ bookings, setBookings, hasLoadedHistory, setHasLoadedHistory }) => {
    const [loading, setLoading] = useState(!hasLoadedHistory);
    const [error, setError] = useState(null);
    const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

    const fetchHistory = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${BASE_URL}/api/history-booking`);
            const res = await response.json();

            // Xử lý phòng vệ lấy mảng dữ liệu tùy thuộc vào cấu trúc trả về của API
            const actualData = res.data ? res.data : (Array.isArray(res) ? res : []);

            setBookings(actualData);
            setHasLoadedHistory(true);
        } catch (err) {
            setError("Không thể tải lịch sử đặt vé từ cụm phân tán!");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!hasLoadedHistory) {
            fetchHistory();
        }
    }, [hasLoadedHistory]);

    return (
        <div className="min-h-screen bg-gray-900 text-white p-6">
            {/* Header Dashboard */}
            <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
                <div>
                    <h1 className="text-3xl font-bold text-blue-400">Dashboard Lịch Sử Đặt Vé</h1>
                    <p className="text-gray-400 text-sm">Quản lý trạng thái giao dịch trên cụm CockroachDB (5 Bảng chuẩn hóa)</p>
                </div>
                <button
                    onClick={fetchHistory}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition duration-200 active:scale-95"
                >
                    🔄 Làm mới dữ liệu (F5)
                </button>
            </div>

            {/* Thông báo lỗi nếu có */}
            {error && (
                <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded mb-4 shadow-lg animate-pulse">
                    ⚠️ {error}
                </div>
            )}

            {/* Trạng thái Loading */}
            {loading ? (
                <div className="text-center py-10 text-gray-400 font-medium animate-pulse">
                    🔄 Đang truy vấn đồng thời dữ liệu từ các Node phân tán...
                </div>
            ) : (
                /* Bảng hiển thị Lịch sử đặt vé */
                <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl border border-gray-700">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-700 text-gray-200 uppercase text-xs font-bold tracking-wider">
                                <th className="p-4">Mã Vé (ID)</th>
                                <th className="p-4">ID Chuyến Bay</th>
                                <th className="p-4">Hành Khách</th>
                                <th className="p-4">Số Ghế</th> {/* Cột mới tương thích database */}
                                <th className="p-4">Trạng Thái</th>
                                <th className="p-4">Thời Gian Đặt</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {bookings.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="text-center p-8 text-gray-500">
                                        Chưa có giao dịch đặt vé nào được ghi nhận trong hệ thống.
                                    </td>
                                </tr>
                            ) : (
                                bookings.map((ticket) => {
                                    const ticketIdStr = ticket.id ? ticket.id.toString() : "";
                                    const shortId = ticketIdStr.length > 8 ? `#${ticketIdStr.substring(0, 8)}...` : `#${ticketIdStr}`;

                                    return (
                                        <tr key={ticket.id} className="hover:bg-gray-750/50 transition duration-150">
                                            {/* 1. Mã Vé */}
                                            <td className="p-4 text-sm font-mono text-yellow-400">
                                                {shortId}
                                            </td>

                                            {/* 2. Mã Chuyến Bay */}
                                            <td className="p-4 text-blue-300 font-mono text-sm">
                                                Flight #{ticket.flight_id}
                                            </td>

                                            {/* 3. Tên Hành Khách (Lấy full_name từ JOIN hoặc full_name trả về) */}
                                            <td className="p-4 font-semibold text-gray-200">
                                                {ticket.full_name || ticket.customer_name || "Huy Thai"}
                                            </td>

                                            {/* 4. Số Ghế (Thuộc tính mới từ bảng reservations) */}
                                            <td className="p-4 text-sm font-mono text-purple-300">
                                                {ticket.seat_number || "K8S-Auto"}
                                            </td>

                                            {/* 5. Trạng thái đặt chỗ */}
                                            <td className="p-4 text-sm">
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${ticket.status === 'confirmed' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                                                    }`}>
                                                    {ticket.status || 'confirmed'}
                                                </span>
                                            </td>

                                            {/* 6. Thời Gian Đặt (Đồng bộ theo trường created_at) */}
                                            <td className="p-4 text-sm text-gray-400">
                                                {ticket.created_at ? new Date(ticket.created_at).toLocaleString('vi-VN') : "Vừa xong"}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default HistoryBooking;