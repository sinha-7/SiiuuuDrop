import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCodeDisplay from '../components/QRCodeDisplay';
import SessionCode from '../components/SessionCode';
import { useSocket } from '../hooks/useSocket';
import { Zap, Monitor, Smartphone } from 'lucide-react';
import { motion } from 'framer-motion';

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
    || (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);
}

export default function Home() {
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  const isMobile = isMobileDevice();

  useEffect(() => {
    if (connected && socket && !sessionRef.current) {
      fetch(`${import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`}/api/session/create`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          setSession(data);
          sessionRef.current = data;
          socket.emit('join_session', data.code);
        });
    }
  }, [connected, socket]);

  useEffect(() => {
    if (!socket) return;
    const onPeerConnected = (peerId) => {
      if (isMobile) {
        // Mobile: go to phone page to share gallery
        navigate('/phone', { state: { sessionCode: sessionRef.current.code } });
      } else {
        // Desktop: go to gallery browser
        navigate('/gallery', { state: { sessionCode: sessionRef.current.code, targetPeerId: peerId } });
      }
    };
    
    socket.on('peer_connected', onPeerConnected);
    return () => socket.off('peer_connected', onPeerConnected);
  }, [socket, navigate, isMobile]);

  const appUrl = window.location.origin;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
      <div className="absolute top-8 left-8 flex items-center gap-2 text-xl font-bold tracking-tight">
        <Zap className="text-theme-cyan" /> SiiuuuDrop
      </div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full flex flex-col items-center"
      >
        <h1 className="text-4xl font-bold mb-2 text-center">
          {isMobile ? (
            <>Your gallery.<br/><span className="text-theme-cyan">On your PC.</span><br/>Instantly.</>
          ) : (
            <>Phone photos.<br/><span className="text-theme-cyan">Right here.</span><br/>No cables.</>
          )}
        </h1>
        <p className="text-gray-400 mb-8 text-center mt-4">
          {isMobile 
            ? 'Scan QR or enter code on your PC to browse your gallery.' 
            : 'Scan QR from your phone or enter the code to connect.'}
        </p>

        {session ? (
          <>
            <QRCodeDisplay value={`${appUrl}/pair?code=${session.code}`} />
            <SessionCode code={session.code} />
            <div className="flex items-center gap-3 text-sm text-theme-green bg-theme-green/10 px-4 py-2 rounded-full mt-4 animate-pulse">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-theme-green opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-theme-green"></span>
              </span>
              {isMobile ? 'Waiting for PC to connect...' : 'Waiting for phone to connect...'}
            </div>
          </>
        ) : (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-theme-cyan"></div>
          </div>
        )}

        <div className="mt-12 w-full pt-6 border-t border-gray-800 text-center">
          <p className="text-gray-400 mb-4 text-sm">Have a code from another device?</p>
          <button 
            onClick={() => navigate('/pair')}
            className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors"
          >
            Enter Session Code manually
          </button>
        </div>
      </motion.div>
    </div>
  );
}
