import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useGallerySync } from '../hooks/useGallerySync';
import { streamFileToPeer } from '../hooks/useFileDownload';
import { Zap, CheckCircle, Image as ImageIcon, Upload, Plus, LogOut, Loader } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Phone() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sessionCode } = location.state || JSON.parse(sessionStorage.getItem('swiftdrop_phone') || '{}');
  
  const { socket, connected } = useSocket();
  const { progress, processAndStreamFiles, getFileById, filesMap } = useGallerySync(socket);
  const fileInputRef = useRef(null);
  
  const [peerConnected, setPeerConnected] = useState(false);
  const [sharedCount, setSharedCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState([]); // { id, name, progress, status }
  const [showPrompt, setShowPrompt] = useState(true);

  // Persist
  useEffect(() => {
    if (sessionCode) {
      sessionStorage.setItem('swiftdrop_phone', JSON.stringify({ sessionCode }));
    }
  }, [sessionCode]);

  // Rejoin session
  useEffect(() => {
    if (!socket || !sessionCode) {
      if (!sessionCode) navigate('/');
      return;
    }
    socket.emit('join_session', sessionCode);
  }, [socket, sessionCode]);

  // Socket events
  useEffect(() => {
    if (!socket) return;

    const onPeer = () => setPeerConnected(true);
    const onPeerDc = () => setPeerConnected(false);
    const onSessionJoined = (sessionId, peerId) => {
      if (peerId) setPeerConnected(true);
    };

    // Handle download requests from PC
    const onRequestDownload = async (fileIds) => {
      console.log('PC requested download:', fileIds);
      for (const id of fileIds) {
        const file = getFileById(id);
        if (file) {
          setUploadingFiles(prev => [...prev, { id, name: file.name, progress: 0, status: 'uploading' }]);
          await streamFileToPeer(socket, file, id);
          setUploadingFiles(prev => prev.map(f => f.id === id ? { ...f, progress: 100, status: 'done' } : f));
        }
      }
    };

    socket.on('peer_connected', onPeer);
    socket.on('peer_disconnected', onPeerDc);
    socket.on('session_joined', onSessionJoined);
    socket.on('request_download', onRequestDownload);

    return () => {
      socket.off('peer_connected', onPeer);
      socket.off('peer_disconnected', onPeerDc);
      socket.off('session_joined', onSessionJoined);
      socket.off('request_download', onRequestDownload);
    };
  }, [socket, getFileById]);

  const handleSelectGallery = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setShowPrompt(false);
    setIsProcessing(true);
    await processAndStreamFiles(files);
    setSharedCount(prev => prev + files.length);
    setIsProcessing(false);
  };

  return (
    <div className="phone-page">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFilesSelected}
      />

      <div className="phone-header">
        <Zap size={24} className="text-theme-cyan" />
        <span className="phone-brand">SiiuuuDrop</span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="phone-content"
      >
        {/* Connection Status */}
        <div className={`phone-status-card ${peerConnected ? 'connected' : 'waiting'}`}>
          {peerConnected ? (
            <>
              <CheckCircle size={32} className="text-theme-green" />
              <h2>Connected to PC</h2>
              <p className="phone-session-code">Session: {sessionCode}</p>
            </>
          ) : (
            <>
              <Loader size={32} className="text-theme-cyan animate-spin" />
              <h2>Connecting...</h2>
              <p>Waiting for PC to join session</p>
            </>
          )}
        </div>

        {/* Share Gallery Prompt */}
        {showPrompt && peerConnected && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="phone-share-prompt"
          >
            <div className="phone-share-icon-wrap">
              <ImageIcon size={48} className="text-theme-cyan" />
            </div>
            <h3>Share your gallery</h3>
            <p>Select photos and videos to make them browsable on your PC.</p>
            <button onClick={handleSelectGallery} className="phone-share-btn">
              <Upload size={20} />
              Open Gallery
            </button>
          </motion.div>
        )}

        {/* Processing Progress */}
        {isProcessing && (
          <div className="phone-progress-card">
            <Loader size={20} className="animate-spin text-theme-cyan" />
            <span>Generating thumbnails... {progress.sent}/{progress.total}</span>
            <div className="phone-progress-bar">
              <div 
                className="phone-progress-fill"
                style={{ width: `${progress.total > 0 ? (progress.sent / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Shared Stats */}
        {sharedCount > 0 && !isProcessing && (
          <div className="phone-stats-card">
            <div className="phone-stats-number">{sharedCount}</div>
            <div className="phone-stats-label">items shared with PC</div>
            <button onClick={handleSelectGallery} className="phone-add-more-btn">
              <Plus size={16} />
              Add More Photos
            </button>
          </div>
        )}

        {/* Active Uploads */}
        {uploadingFiles.filter(f => f.status === 'uploading').length > 0 && (
          <div className="phone-upload-card">
            <h4>Sending to PC...</h4>
            {uploadingFiles.filter(f => f.status === 'uploading').map(f => (
              <div key={f.id} className="phone-upload-item">
                <span>{f.name}</span>
                <Loader size={14} className="animate-spin" />
              </div>
            ))}
          </div>
        )}

        {/* Disconnect */}
        <button onClick={() => navigate('/')} className="phone-disconnect-btn">
          <LogOut size={16} />
          Disconnect
        </button>
      </motion.div>
    </div>
  );
}
