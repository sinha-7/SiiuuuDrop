import { useState, useCallback, useRef, useEffect } from 'react';
import { generateThumbnail } from '../utils/thumbnailUtils';

const RELAY_URL = import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`;

export function useTransfer(mode, socket, webrtc, sessionCode, targetPeerId) {
  const [queue, setQueue] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(-1);
  const queueRef = useRef([]);

  // sync ref
  queueRef.current = queue;

  // Listen for receiver requests
  useEffect(() => {
    if (!socket) return;
    
    const onRequestFiles = (fileIds) => {
      setQueue(q => q.map(f => fileIds.includes(f.id) ? { ...f, status: 'pending' } : f));
      // Start processing queue if a file is not already actively sending
      setTimeout(() => sendNext(), 100);
    };

    socket.on('request_files', onRequestFiles);
    return () => socket.off('request_files', onRequestFiles);
  }, [socket]); // intentionally omits sendNext dependency to avoid re-binding loop

  const addFilesToQueue = useCallback(async (files) => {
    const newFiles = [];
    const metaPayload = [];

    for (const f of Array.from(files)) {
      const id = crypto.randomUUID();
      const thumbnail = await generateThumbnail(f);
      
      newFiles.push({
        id,
        file: f,
        name: f.name,
        size: f.size,
        type: f.type,
        progress: 0,
        status: 'offered', 
        thumbnail
      });

      metaPayload.push({
        fileId: id,
        name: f.name,
        size: f.size,
        type: f.type,
        thumbnail
      });
    }

    setQueue(q => [...q, ...newFiles]);

    // Offer metadata to Receiver
    if (socket && sessionCode && targetPeerId) {
      socket.emit('sync_meta', { files: metaPayload, sessionCode }, targetPeerId);
    }
  }, [socket, sessionCode, targetPeerId]);

  const sendNext = useCallback(async () => {
    const q = queueRef.current;
    if (q.some(f => f.status === 'sending')) return; // already active

    const nextIdx = q.findIndex(f => f.status === 'pending');
    if (nextIdx === -1) return; // Queue empty or done

    setCurrentFileIndex(nextIdx);
    const fileObj = q[nextIdx];

    setQueue(q => q.map((f, i) => i === nextIdx ? { ...f, status: 'sending' } : f));

    try {
      if (mode === 'LAN Direct' && webrtc.connected) {
        await webrtc.sendFile(fileObj.file, (offset, total) => {
          setQueue(q => q.map((f, i) => i === nextIdx ? { ...f, progress: Math.round((offset/total)*100) } : f));
        });
      } else {
        // Relay mode
        await sendViaRelay(fileObj, sessionCode, targetPeerId, (progress) => {
          setQueue(q => q.map((f, i) => i === nextIdx ? { ...f, progress } : f));
        });
      }
      setQueue(q => q.map((f, i) => i === nextIdx ? { ...f, status: 'completed', progress: 100 } : f));
      
      setTimeout(sendNext, 500);
    } catch(e) {
      console.error('Send error:', e);
      setQueue(q => q.map((f, i) => i === nextIdx ? { ...f, status: 'error' } : f));
      setTimeout(sendNext, 500);
    }
  }, [mode, webrtc, socket, sessionCode, targetPeerId]);

  const sendViaRelay = async (fileObj, sessCode, targetId, onProgress) => {
    const file = fileObj.file;
    const CHUNK_SIZE = 1024 * 1024; // 1MB chunks for relay
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    socket.emit('relay_file_meta', {
      fileId: fileObj.id,
      name: file.name,
      size: file.size,
      type: file.type,
      sessionCode: sessCode
    }, targetId);

    let offset = 0;
    while (offset < file.size) {
      const chunk = file.slice(offset, offset + CHUNK_SIZE);
      const formData = new FormData();
      formData.append('file', chunk);
      
      await fetch(`${RELAY_URL}/api/relay/chunk?fileId=${fileObj.id}&sessionId=${sessCode}&fileName=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        body: formData
      });
      
      offset += CHUNK_SIZE;
      onProgress(Math.min(100, Math.round((offset/file.size)*100)));
    }
    
    socket.emit('relay_file_end', { fileId: fileObj.id, sessionCode: sessCode }, targetId);
  };

  const syncAllMetadata = useCallback(() => {
    if (!socket || !sessionCode || !targetPeerId || queue.length === 0) return;

    const offeredItems = queue.filter(f => f.status === 'offered');
    if (offeredItems.length === 0) return;

    const metaPayload = offeredItems.map(f => ({
      fileId: f.id,
      name: f.name,
      size: f.size,
      type: f.type,
      thumbnail: f.thumbnail
    }));

    socket.emit('sync_meta', { files: metaPayload, sessionCode }, targetPeerId);
  }, [socket, sessionCode, targetPeerId, queue]);

  return { queue, addFilesToQueue, sendNext, currentFileIndex, setQueue, syncAllMetadata };
}
