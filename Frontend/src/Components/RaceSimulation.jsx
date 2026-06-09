import { useState } from 'react';
import { Users, Zap, ShieldCheck, ShieldAlert, Loader2, RefreshCw } from 'lucide-react';

// ==========================================
// 1. COMPONENT CON: USER PANEL 
// ==========================================
const UserPanel = ({ name, status, color, winnerName }) => {
  const statusStyles = {
    idle: "border-slate-800 bg-slate-900/20",
    loading: "border-amber-500 bg-amber-500/5 animate-pulse",
    success: "border-green-500 bg-green-950/20 raw-shadow-green",
    error: "border-red-500 bg-red-950/20"
  };

  const textColors = color === 'blue' ? 'text-blue-400' : 'text-purple-400';

  return (
    <div className={`border-2 p-8 rounded-2xl transition-all duration-300 ${statusStyles[status]}`}>
      <div className="flex items-center gap-3 mb-4">
        <Users className={textColors} size={24} />
        <h3 className="font-black text-xl text-slate-200">{name}</h3>
      </div>

      <div className="h-28 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl bg-slate-950/50">
        {status === 'idle' && (
          <span className="text-slate-500 font-medium text-sm">Đang chờ kích hoạt...</span>
        )}

        {status === 'loading' && (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="animate-spin text-amber-500" size={40} />
            <span className="text-xs text-amber-400 font-semibold animate-pulse">ĐANG TRANH VÉ...</span>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center animate-bounce">
            <ShieldCheck size={44} className="text-green-400" />
            <span className="text-sm font-black text-green-400 mt-2 tracking-wider uppercase text-center px-2">
              🎉 WINNER: {winnerName}
            </span>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center">
            <ShieldAlert size={44} className="text-red-400" />
            <span className="text-xs font-bold text-red-400 mt-2 uppercase text-center px-2">
              THẤT BẠI (Chênh lệch/Hết ghế)
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 2. COMPONENT CHÍNH: RACE SIMULATION
// ==========================================
const RaceSimulation = () => {
  const [statusA, setStatusA] = useState('idle');
  const [statusB, setStatusB] = useState('idle');
  const [logs, setLogs] = useState([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [winners, setWinners] = useState({ A: null, B: null });
  const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'; // Cổng kết nối K8s Cluster của bạn

  const generateRandomSeat = () => {
    const seatRows = ['A', 'B', 'C', 'D', 'E', 'F'];
    return Math.floor(Math.random() * 30 + 1) + seatRows[Math.floor(Math.random() * seatRows.length)];
  };

  const bookTicketRealAPI = async (displayName, userId, flightId) => {
    const randomSeat = generateRandomSeat();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetch(`${BASE_URL}/api/tickets/book-flight-stimulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          flight_id: flightId.toString(),
          user_id: userId,
          seat_number: randomSeat
        })
      });

      clearTimeout(timeoutId);

      const resText = await response.text();
      let data = {};
      try {
        data = resText ? JSON.parse(resText) : {};
      } catch (e) {
        data = { message: "Phản hồi không đúng định dạng JSON" };
      }

      return {
        user: displayName,
        seat: randomSeat,
        success: response.ok && data.success !== false,
        status: response.status,
        message: data.message || (response.ok ? "Thành công" : "Lỗi hệ thống")
      };

    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        return {
          user: displayName,
          seat: randomSeat,
          success: false,
          status: 408,
          message: "Cơ sở dữ liệu phân tán dính khóa dòng (Lock Wait Timeout)!"
        };
      }
      return {
        user: displayName,
        seat: randomSeat,
        success: false,
        status: 500,
        message: "Lỗi kết nối hỏa tốc tới K8s Cluster (Chaos Active)!"
      };
    }
  };

  // 🌟 CẬP NHẬT CHIẾN THUẬT: Đảo thứ tự ngẫu nhiên để xử lý tranh chấp 2 người thực tế
  // 🌟 CẬP NHẬT CHIẾN THUẬT: Ép buộc phân phối mạng ngẫu nhiên 100% bằng cơ chế rẽ nhánh
  const simulateConflict = async () => {
    setIsSimulating(true);
    setStatusA('loading');
    setStatusB('loading');
    setWinners({ A: null, B: null });

    const TARGET_FLIGHT_ID = "1";

    setLogs(prev => [{
      time: new Date().toLocaleTimeString(),
      msg: "🎲 Chaos Lab: Khởi động thuật toán tung đồng xu phân bổ luồng xử lý mạng...",
      type: 'info'
    }, ...prev]);

    // Luồng xử lý UI độc lập cho từng User
    const executeUserRequest = async (displayName, userId, setStatus, winnerKey) => {
      const res = await bookTicketRealAPI(displayName, userId, TARGET_FLIGHT_ID);
      const safeRes = res || { success: false, message: "Lỗi treo hệ thống mạng", user: displayName, seat: "N/A", status: 500 };

      setStatus(safeRes.success ? 'success' : 'error');

      if (safeRes.success) {
        setWinners(prev => ({
          ...prev,
          [winnerKey]: `${safeRes.user} [Ghế ${safeRes.seat}]`
        }));
      }

      setLogs(prev => [{
        time: new Date().toLocaleTimeString(),
        msg: safeRes.success
          ? `✅ ${safeRes.user}: ĐẶT VÉ THÀNH CÔNG! Chiếm Lock gốc trên CockroachDB.`
          : safeRes.status === 409
            ? `⚠️ ${safeRes.user}: THẤT BẠI - Xung đột giao dịch (Bị chặn bởi FOR UPDATE NOWAIT).`
            : `⚠️ ${safeRes.user}: THẤT BẠI - ${safeRes.message} (Mã lỗi: ${safeRes.status})`,
        type: safeRes.success ? 'success' : 'error'
      }, ...prev]);

      return safeRes;
    };
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const isUserAFirst = Math.random() < 0.5;

    try {
      if (isUserAFirst) {
        setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg: "✈️ Luồng ưu tiên microsecond: Huy Thai (User A) phóng trước...", type: 'info' }, ...prev]);

        await Promise.all([
          executeUserRequest('Huy Thai (User A)', 1, setStatusA, 'A'),
          (async () => { await delay(5); return executeUserRequest('Guest (User B)', 2, setStatusB, 'B'); })()
        ]);
      } else {
        setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg: "✈️ Luồng ưu tiên microsecond: Guest (User B) phóng trước...", type: 'info' }, ...prev]);
        await Promise.all([
          executeUserRequest('Guest (User B)', 2, setStatusB, 'B'),
          (async () => { await delay(5); return executeUserRequest('Huy Thai (User A)', 1, setStatusA, 'A'); })()
        ]);
      }
    } catch (err) {
      console.error("Lỗi khi chạy mô phỏng cuộc đua:", err);
    } finally {
      setIsSimulating(false);
    }
  };

  const resetSimulation = () => {
    setStatusA('idle');
    setStatusB('idle');
    setWinners({ A: null, B: null });
    setLogs([]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-8 text-center">
        <div className="inline-flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-full border border-slate-800 text-xs font-bold text-blue-400 mb-3 tracking-widest uppercase animate-pulse">
          <Zap size={14} /> Chaos Engineering Lab
        </div>
        <h2 className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 text-3xl font-black uppercase tracking-wider">
          Target: Flight Race Simulation
        </h2>
        <p className="text-slate-500 text-xs mt-1">Mô phỏng xung đột đặt vé máy bay trên cơ sở dữ liệu phân tán (5 Bảng chuẩn hóa)</p>
      </div>

      {/* Khu vực hiển thị 2 Users tham gia cuộc đua */}
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <UserPanel name="Huy Thai (User A)" status={statusA} color="blue" winnerName={winners.A} />
        <UserPanel name="Guest (User B)" status={statusB} color="purple" winnerName={winners.B} />
      </div>

      {/* Nút điều khiển */}
      <div className="max-w-4xl mx-auto flex justify-center gap-4 mb-8">
        <button
          onClick={simulateConflict}
          disabled={isSimulating}
          className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 px-10 py-4 rounded-xl font-black text-sm uppercase tracking-wider transition-all duration-200 shadow-lg shadow-orange-600/10 active:scale-[0.98] disabled:shadow-none"
        >
          {isSimulating ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              <span>Đang xử lý cuộc đua...</span>
            </>
          ) : (
            <span>KÍCH HOẠT TRANH CHẤP</span>
          )}
        </button>

        <button
          onClick={resetSimulation}
          disabled={isSimulating}
          className="flex items-center gap-2 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/50 disabled:opacity-30 px-6 py-4 rounded-xl font-bold text-sm uppercase tracking-wider transition-all"
        >
          <RefreshCw size={16} />
          Reset
        </button>
      </div>

      {/* Bảng Log trực quan */}
      <div className="max-w-4xl mx-auto border border-slate-800 rounded-2xl bg-slate-900/30 p-6">
        <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
          Console Logs realtime:
        </h4>
        <div className="h-48 overflow-y-auto border border-slate-900 bg-slate-950/80 p-4 rounded-xl font-mono text-xs space-y-2 scrollbar-thin scrollbar-thumb-slate-800">
          {logs.length === 0 ? (
            <p className="text-slate-600 italic text-center pt-16">Chưa có hoạt động nào. Hãy bấm "Kích hoạt tranh chấp" để quan sát cơ chế cô lập giao dịch.</p>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                className={`p-2 rounded border transition-all duration-150 ${log.type === 'success' ? 'bg-green-950/30 border-green-900/50 text-green-400' :
                  log.type === 'error' ? 'bg-red-950/30 border-red-900/50 text-red-400' :
                    'bg-slate-900 border-slate-800 text-blue-400'
                  }`}
              >
                <span className="text-slate-500 font-semibold mr-2">[{log.time}]</span>
                <span>{log.msg}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default RaceSimulation;