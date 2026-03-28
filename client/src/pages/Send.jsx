import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useNetworkMode } from '../hooks/useNetworkMode';
import { useTransfer } from '../hooks/useTransfer';
import ModeBadge from '../components/ModeBadge';
import FileDropZone from '../components/FileDropZone';
import FileCard from '../components/FileCard';
import SpeedMeter from '../components/SpeedMeter';
import { LogOut } from 'lucide-react';

export default function Send() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sessionCode, targetPeerId } = location.state || {};

  const { socket } = useSocket();
  const { createPeerConnection, initDataChannel, sendFile, connected: rtcConnected, isLan } = useWebRTC(socket, targetPeerId);
  const { mode } = useNetworkMode(socket, rtcConnected, isLan);
  const { queue, addFilesToQueue, sendNext } = useTransfer(mode, socket, { sendFile, connected: rtcConnected });

  const [totalBytesSent, setTotalBytesSent] = useState(0);

  useEffect(() => {
    if (!socket || !targetPeerId) {
      if (!socket && !sessionCode) navigate('/');
      return;
    }

    const pc = createPeerConnection(
      null, // Sender doesn't receive
      null,
      null
    );

    initDataChannel(null, null, null);

    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        socket.emit('webrtc_offer', pc.localDescription, targetPeerId);
      });

    socket.on('webrtc_answer', (answer) => {
      pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on('webrtc_ice_candidate', (candidate) => {
      pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    return () => {
      socket.off('webrtc_answer');
      socket.off('webrtc_ice_candidate');
    };
  }, [socket, targetPeerId, createPeerConnection, initDataChannel, navigate, sessionCode]);

  useEffect(() => {
    let sent = 0;
    queue.forEach(f => {
      if (f.status === 'completed') sent += f.size;
      else if (f.status === 'sending') sent += (f.size * (f.progress / 100));
    });
    setTotalBytesSent(sent);
  }, [queue]);

  const activeTransfer = queue.find(f => f.status === 'sending');

  const onStartSend = () => {
    if (activeTransfer) return;
    sendNext();
  };

  return (
    <div className="flex-1 flex flex-col relative w-full h-full p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-3">
            Session: <span className="text-theme-cyan tracking-widest">{sessionCode}</span>
          </h2>
          <p className="text-sm text-gray-400 mt-1">Ready to send files</p>
        </div>
        <div className="flex items-center gap-4">
          <ModeBadge mode={mode} />
          <button onClick={() => navigate('/')} className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-400 transition-colors tooltip tooltip-left" data-tip="Exit">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
        <div className="flex flex-col gap-6 h-full">
          <FileDropZone onFilesSelected={addFilesToQueue} />
          
          <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-6 flex-1 flex flex-col justify-center">
            <SpeedMeter bytesTransferred={totalBytesSent} active={!!activeTransfer} />
          </div>

          <button 
            onClick={onStartSend}
            disabled={queue.length === 0 || activeTransfer || (mode === 'Wait')}
            className="w-full py-4 bg-theme-cyan text-black rounded-xl font-bold text-lg hover:bg-theme-cyan/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_15px_rgba(0,229,255,0.3)] disabled:shadow-none"
          >
            {activeTransfer ? 'Transferring...' : queue.length > 0 ? 'Start Transfer' : 'Select files first'}
          </button>
        </div>

        <div className="lg:col-span-2 bg-gray-900/20 border border-gray-800 rounded-2xl flex flex-col overflow-hidden max-h-[70vh]">
          <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
            <h3 className="font-semibold text-gray-300">File Queue ({queue.length})</h3>
            <span className="text-sm font-mono text-theme-cyan">
              {queue.filter(f => f.status === 'completed').length} / {queue.length} Done
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {queue.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                Queue is empty. Drop files to begin.
              </div>
            ) : (
              queue.map(f => <FileCard key={f.id} fileObj={f} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
