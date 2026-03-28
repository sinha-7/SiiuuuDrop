import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useNetworkMode } from '../hooks/useNetworkMode';
import { useFileStream } from '../hooks/useFileStream';
import ModeBadge from '../components/ModeBadge';
import FileCard from '../components/FileCard';
import SpeedMeter from '../components/SpeedMeter';
import { LogOut, Download, FileText } from 'lucide-react';
import clsx from 'clsx';

export default function Receive() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sessionCode, targetPeerId } = location.state || {};

  const { socket } = useSocket();
  const { createPeerConnection, isLan, connected: rtcConnected } = useWebRTC(socket, targetPeerId);
  const { mode } = useNetworkMode(socket, rtcConnected, isLan);
  const { receiveFile } = useFileStream();

  const [queue, setQueue] = useState([]);
  const [totalBytesReceived, setTotalBytesReceived] = useState(0);
  const [autoDownload, setAutoDownload] = useState(true);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const currentFileWriter = useRef(null);

  useEffect(() => {
    if (!socket || !targetPeerId) {
      if (!socket && !sessionCode) navigate('/');
      return;
    }

    const onChunk = async (chunk) => {
      if (currentFileWriter.current) {
        await currentFileWriter.current.writeChunk(chunk);
        setTotalBytesReceived(prev => prev + chunk.byteLength);
        
        setQueue(q => {
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
      setQueue(q => {
        const existingIdx = q.findIndex(f => f.name === meta.name && (f.status === 'offered' || f.status === 'pending'));
        if (existingIdx !== -1) {
          const newQ = [...q];
          newQ[existingIdx] = { ...newQ[existingIdx], status: 'receiving' };
          return newQ;
        } else {
          return [...q, {
            id: crypto.randomUUID(),
            name: meta.name,
            size: meta.size,
            type: meta.fileType,
            progress: 0,
            receivedBytes: 0,
            status: 'receiving'
          }];
        }
      });
      
      try {
        currentFileWriter.current = await receiveFile(meta.name, meta.size, meta.fileType);
      } catch(e) {
        console.error('Failed to create file stream', e);
      }
    };

    const onEnd = async (meta) => {
      if (currentFileWriter.current) {
        await currentFileWriter.current.finish();
        currentFileWriter.current = null;
      }
      setQueue(q => q.map(f => f.status === 'receiving' && f.name === meta.name ? { ...f, status: 'completed', progress: 100 } : f));
    };

    const pc = createPeerConnection(onChunk, onMeta, onEnd);

    const onOffer = async (offer) => {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc_answer', pc.localDescription, targetPeerId);
    };

    const onIceCandidate = (candidate) => {
      pc.addIceCandidate(new RTCIceCandidate(candidate));
    };

    const onRelayMeta = async (data) => {
      const { fileId, name, size, type } = data;
      setQueue(q => {
        const existingIdx = q.findIndex(f => f.id === fileId);
        if (existingIdx !== -1) {
          const newQ = [...q];
          newQ[existingIdx] = { ...newQ[existingIdx], status: 'receiving', isRelay: true };
          return newQ;
        } else {
          return [...q, { id: fileId, name, size, type, progress: 0, receivedBytes: 0, status: 'receiving', isRelay: true }];
        }
      });
    };

    const onRelayEnd = async (data) => {
      const { fileId } = data;
      setQueue(q => q.map(f => f.id === fileId ? { ...f, status: 'completed', progress: 100 } : f));
      triggerRelayDownload(fileId);
    };

    const onSyncMeta = (data) => {
      const { files } = data;
      setQueue(q => {
        const newOffered = files.map(f => ({
          id: f.fileId,
          name: f.name,
          size: f.size,
          type: f.type,
          thumbnail: f.thumbnail,
          progress: 0,
          receivedBytes: 0,
          status: 'offered',
          isRelay: false
        }));
        return [...q, ...newOffered];
      });
    };

    socket.on('webrtc_offer', onOffer);
    socket.on('webrtc_ice_candidate', onIceCandidate);
    socket.on('relay_file_meta', onRelayMeta);
    socket.on('relay_file_end', onRelayEnd);
    socket.on('sync_meta', onSyncMeta);

    return () => {
      socket.off('webrtc_offer', onOffer);
      socket.off('webrtc_ice_candidate', onIceCandidate);
      socket.off('relay_file_meta', onRelayMeta);
      socket.off('relay_file_end', onRelayEnd);
      socket.off('sync_meta', onSyncMeta);
    };
  }, [socket, targetPeerId, createPeerConnection, receiveFile, navigate, sessionCode]);

  const triggerRelayDownload = (fileId) => {
    const a = document.createElement('a');
    a.href = `${import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`}/api/relay/download/${fileId}`;
    a.download = true; 
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const toggleSelection = (id) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDownloadSelected = () => {
    const selectedIds = Array.from(selectedItems);
    if (selectedIds.length > 0) {
      socket.emit('request_files', selectedIds, targetPeerId);
      setQueue(q => q.map(f => selectedIds.includes(f.id) ? { ...f, status: 'pending' } : f));
      setSelectedItems(new Set());
    }
  };

  const activeTransfer = queue.find(f => f.status === 'receiving');
  const offeredFiles = queue.filter(f => f.status === 'offered');
  const activeFiles = queue.filter(f => f.status !== 'offered');

  return (
    <div className="flex-1 flex flex-col relative w-full h-full p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-3">
            Receiving... <span className="text-theme-cyan tracking-widest">{sessionCode}</span>
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <ModeBadge mode={mode} />
          <button onClick={() => navigate('/')} className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-400 transition-colors tooltip tooltip-left" data-tip="Exit">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0 overflow-hidden">
        
        {/* Left Panel: Active Status & Speed */}
        <div className="flex flex-col gap-6 h-full lg:col-span-1">
          <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-6 flex flex-col justify-center relative overflow-hidden h-48 lg:h-auto">
            {!activeTransfer && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full border-2 border-gray-800 border-t-theme-cyan animate-spin opacity-20"></div>
                <div className="absolute text-center">
                  <Download size={24} className="mx-auto text-gray-500 mb-1" />
                  <p className="font-medium text-gray-400 text-sm">Standby</p>
                </div>
              </div>
            )}
            
            <div className="relative z-10">
              <SpeedMeter bytesTransferred={totalBytesReceived} active={!!activeTransfer} />
            </div>
          </div>
          
          {offeredFiles.length > 0 && (
             <div className="bg-theme-cyan/5 border border-theme-cyan/20 rounded-2xl p-4 flex flex-col">
               <h3 className="font-bold text-lg mb-2 text-theme-cyan">Files Offered</h3>
               <p className="text-sm text-gray-400 mb-4">{offeredFiles.length} file(s) available on sender device.</p>
               <button 
                  onClick={handleDownloadSelected}
                  disabled={selectedItems.size === 0}
                  className="w-full py-3 bg-theme-cyan text-black rounded-xl font-bold disabled:opacity-50 transition-all shadow-[0_4px_15px_rgba(0,229,255,0.3)] disabled:shadow-none"
                >
                 Download Selected ({selectedItems.size})
               </button>
               <button 
                  onClick={() => {
                    const allIds = offeredFiles.map(f => f.id);
                    socket.emit('request_files', allIds, targetPeerId);
                    setQueue(q => q.map(f => allIds.includes(f.id) ? { ...f, status: 'pending' } : f));
                    setSelectedItems(new Set());
                  }}
                  className="w-full py-3 mt-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors"
                >
                 Download All
               </button>
             </div>
          )}
        </div>

        {/* Right Panel: Gallery & Queue */}
        <div className="lg:col-span-2 flex flex-col gap-6 overflow-hidden max-h-[75vh]">
          {offeredFiles.length > 0 && (
            <div className="bg-gray-900/20 border border-gray-800 rounded-2xl flex flex-col overflow-hidden max-h-96">
              <div className="p-4 border-b border-gray-800 bg-gray-900/50">
                <h3 className="font-semibold text-gray-300">Offered Gallery</h3>
              </div>
              <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {offeredFiles.map(f => (
                    <div 
                      key={f.id} 
                      onClick={() => toggleSelection(f.id)}
                      className={clsx(
                        "relative bg-gray-800/50 rounded-xl overflow-hidden cursor-pointer border-2 transition-all p-1",
                        selectedItems.has(f.id) ? "border-theme-cyan bg-theme-cyan/10" : "border-transparent"
                      )}
                    >
                      {f.thumbnail ? (
                        <div className="aspect-square rounded-lg overflow-hidden">
                           <img src={f.thumbnail} alt={f.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="aspect-square bg-gray-800 rounded-lg flex flex-col items-center justify-center p-2 text-center">
                            <FileText size={24} className="text-gray-500 mb-1" />
                            <span className="text-[10px] text-gray-400 break-all line-clamp-2 leading-tight">{f.name}</span>
                        </div>
                      )}
                      
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center bg-black/60 shadow-sm z-10">
                        {selectedItems.has(f.id) && <div className="w-2.5 h-2.5 bg-theme-cyan rounded-full" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="bg-gray-900/20 border border-gray-800 rounded-2xl flex flex-col flex-1 overflow-hidden min-h-0">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
              <h3 className="font-semibold text-gray-300">Active Queue</h3>
              <span className="text-sm font-mono text-theme-cyan">
                {activeFiles.filter(f => f.status === 'completed').length} / {activeFiles.length} Done
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {activeFiles.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                  Queue is empty.
                </div>
              ) : (
                activeFiles.map(f => (
                  <FileCard key={f.id} fileObj={f} />
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
