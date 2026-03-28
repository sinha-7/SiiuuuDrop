import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Camera, ChevronLeft } from 'lucide-react';

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
    || (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);
}

export default function Pair() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
  const [code, setCode] = useState(new Array(6).fill(''));
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [activeSessionCode, setActiveSessionCode] = useState(null);
  const isMobile = isMobileDevice();

  useEffect(() => {
    const urlCode = searchParams.get('code');
    if (urlCode && urlCode.length === 6 && connected) {
      joinSession(urlCode);
    }
  }, [searchParams, connected]);

  useEffect(() => {
    if (!socket) return;
    
    const onSessionJoined = (sessionId, peerId) => {
      const sessCode = activeSessionCode || code.join('');
      if (isMobile) {
        navigate('/phone', { state: { sessionCode: sessCode } });
      } else {
        navigate('/gallery', { state: { sessionCode: sessCode, targetPeerId: peerId } });
      }
    };
    
    socket.on('session_joined', onSessionJoined);
    socket.on('error', (msg) => setError(msg));
    
    return () => {
      socket.off('session_joined', onSessionJoined);
      socket.off('error');
    };
  }, [socket, navigate, code, activeSessionCode, isMobile]);

  useEffect(() => {
    let scanner;
    if (isScanning) {
      scanner = new Html5QrcodeScanner("reader", { qrbox: { width: 250, height: 250 }, fps: 5 });
      scanner.render((result) => {
        scanner.clear();
        setIsScanning(false);
        try {
          const urlCode = new URL(result).searchParams.get('code');
          if (urlCode) joinSession(urlCode);
        } catch(e) {
          if (result.length === 6) joinSession(result);
        }
      }, () => {});
    }
    return () => {
      if (scanner) {
        try { scanner.clear(); } catch(e) {}
      }
    };
  }, [isScanning]);

  const joinSession = (sessionCode) => {
    if (!socket) return;
    setError('');
    setActiveSessionCode(sessionCode);
    
    fetch(`${import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`}/api/session/join/${sessionCode}`, { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.error) setError(data.error);
        else {
          socket.emit('join_session', sessionCode);
        }
      })
      .catch(() => setError('Connection failed'));
  };

  const handleChange = (e, index) => {
    const value = e.target.value;
    if (isNaN(value)) return;
    
    const newCode = [...code];
    newCode[index] = value.substring(value.length - 1);
    setCode(newCode);

    if (value && index < 5) {
      document.getElementById(`digit-${index + 1}`).focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      document.getElementById(`digit-${index - 1}`).focus();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const fullCode = code.join('');
    if (fullCode.length === 6) {
      joinSession(fullCode);
    } else {
      setError('Please enter all 6 digits');
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
      <button onClick={() => navigate('/')} className="absolute top-6 left-6 text-gray-400 hover:text-white flex items-center gap-2">
        <ChevronLeft size={20} /> Back
      </button>
      
      <div className="max-w-md w-full">
        <h2 className="text-3xl font-bold mb-6 text-center">Join Session</h2>
        
        {isScanning ? (
          <div className="bg-gray-900 rounded-2xl overflow-hidden border-2 border-theme-cyan mb-6">
            <div id="reader" className="w-full text-black bg-white"></div>
            <button 
              onClick={() => setIsScanning(false)}
              className="w-full py-3 bg-gray-800 text-center font-medium"
            >
              Cancel Scan
            </button>
          </div>
        ) : (
          <div className="mb-8">
            <button 
              onClick={() => setIsScanning(true)}
              className="w-full py-4 rounded-xl border-2 border-dashed border-gray-700 hover:border-theme-cyan text-theme-cyan flex items-center justify-center gap-2 font-medium transition-colors cursor-pointer"
            >
              <Camera size={20} /> Scan QR Code
            </button>
            <div className="text-center text-gray-500 my-6 text-sm font-semibold tracking-widest">OR ENTER 6-DIGIT CODE</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col items-center">
          <div className="flex gap-2 justify-center mb-6">
            {code.map((digit, i) => (
              <React.Fragment key={i}>
                <input
                  id={`digit-${i}`}
                  type="text"
                  inputMode="numeric"
                  value={digit}
                  onChange={(e) => handleChange(e, i)}
                  onKeyDown={(e) => handleKeyDown(e, i)}
                  className="w-12 h-16 bg-gray-900 border border-gray-700 focus:border-theme-cyan rounded-lg text-center text-3xl font-mono text-white outline-none transition-colors"
                  maxLength={1}
                />
                {i === 2 && <div className="w-4 flex items-center justify-center text-gray-500 font-bold">-</div>}
              </React.Fragment>
            ))}
          </div>
          
          {error && <p className="text-red-500 mb-4 text-sm font-medium">{error}</p>}

          <button 
            type="submit"
            disabled={code.join('').length !== 6}
            className="w-full py-4 bg-theme-cyan hover:bg-theme-cyan/90 text-black rounded-xl font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_4px_20px_rgba(0,229,255,0.3)] disabled:shadow-none"
          >
            Connect to Device
          </button>
        </form>
      </div>
    </div>
  );
}
