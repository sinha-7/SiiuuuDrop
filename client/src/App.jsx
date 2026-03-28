import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Pair from './pages/Pair';
import Gallery from './pages/Gallery';
import Phone from './pages/Phone';
import { SocketProvider } from './hooks/useSocket';

export default function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-theme-bg text-white font-sans selection:bg-theme-cyan selection:text-black flex flex-col">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/pair" element={<Pair />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/phone" element={<Phone />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </SocketProvider>
  );
}
