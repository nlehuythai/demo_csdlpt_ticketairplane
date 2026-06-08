import { useState } from 'react';
import { Users, Zap, ShieldCheck, ShieldAlert, Loader2, RefreshCw } from 'lucide-react';

// ==========================================
// 1. COMPONENT CON: USER PANEL (Giữ nguyên giao diện đẹp của bạn)
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
// 2. COMPONENT CHÍNH: RACE SIMULATION (Đã sửa lỗi đồng thì, cô lập luồng)
// ==========================================
const RaceSimulation = () => {
  const [statusA, setStatusA] = useState('idle');
  const [statusB, setStatusB] = useState('idle');
  const [logs, setLogs] = useState([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [winners, setWinners] = useState({ A: null, B: null });
  const BASE_URL = "http://127.0.0.1:54725"; // Hãy chắc chắn port này trùng với minikube service/port-forward của bạn

  const generateRandomSeat = () => {
    const seatRows = ['A', 'B', 'C', 'D', 'E', 'F'];
    return Math.floor(Math.random() * 30 + 1) + seatRows[Math.floor(Math.random() * seatRows.length)];
  };

  // 🛠️ CẢI TIẾN 1: Hàm gọi API phòng chống lỗi Parse JSON khi sập Cluster mạng
  const bookTicketRealAPI = async (displayName, userId, flightId) => {
    const randomSeat = generateRandomSeat();

    // Khởi tạo bộ điều khiển hủy request
    const controller = new AbortController();
    // Thiết lập tự động kích hoạt hủy sau 4000ms (4 giây)
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetch(`${BASE_URL}/api/tickets/book-flight-stimulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal, // ✅ SỬA LỖI 1: Gắn signal vào đây để fetch biết đường tự hủy khi quá hạn
        body: JSON.stringify({
          flight_id: flightId.toString(), // Sử dụng tham số flightId truyền vào thay vì ép cứng '1'
          user_id: userId,
          seat_number: randomSeat
        })
      });

      // Xóa bộ đếm thời gian ngay khi Backend trả dữ liệu về kịp lúc
      clearTimeout(timeoutId);

      // Đọc dạng text trước để tránh crash khi response rỗng
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
      // Đảm bảo luôn xóa bộ đếm thời gian khi luồng rơi vào catch
      clearTimeout(timeoutId);

      // ✅ SỬA LỖI 2: Bắt riêng trường hợp tự hủy do quá thời gian chờ (Timeout)
      if (error.name === 'AbortError') {
        return {
          user: displayName,
          seat: randomSeat,
          success: false,
          status: 408, // Mã lỗi Request Timeout tiêu chuẩn
          message: "Cơ sở dữ liệu phân tán dính khóa dòng (Lock Wait Timeout) - Frontend đã tự hủy request!"
        };
      }

      // Trả về lỗi mất kết nối hệ thống thông thường
      return {
        user: displayName,
        seat: randomSeat,
        success: false,
        status: 500,
        message: "Lỗi kết nối hỏa tốc tới K8s Cluster (Chaos Active)!"
      };
    }
  };

  // 🛠️ CẢI TIẾN 2: Tách biệt hoàn toàn luồng xử lý UI (Xong trước render trước, không đợi nhau)
  const simulateConflict = async () => {
    setIsSimulating(true);
    setStatusA('loading');
    setStatusB('loading');
    setWinners({ A: null, B: null });

    const TARGET_FLIGHT_ID = "1"; // Để dạng chuỗi đồng bộ với database số lớn

    setLogs(prev => [{
      time: new Date().toLocaleTimeString(),
      msg: "🚀 Hệ thống: Phát lệnh TRANH CHẤP ĐỒNG THỜI (Concurrent Requests) lên CockroachDB...",
      type: 'info'
    }, ...prev]);

    // Hàm thực thi đơn lẻ, tự cập nhật UI độc lập ngay khi nhận được tín hiệu mạng
    const executeUserRequest = async (displayName, userId, setStatus, winnerKey) => {
      const res = await bookTicketRealAPI(displayName, userId, TARGET_FLIGHT_ID);

      // Đảm bảo dữ liệu không bị undefined
      const safeRes = res || { success: false, message: "Lỗi treo hệ thống mạng", user: displayName, seat: "N/A", status: 500 };

      // Luồng này chạy xong là cập nhật UI ngay lập tức cho User đó!
      setStatus(safeRes.success ? 'success' : 'error');

      if (safeRes.success) {
        setWinners(prev => ({
          ...prev,
          [winnerKey]: `${safeRes.user} [Ghế ${safeRes.seat}]`
        }));
      }

      // Đẩy log realtime lên màn hình Console Log phía dưới ngay khi có kết quả
      setLogs(prev => [{
        time: new Date().toLocaleTimeString(),
        msg: safeRes.success
          ? `✅ ${safeRes.user}: ĐẶT VÉ THÀNH CÔNG! Đã chốt giữ chỗ ghế ${safeRes.seat} trên CockroachDB.`
          : `⚠️ ${safeRes.user}: THẤT BẠI - ${safeRes.message} (Mã phản hồi: ${safeRes.status})`,
        type: safeRes.success ? 'success' : 'error'
      }, ...prev]);

      return safeRes;
    };

    try {
      // 🌟 Điểm mấu chốt: Bắn đồng thời ra mạng cùng một mili-giây, nhưng bên trong tự render độc lập
      await Promise.all([
        executeUserRequest('Huy Thai (User A)', 1, setStatusA, 'A'),
        executeUserRequest('Guest (User B)', 2, setStatusB, 'B')
      ]);
    } catch (err) {
      console.error("Lỗi chí mạng khi chạy mô phỏng cuộc đua:", err);
    } finally {
      // Đảm bảo nút bấm luôn luôn giải phóng kể cả khi cluster bị quật sập
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