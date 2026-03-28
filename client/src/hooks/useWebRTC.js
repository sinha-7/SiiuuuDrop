import { useRef, useState, useCallback } from 'react';

const iceConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

const CHUNK_SIZE = 256 * 1024; // 256KB

export function useWebRTC(socket, targetPeerId) {
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const [isLan, setIsLan] = useState(false);
  const [connected, setConnected] = useState(false);

  // LAN subnet check
  const isLocalCandidate = (candidateStr) => {
    return (
      candidateStr.includes('192.168.') ||
      candidateStr.includes('10.') ||
      candidateStr.includes('172.16.') ||
      candidateStr.includes('172.17.') ||
      candidateStr.includes('172.18.') ||
      candidateStr.includes('172.19.') ||
      candidateStr.includes('172.2') ||
      candidateStr.includes('172.3')
    );
  };

  const createPeerConnection = useCallback((onChunkCallback, onMetaCallback, onEndCallback) => {
    const pc = new RTCPeerConnection(iceConfig);
    pcRef.current = pc;
    
    // Check local candidates
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        if (isLocalCandidate(e.candidate.candidate)) {
          setIsLan(true); // LAN candidates present
        }
        if (socket && targetPeerId) {
          socket.emit('webrtc_ice_candidate', e.candidate, targetPeerId);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setConnected(true);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnected(false);
      }
    };

    // When receiver gets data channel
    pc.ondatachannel = (e) => {
      const receiveChannel = e.channel;
      receiveChannel.binaryType = 'arraybuffer';
      dcRef.current = receiveChannel;

      receiveChannel.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'file-meta') {
              onMetaCallback(data);
            } else if (data.type === 'file-end') {
              onEndCallback(data);
            }
          } catch(err) {
            console.error(err);
          }
        } else {
          // Binary chunk
          onChunkCallback(event.data);
        }
      };
    };

    return pc;
  }, [socket, targetPeerId]);

  const initDataChannel = useCallback((onChunkCallback, onMetaCallback, onEndCallback) => {
    if (!pcRef.current) return;
    const dc = pcRef.current.createDataChannel('filetransfer', {
      ordered: true,
      maxRetransmits: 30
    });
    dc.binaryType = 'arraybuffer';
    dcRef.current = dc;

    dc.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'file-meta') {
            onMetaCallback(data);
          } else if (data.type === 'file-end') {
            onEndCallback(data);
          }
        } catch(err) {
          console.error(err);
        }
      } else {
        onChunkCallback(event.data);
      }
    };
  }, []);

  const sendFile = useCallback(async (file, onProgress) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') throw new Error('DataChannel not ready');

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let offset = 0;

    dc.send(JSON.stringify({
      type: 'file-meta',
      name: file.name,
      size: file.size,
      fileType: file.type || 'application/octet-stream',
      totalChunks
    }));

    while (offset < file.size) {
      // Backpressure handling
      while (dc.bufferedAmount > 16 * 1024 * 1024) {
        await new Promise(r => setTimeout(r, 10));
      }

      const chunk = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
      dc.send(chunk);
      offset += chunk.byteLength;

      if (onProgress) {
        onProgress(offset, file.size);
      }
    }

    dc.send(JSON.stringify({ type: 'file-end', name: file.name }));
  }, []);

  const endConnection = useCallback(() => {
    if (dcRef.current) dcRef.current.close();
    if (pcRef.current) pcRef.current.close();
    setConnected(false);
  }, []);

  return {
    pcRef,
    dcRef,
    isLan,
    connected,
    createPeerConnection,
    initDataChannel,
    sendFile,
    endConnection
  };
}
