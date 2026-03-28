import { useState, useEffect } from 'react';

export function useNetworkMode(socket, webrtcConnected, isLan) {
  const [mode, setMode] = useState('Wait');

  useEffect(() => {
    if (!socket) return;
    
    socket.on('mode_confirmed', (confirmedMode) => {
      setMode(confirmedMode);
    });

    return () => {
      socket.off('mode_confirmed');
    };
  }, [socket]);

  useEffect(() => {
    if (webrtcConnected) {
      if (isLan) {
        setMode('LAN Direct');
        socket?.emit('transfer_mode', 'LAN Direct');
      } else {
        setMode('Relay Mode');
        socket?.emit('transfer_mode', 'Relay Mode');
      }
    } else {
      // In a real app we'd have a timeout to fallback to Relay if WebRTC fails to connect
      // For now if it doesn't connect we can just show Wait or Relay
    }
  }, [webrtcConnected, isLan, socket]);

  return { mode, setMode };
}
