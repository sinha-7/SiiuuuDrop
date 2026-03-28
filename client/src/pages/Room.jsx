import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useNetworkMode } from '../hooks/useNetworkMode';
import { useTransfer } from '../hooks/useTransfer';
import { useFileStream } from '../hooks/useFileStream';
import ModeBadge from '../components/ModeBadge';
import FileDropZone from '../components/FileDropZone';
import FileCard from '../components/FileCard';
import SpeedMeter from '../components/SpeedMeter';
import { LogOut, Download, FileText, Share2 } from 'lucide-react';
import clsx from 'clsx';

export default function Room() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sessionCode: navSessionCode, isCreator: navIsCreator, targetPeerId: navTargetPeerId } = location.state || {};

  // Persist session info in sessionStorage so HMR/refresh doesn't kill everything
  const stored = JSON.parse(sessionStorage.getItem('swiftdrop_room') || 'null');
  const sessionCode = navSessionCode || (stored && stored.sessionCode) || null;
  const isCreator = navIsCreator !== undefined ? navIsCreator : (stored && stored.isCreator);

  const { socket } = useSocket();
  const [targetPeerId, setTargetPeerId] = useState(navTargetPeerId || (stored && stored.targetPeerId) || null);
  
  const { createPeerConnection, initDataChannel, sendFile, connected: rtcConnected, isLan } = useWebRTC(socket, targetPeerId);
  const { mode } = useNetworkMode(socket, rtcConnected, isLan);
  
  // SENDING state
  const { queue: sendQueue, addFilesToQueue, sendNext, syncAllMetadata } = useTransfer(mode, socket, { sendFile, connected: rtcConnected }, sessionCode, targetPeerId);
  const [totalBytesSent, setTotalBytesSent] = useState(0);

  // Sync metadata when peer finally connects
  useEffect(() => {
    if (targetPeerId && sendQueue.length > 0) {
      syncAllMetadata();
    }
  }, [targetPeerId, syncAllMetadata]); // sendQueue is in syncAllMetadata dependencies inside the hook

  // RECEIVING state
  const { receiveFile } = useFileStream();
  const [receiveQueue, setReceiveQueue] = useState([]);
  const [totalBytesReceived, setTotalBytesReceived] = useState(0);
  const currentFileWriter = useRef(null);
  const [selectedItems, setSelectedItems] = useState(new Set());

  // Persist state to sessionStorage
  useEffect(() => {
    if (sessionCode) {
      sessionStorage.setItem('swiftdrop_room', JSON.stringify({ sessionCode, isCreator, targetPeerId }));
    }
  }, [sessionCode, isCreator, targetPeerId]);

  // Auto-rejoin session on mount/HMR so the server knows who we are
  useEffect(() => {
    if (!socket || !sessionCode) {
      if (!sessionCode) navigate('/');
      return;
    }
    socket.emit('join_session', sessionCode);
  }, [socket, sessionCode, navigate]);

  // Listen for peer connections regardless of creator/joiner role
  useEffect(() => {
    if (!socket) return;

    const onPeerConnected = (peerId) => {
      console.log('Peer connected:', peerId);
      setTargetPeerId(peerId);
    };

    const onPeerDisconnected = (peerId) => {
      console.log('Peer disconnected:', peerId);
      setTargetPeerId(prev => prev === peerId ? null : prev);
    };

    const onSessionJoined = (sessionId, peerId) => {
      console.log('Joined session:', sessionId, 'Found peer:', peerId);
      if (peerId) setTargetPeerId(peerId);
    };

    socket.on('peer_connected', onPeerConnected);
    socket.on('peer_disconnected', onPeerDisconnected);
    socket.on('session_joined', onSessionJoined);

    return () => {
      socket.off('peer_connected', onPeerConnected);
      socket.off('peer_disconnected', onPeerDisconnected);
      socket.off('session_joined', onSessionJoined);
    };
  }, [socket]);

  useEffect(() => {
    let sent = 0;
    sendQueue.forEach(f => {
      if (f.status === 'completed') sent += f.size;
      else if (f.status === 'sending') sent += (f.size * (f.progress / 100));
    });
    setTotalBytesSent(sent);
  }, [sendQueue]);

  useEffect(() => {
    if (!socket || !targetPeerId) return;

    // ----- WEB RTC RECEIVE SETUP -----
    const onChunk = async (chunk) => {
      if (currentFileWriter.current) {
        await currentFileWriter.current.writeChunk(chunk);
        setTotalBytesReceived(prev => prev + chunk.byteLength);
        setReceiveQueue(q => {
          const newQ = [...q];
          const activeIdx = newQ.findIndex(f => f.status === 'receiving');
          if (activeIdx !== -1) {
            newQ[activeIdx] = { 
              ...newQ[activeIdx], 
              receivedBytes: newQ[activeIdx].receivedBytes + chunk.byteLength,
              progress: Math.min(100, Math.round(((newQ[activeIdx].receivedBytes + chunk.byteLength) / newQ[activeIdx].size) * 100))
            };
          }
          return newQ;
        });
      }
    };

    const onMeta = async (meta) => {
      setReceiveQueue(q => {
        const existingIdx = q.findIndex(f => f.name === meta.name && (f.status === 'offered' || f.status === 'pending'));
        if (existingIdx !== -1) {
          const newQ = [...q];
          newQ[existingIdx] = { ...newQ[existingIdx], status: 'receiving' };
          return newQ;
        }
        return [...q, {
          id: crypto.randomUUID(), name: meta.name, size: meta.size, type: meta.fileType,
          progress: 0, receivedBytes: 0, status: 'receiving'
        }];
      });
      try {
        currentFileWriter.current = await receiveFile(meta.name, meta.size, meta.fileType);
      } catch(e) { console.error('Failed to init stream', e); }
    };

    const onEnd = async (meta) => {
      if (currentFileWriter.current) {
        await currentFileWriter.current.finish();
        currentFileWriter.current = null;
      }
      setReceiveQueue(q => q.map(f => f.status === 'receiving' && f.name === meta.name ? { ...f, status: 'completed', progress: 100 } : f));
    };

    const pc = createPeerConnection(onChunk, onMeta, onEnd);
    initDataChannel(null, null, null); // For sending capabilities

    if (isCreator) {
      // Creator acts as Caller
      pc.createOffer().then(offer => pc.setLocalDescription(offer)).then(() => {
        socket.emit('webrtc_offer', pc.localDescription, targetPeerId);
      });
    }

    const onOffer = async (offer, senderId) => {
      if (!targetPeerId) setTargetPeerId(senderId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc_answer', pc.localDescription, targetPeerId || senderId);
    };

    const onAnswer = (answer) => {
      pc.setRemoteDescription(new RTCSessionDescription(answer));
    };

    const onIceCandidate = (candidate) => {
      pc.addIceCandidate(new RTCIceCandidate(candidate));
    };

    // ----- RELAY RECEIVE SETUP -----
    const onRelayMeta = async (data) => {
      setReceiveQueue(q => {
        const exIdx = q.findIndex(f => f.id === data.fileId);
        if (exIdx !== -1) {
          const newQ = [...q];
          newQ[exIdx] = { ...newQ[exIdx], status: 'receiving', isRelay: true };
          return newQ;
        }
        return [...q, { id: data.fileId, name: data.name, size: data.size, type: data.type, progress: 0, receivedBytes: 0, status: 'receiving', isRelay: true }];
      });
    };
    const onRelayEnd = async (data) => {
      setReceiveQueue(q => q.map(f => f.id === data.fileId ? { ...f, status: 'completed', progress: 100 } : f));
      triggerRelayDownload(data.fileId);
    };

    // ----- METADATA INTERACTION -----
    const onSyncMeta = (data) => {
      setReceiveQueue(q => {
        const newOffered = data.files.map(f => ({
          id: f.fileId, name: f.name, size: f.size, type: f.type, thumbnail: f.thumbnail,
          progress: 0, receivedBytes: 0, status: 'offered', isRelay: false
        }));
        return [...q, ...newOffered];
      });
    };

    socket.on('webrtc_offer', onOffer);
    socket.on('webrtc_answer', onAnswer);
    socket.on('webrtc_ice_candidate', onIceCandidate);
    socket.on('relay_file_meta', onRelayMeta);
    socket.on('relay_file_end', onRelayEnd);
    socket.on('sync_meta', onSyncMeta);

    return () => {
      socket.off('webrtc_offer', onOffer);
      socket.off('webrtc_answer', onAnswer);
      socket.off('webrtc_ice_candidate', onIceCandidate);
      socket.off('relay_file_meta', onRelayMeta);
      socket.off('relay_file_end', onRelayEnd);
      socket.off('sync_meta', onSyncMeta);
    };
  }, [socket, targetPeerId, isCreator, createPeerConnection, initDataChannel, receiveFile]);

  const triggerRelayDownload = (fileId) => {
    const a = document.createElement('a');
    a.href = (import.meta.env.VITE_SERVER_URL || ('http://' + window.location.hostname + ':3001')) + '/api/relay/download/' + fileId;
    a.download = true; 
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const toggleSelection = (id) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDownloadSelected = () => {
    const selectedIds = Array.from(selectedItems);
    if (selectedIds.length > 0 && socket) {
      socket.emit('request_files', selectedIds, targetPeerId);
      setReceiveQueue(q => q.map(f => selectedIds.includes(f.id) ? { ...f, status: 'pending' } : f));
      setSelectedItems(new Set());
    }
  };

  const onStartSend = () => {
    const nextIdx = sendQueue.findIndex(f => f.status === 'pending');
    if (nextIdx !== -1) {
      sendNext();
    }
  };

  const activeSendTransfer = sendQueue.find(f => f.status === 'sending');
  const activeReceiveTransfer = receiveQueue.find(f => f.status === 'receiving');
  
  const offeredFiles = receiveQueue.filter(f => f.status === 'offered');
  const inProgressOrDoneReceive = receiveQueue.filter(f => f.status !== 'offered');

  return (
    <div className="flex-1 flex flex-col relative w-full h-full p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto overflow-hidden">
      <div className="flex flex-col md:flex-row items-center justify-between mb-6 flex-shrink-0 gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-3">
            Room <span className="text-theme-cyan tracking-widest">{sessionCode}</span>
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            {targetPeerId ? "Connected securely to peer." : "Waiting for peer to join (Share your session code)."}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {targetPeerId && <ModeBadge mode={mode} />}
          <button onClick={() => navigate('/')} className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-400 transition-colors tooltip tooltip-left" data-tip="Exit Room">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
        
        {/* LEFT COLUMN: Sending capabilities */}
        <div className="flex flex-col gap-6 lg:overflow-hidden h-full">
          <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-6 relative flex-shrink-0">
            <h3 className="font-semibold text-gray-300 mb-4 flex items-center gap-2">
              <Share2 size={18} className="text-theme-cyan" /> Select Files to Share
            </h3>
            <FileDropZone onFilesSelected={addFilesToQueue} />
            
            <div className="mt-6 flex flex-col gap-4">
              <SpeedMeter bytesTransferred={totalBytesSent} active={!!activeSendTransfer} />
              
              <button 
                onClick={onStartSend}
                disabled={!sendQueue.some(f => f.status === 'pending') || activeSendTransfer || !targetPeerId || mode === 'Wait'}
                className="w-full py-4 bg-theme-cyan text-black rounded-xl font-bold hover:bg-theme-cyan/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_15px_rgba(0,229,255,0.3)] disabled:shadow-none"
              >
                Send Direct Pending Queue
              </button>
            </div>
          </div>

          <div className="bg-gray-900/20 border border-gray-800 rounded-2xl flex flex-col flex-1 lg:overflow-hidden min-h-[300px]">
            <div className="p-4 border-b border-gray-800 bg-gray-900/50">
              <h3 className="font-semibold text-gray-300">My Uploads & Offerings ({sendQueue.length})</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {sendQueue.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">You haven't selected anything yet.</div>
              ) : (
                sendQueue.map(f => <FileCard key={f.id} fileObj={f} />)
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Receiving capabilities */}
        <div className="flex flex-col gap-6 lg:overflow-hidden h-full">
          {/* Incoming Downloads Dashboard */}
          <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-6 flex flex-col flex-shrink-0">
             <h3 className="font-semibold text-gray-300 mb-4 flex items-center gap-2">
               <Download size={18} className="text-theme-blue" /> Receive Dashboard
             </h3>
             <SpeedMeter bytesTransferred={totalBytesReceived} active={!!activeReceiveTransfer} />
          </div>

          {/* Incoming Gallery (Peer Offerings) */}
          <div className="bg-theme-cyan/5 border border-theme-cyan/20 rounded-2xl flex flex-col min-h-[250px] max-h-[350px] flex-shrink-0">
            <div className="p-4 border-b border-theme-cyan/10 flex justify-between items-center bg-theme-cyan/5">
              <h3 className="font-bold text-theme-cyan">Files Offered by Peer</h3>
              <button 
                onClick={handleDownloadSelected}
                disabled={selectedItems.size === 0}
                className="px-4 py-2 bg-theme-cyan text-black rounded-lg font-bold text-sm disabled:opacity-50 transition-all custom-shadow"
              >
                Download Selected ({selectedItems.size})
              </button>
            </div>
            <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
              {offeredFiles.length === 0 ? (
                 <div className="h-full flex items-center justify-center text-gray-500 text-sm text-center">
                    Peer has not offered any files yet.
                 </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 2xl:grid-cols-6 gap-3">
                  {offeredFiles.map(f => (
                    <div 
                      key={f.id} onClick={() => toggleSelection(f.id)}
                      className={clsx("relative bg-gray-800/80 rounded-lg overflow-hidden cursor-pointer border-2 transition-all p-1 group hover:border-theme-cyan/60", selectedItems.has(f.id) ? "border-theme-cyan bg-theme-cyan/10" : "border-transparent")}
                    >
                      {f.thumbnail ? (
                        <div className="aspect-square rounded-md overflow-hidden"><img src={f.thumbnail} alt={f.name} className="w-full h-full object-cover" /></div>
                      ) : (
                        <div className="aspect-square bg-gray-800 rounded-md flex flex-col items-center justify-center p-2 text-center text-[10px] text-gray-400 break-all line-clamp-2"><FileText size={20} className="mb-1 text-gray-500" />{f.name}</div>
                      )}
                      <div className="absolute top-1 right-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center bg-black/60 shadow-sm z-10 transition-transform group-hover:scale-110">
                        {selectedItems.has(f.id) && <div className="w-2.5 h-2.5 bg-theme-cyan rounded-full" />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-900/20 border border-gray-800 rounded-2xl flex flex-col flex-1 lg:overflow-hidden min-h-[250px]">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
              <h3 className="font-semibold text-gray-300">Active Downloads</h3>
              <span className="text-sm font-mono text-theme-cyan">
                {inProgressOrDoneReceive.filter(f => f.status === 'completed').length} / {inProgressOrDoneReceive.length}
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {inProgressOrDoneReceive.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                  Active transfer queue is empty.
                </div>
              ) : (
                inProgressOrDoneReceive.map(f => (
                  <div key={f.id} className="relative">
                    <FileCard fileObj={f} />
                    {f.status === 'completed' && f.isRelay && (
                      <button 
                        onClick={() => triggerRelayDownload(f.id)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 px-4 py-2 bg-theme-cyan text-black text-xs font-bold rounded-lg"
                      >
                        Keep File (Browser Sandbox)
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
