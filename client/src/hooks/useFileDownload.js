import { useState, useCallback, useRef } from 'react';
import JSZip from 'jszip';

const CHUNK_SIZE = 256 * 1024; // 256KB chunks

const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

const createZipAndDownload = async (files, batchId) => {
  try {
    const zip = new JSZip();
    files.forEach(f => {
      zip.file(f.name, f.blob);
    });
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerDownload(zipBlob, `SiiuuuDrop_Batch_${batchId.substring(batchId.length - 6)}.zip`);
  } catch (err) {
    console.error('Failed to create ZIP:', err);
  }
};

/**
 * PC-side hook: requests files from phone, receives chunks, triggers browser download.
 */
export function useFileDownload(socket) {
  const [downloads, setDownloads] = useState([]); // { id, name, size, type, received, status, batchId }
  const chunksRef = useRef(new Map()); // id → Uint8Array[]
  const batchesRef = useRef(new Map()); // batchId → { pendingIds: Set, completedFiles: Array }

  // Request files from the phone
  const requestFiles = useCallback((fileIds) => {
    if (!socket || fileIds.length === 0) return;
    
    // Group them into a batch if > 1
    const batchId = fileIds.length > 1 ? Date.now().toString() : null;
    if (batchId) {
      batchesRef.current.set(batchId, {
        pendingIds: new Set(fileIds),
        completedFiles: []
      });
    }
    
    // Mark them as pending
    setDownloads(prev => {
      const pendingIds = fileIds.filter(id => !prev.find(d => d.id === id));
      return [...prev, ...pendingIds.map(id => ({
        id, name: '', size: 0, type: '', received: 0, status: 'pending', batchId
      }))];
    });
    
    socket.emit('request_download', fileIds);
  }, [socket]);

  // Called when file_start arrives
  const onFileStart = useCallback((meta) => {
    chunksRef.current.set(meta.id, []);
    setDownloads(prev => prev.map(d => 
      d.id === meta.id 
        ? { ...d, name: meta.name, size: meta.size, type: meta.type, status: 'downloading', received: 0 }
        : d
    ));
  }, []);

  // Called when file_chunk arrives
  const onFileChunk = useCallback((data) => {
    const chunks = chunksRef.current.get(data.id);
    if (chunks) {
      let bytes;
      if (data.isBase64 && typeof data.chunk === 'string') {
        // Decode base64 string chunk from mobile app
        const binaryString = atob(data.chunk);
        bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
      } else if (data.chunk instanceof ArrayBuffer) {
        bytes = new Uint8Array(data.chunk);
      } else if (data.chunk) {
        // Handle any other format
        bytes = new Uint8Array(data.chunk);
      }
      
      if (bytes) {
        chunks.push(bytes);
        setDownloads(prev => prev.map(d =>
          d.id === data.id
            ? { ...d, received: d.received + bytes.byteLength }
            : d
        ));
      }
    }

    // Explicitly emit E2E Backpressure Acknowledgement
    socket.emit('file_chunk_ack', { id: data.id, offset: data.offset });
  }, [socket]);

  // Called when file_end arrives
  const onFileEnd = useCallback((meta) => {
    const chunks = chunksRef.current.get(meta.id);
    if (!chunks) return;

    // Assemble blob
    const blob = new Blob(chunks, { type: meta.type || 'application/octet-stream' });
    chunksRef.current.delete(meta.id);

    let handledInBatch = false;
    let batchFilesToZip = null;
    let triggerBatchId = null;

    // 1. Evaluate batch tracking synchronously outside of React state
    for (const [batchId, batchInfo] of batchesRef.current.entries()) {
      if (batchInfo.pendingIds.has(meta.id)) {
        handledInBatch = true;
        batchInfo.pendingIds.delete(meta.id);
        batchInfo.completedFiles.push({ name: meta.name, blob });
        
        if (batchInfo.pendingIds.size === 0) {
           batchFilesToZip = [...batchInfo.completedFiles];
           triggerBatchId = batchId;
           batchesRef.current.delete(batchId);
        }
        break;
      }
    }

    // 2. Update UI progress (async reducer is fine here)
    setDownloads(prev => prev.map(d =>
      d.id === meta.id ? { ...d, status: 'completed', received: d.size, blob } : d
    ));

    // 3. Trigger actual browser download
    if (handledInBatch) {
      if (batchFilesToZip) {
        createZipAndDownload(batchFilesToZip, triggerBatchId);
      }
    } else {
      // Individual file download
      triggerDownload(blob, meta.name);
    }
  }, []);

  const clearCompleted = useCallback(() => {
    setDownloads(prev => prev.filter(d => d.status !== 'completed'));
  }, []);

  const activeCount = downloads.filter(d => d.status === 'downloading').length;
  // Calculate total progress correctly
  let totalRec = 0;
  let totalSize = 0;
  downloads.forEach(d => {
    totalRec += d.received;
    totalSize += d.size;
  });
  const totalProgress = totalSize > 0 ? totalRec / totalSize : 0;

  return {
    downloads,
    requestFiles,
    onFileStart,
    onFileChunk,
    onFileEnd,
    clearCompleted,
    activeCount,
    totalProgress
  };
}

/**
 * Phone-side: streams requested files to PC via socket.
 */
export async function streamFileToPeer(socket, file, id) {
  if (!socket || !file) return;

  socket.emit('file_start', {
    id,
    name: file.name,
    size: file.size,
    type: file.type
  });

  let offset = 0;
  while (offset < file.size) {
    const chunk = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
    socket.emit('file_chunk', { id, chunk, offset });
    offset += chunk.byteLength;
    // Yield to prevent UI freeze
    await new Promise(r => setTimeout(r, 5));
  }

  socket.emit('file_end', { id, name: file.name, type: file.type });
}
