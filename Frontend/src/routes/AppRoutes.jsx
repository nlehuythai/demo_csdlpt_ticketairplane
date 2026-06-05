import BookingDashboard from "../Components/BookingDasboard";
import RaceSimulation from "../Components/RaceSimulation";
import Sidebar from "../Components/SideBar";
import HistoryBooking from "../Components/HistoryBooking";
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useState } from "react";
const AppRoutes = () => {
    const [bookings, setBookings] = useState([]);
    const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
    const [flights, setFlights] = useState([]);
    const [selectedFlightId, setSelectedFlightId] = useState('');
    const [hasLoadedFlights, setHasLoadedFlights] = useState(false);
    return (
        <BrowserRouter>
            <div className="flex">
                {/* Sidebar nằm cố định bên trái */}
                <Sidebar />

                {/* Nội dung trang nằm bên phải, cách lề 64 (w-64) để không bị Sidebar đè lên */}
                <main className="flex-1 ml-64 min-h-screen bg-slate-950">
                    <Routes>
                        <Route path="/dashboard" element={<BookingDashboard
                            flights={flights}
                            setFlights={setFlights}
                            selectedFlightId={selectedFlightId}
                            setSelectedFlightId={setSelectedFlightId}
                            hasLoadedFlights={hasLoadedFlights}
                            setHasLoadedFlights={setHasLoadedFlights}
                        />} />
                        {/* Thêm Route cho 2 account test ở đây */}
                        <Route path="/simulation" element={<RaceSimulation></RaceSimulation>} />
                        <Route path="/history-booking" element={<HistoryBooking
                            bookings={bookings}
                            setBookings={setBookings}
                            hasLoadedHistory={hasLoadedHistory}
                            setHasLoadedHistory={setHasLoadedHistory}
                        />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}

export default AppRoutes;