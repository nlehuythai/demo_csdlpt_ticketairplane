import { useState, useEffect, useRef } from 'react';
import { Activity, Plane, Server, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
const BookingDashboard = ({
    flights,
    setFlights,
    selectedFlightId,
    setSelectedFlightId,
    hasLoadedFlights,
    setHasLoadedFlights
}) => {
    const [logs, setLogs] = useState([]);
    const [isAuto, setIsAuto] = useState(false);
    const [nodes, setNodes] = useState([]);
    const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

    const flightsRef = useRef(flights);
    const selectedFlightIdRef = useRef(selectedFlightId);

    // Luôn đồng bộ giá trị từ props/state vào Ref mỗi khi chúng thay đổi
    useEffect(() => {
        flightsRef.current = flights;
    }, [flights]);

    useEffect(() => {
        selectedFlightIdRef.current = selectedFlightId;
    }, [selectedFlightId]);

    const fetchNodes = async () => {
        try {
            const response = await fetch(`${BASE_URL}/api/nodes`);
            const data = await response.json();
            setNodes(data);
        } catch (error) {
            console.error('Error fetching nodes:', error);
        }
    };

    useEffect(() => {
        fetchNodes();
        const nodeInterval = setInterval(() => {
            fetchNodes();
        }, 2000);

        return () => clearInterval(nodeInterval);
    }, []);

    const bookFlight = async () => {
        // Lấy ID hiện tại trực tiếp từ Ref để đảm bảo không bao giờ bị cũ
        const currentFlightId = selectedFlightIdRef.current;
        if (!currentFlightId) return;

        const startTime = Date.now();
        const newLog = {
            id: Date.now(),
            time: new Date().toLocaleTimeString(),
            latency: 0,
            status: 'pending',
            message: 'Đang gửi yêu cầu đặt chỗ và xử lý phân tán...'
        };

        setLogs(prev => [newLog, ...prev].slice(0, 10));

        const fetchWithTimeout = async (url, options, timeout = 3000) => {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);
            try {
                const response = await fetch(url, { ...options, signal: controller.signal });
                clearTimeout(id);
                return response;
            } catch (error) {
                clearTimeout(id);
                throw error;
            }
        };

        const seatRows = ['A', 'B', 'C', 'D', 'E', 'F'];
        const randomSeatNumber = Math.floor(Math.random() * 30 + 1) + seatRows[Math.floor(Math.random() * seatRows.length)];

        const requestBody = JSON.stringify({
            flightId: parseInt(currentFlightId),
            userId: 1,
            seatNumber: randomSeatNumber
        });

        try {
            let response;
            try {
                response = await fetchWithTimeout(`${BASE_URL}/api/tickets/book-ticket`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: requestBody
                }, 3000);
            } catch (fetchError) {
                if (fetchError.name === 'AbortError' || fetchError.message.includes('Failed to fetch')) {
                    console.warn("🔄 Phát hiện nghẽn mạch do Chaos! Tự động định tuyến lại sang Pod dự phòng...");

                    setLogs(prev => prev.map(log =>
                        log.id === newLog.id ? { ...log, message: `[Chaos Mesh] Kết nối gián đoạn! Đang tự động thử lại ghế ${randomSeatNumber}...` } : log
                    ));

                    await new Promise(resolve => setTimeout(resolve, 300));

                    response = await fetchWithTimeout(`${BASE_URL}/api/tickets/book-ticket`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: requestBody
                    }, 3000);
                } else {
                    throw fetchError;
                }
            }

            const data = await response.json();
            const duration = Date.now() - startTime;

            if (data.success) {
                setLogs(prev => prev.map(log =>
                    log.id === newLog.id ? {
                        ...log,
                        latency: duration,
                        status: 'success',
                        message: data.message || 'Đặt vé thành công!'
                    } : log
                ));

                // Cập nhật mảng flights thông qua hàm callback bảo đảm đồng bộ
                setFlights(prevFlights => {
                    return prevFlights.map(flight => {
                        if (flight.id == parseInt(currentFlightId)) {
                            return {
                                ...flight,
                                available_seats: Math.max(0, flight.available_seats - 1)
                            };
                        }
                        return flight;
                    });
                });
            } else {
                setLogs(prev => prev.map(log =>
                    log.id === newLog.id ? { ...log, latency: duration, status: 'error', message: data.message } : log
                ));
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            setLogs(prev => prev.map(log =>
                log.id === newLog.id ? { ...log, latency: duration, status: 'error', message: 'Hệ thống bận (Chaos Network): ' + error.message } : log
            ));
        }
    };

    const fetchFlights = async () => {
        try {
            const response = await fetch(`${BASE_URL}/api/tickets/flights`);
            const data = await response.json();
            setFlights(data);
            setHasLoadedFlights(true);
            if (data.length > 0 && !selectedFlightId) setSelectedFlightId(data[0].id);
        } catch (error) {
            console.error('Error fetching flights:', error);
        }
    };

    useEffect(() => {
        if (!hasLoadedFlights) {
            fetchFlights();
        }
    }, [hasLoadedFlights]);

    // 🌟 INTERVAL KHÔNG BỊ CLEAR LIÊN TỤC NỮA VÌ DEPENDENCY CỰC KỲ SẠCH
    useEffect(() => {
        let interval;
        if (isAuto) {
            interval = setInterval(() => {
                bookFlight();
            }, 1500);
        }
        return () => clearInterval(interval);
    }, [isAuto]); // Chỉ chạy lại khi bật/tắt nút Auto

    return (
        <div className="min-h-screen bg-slate-900 text-white p-8 font-sans">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-blue-400">Book tickets Dashboard</h1>
                    <p className="text-slate-400">Hệ thống phân tán: CockroachDB Cluster (5 Bảng chuẩn hóa)</p>
                </div>
                <div className="flex flex-wrap gap-4">
                    {Array.isArray(nodes) && nodes.map(node => (
                        <div key={node.name} className="flex items-center bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">
                            <Server className={`mr-2 h-4 w-4 ${node.status === 'Running' && node.ready ? 'text-green-400' : 'text-red-400'}`} />
                            <span className="text-sm font-medium text-slate-200">{node.name}</span>
                            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${node.status === 'Running' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                {node.status}
                            </span>
                        </div>
                    ))}
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Cột điều khiển */}
                <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                    <h2 className="text-xl font-semibold mb-4 flex items-center">
                        <Plane className="mr-2" /> Booking Control
                    </h2>

                    <label className="block text-sm text-slate-400 mb-2">Chọn chuyến bay:</label>
                    <select
                        className="w-full bg-slate-700 p-3 rounded-lg mb-4 outline-none border border-slate-600 text-white font-medium"
                        key={`${selectedFlightId}-${flights.map(f => f.available_seats).join('-')}`}
                        value={selectedFlightId}
                        onChange={(e) => setSelectedFlightId(e.target.value)}
                    >
                        {flights?.map(f => (
                            <option key={f.id} value={f.id} className="bg-slate-700">
                                Chuyến {f.flight_number} ({f.departure} ➔ {f.destination}) | Còn {f.available_seats} ghế
                            </option>
                        ))}
                    </select>

                    <button
                        onClick={bookFlight}
                        className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-bold mb-4 transition flex justify-center items-center shadow-lg shadow-blue-500/20 active:scale-[0.98]"
                    >
                        Đặt vé ngay
                    </button>

                    <div className="flex items-center justify-between p-4 bg-slate-700 rounded-lg">
                        <div className="flex flex-col">
                            <span className="font-medium">Auto-Pilot Mode</span>
                            <span className="text-xs text-slate-400">Tự động bắn request để test Chaos</span>
                        </div>
                        <button
                            onClick={() => setIsAuto(!isAuto)}
                            className={`px-6 py-1 rounded-full font-bold transition-all duration-300 ${isAuto ? 'bg-green-500 text-white shadow-md shadow-green-500/30' : 'bg-slate-500 text-slate-200'}`}
                        >
                            {isAuto ? 'ON' : 'OFF'}
                        </button>
                    </div>
                </div>

                {/* Cột Log giao dịch */}
                <div className="lg:col-span-2 bg-slate-800 p-6 rounded-xl border border-slate-700">
                    <h2 className="text-xl font-semibold mb-4 flex items-center">
                        <Activity className="mr-2" /> Live Transaction Log
                    </h2>
                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                        {logs.length === 0 && <p className="text-slate-500 text-center py-10">Chưa có giao dịch nào được ghi nhận.</p>}
                        {logs.map(log => (
                            <div key={log.id} className={`flex flex-col p-3 bg-slate-900 rounded border-l-4 shadow-sm transition-all duration-200 ${log.status === 'success' ? 'border-l-green-500 bg-green-950/10' :
                                log.status === 'error' ? 'border-l-red-500 bg-red-950/10' : 'border-l-yellow-500 bg-yellow-950/5'
                                }`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <span className="text-xs text-slate-500">{log.time}</span>
                                        <span className="font-semibold text-sm text-slate-400">TXID: ...{log.id.toString().slice(-6)}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`text-xs font-mono ${log.latency > 3000 ? 'text-red-400' : 'text-green-400'}`}>
                                            {log.latency}ms
                                        </span>
                                        {log.status === 'success' ? <CheckCircle2 className="text-green-500 h-4 w-4" /> :
                                            log.status === 'error' ? <AlertCircle className="text-red-500 h-4 w-4" /> :
                                                <RefreshCw className="animate-spin text-yellow-500 h-4 w-4" />}
                                    </div>
                                </div>
                                <p className={`text-xs mt-1.5 font-medium ${log.status === 'success' ? 'text-green-400' : log.status === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
                                    {log.message}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BookingDashboard;