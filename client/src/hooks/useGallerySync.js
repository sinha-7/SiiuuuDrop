import { useState, useCallback, useRef } from 'react';

const THUMB_SIZE = 160;
const BATCH_SIZE = 20;

/**
 * Phone-side: generate thumbnails from selected files and stream to PC via socket.
 * PC-side: receive thumbnail batches and build gallery data.
 */
export function useGallerySync(socket) {
  const [gallery, setGallery] = useState([]); // PC side: received items
  const [progress, setProgress] = useState({ sent: 0, total: 0 }); // Phone side: upload progress
  const filesMap = useRef(new Map()); // Phone side: id → File reference for later download

  // ── Phone side: process selected files ──
  const processAndStreamFiles = useCallback(async (files) => {
    if (!socket) return;
    
    const fileArray = Array.from(files);
    setProgress({ sent: 0, total: fileArray.length });
    
    let batch = [];
    
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const id = `${file.name}_${file.size}_${file.lastModified}`;
      
      // Store reference for later download
      filesMap.current.set(id, file);
      
      // Generate thumbnail
      let thumb = null;
      try {
        if (file.type.startsWith('image/')) {
          thumb = await generateImageThumb(file);
        } else if (file.type.startsWith('video/')) {
          thumb = await generateVideoThumb(file);
        }
      } catch (e) {
        console.warn('Thumb failed for', file.name, e);
      }
      
      batch.push({
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        date: file.lastModified,
        thumb // base64 data URL or null
      });
      
      // Send in batches of BATCH_SIZE
      if (batch.length >= BATCH_SIZE || i === fileArray.length - 1) {
        socket.emit('gallery_thumbs', { thumbs: batch });
        setProgress({ sent: i + 1, total: fileArray.length });
        batch = [];
        // Small yield so UI stays responsive
        await new Promise(r => setTimeout(r, 10));
      }
    }
  }, [socket]);

  // ── Phone side: handle download requests from PC ──
  const getFileById = useCallback((id) => {
    return filesMap.current.get(id);
  }, []);

  const getFilesMap = useCallback(() => {
    return filesMap.current;
  }, []);

  // ── PC side: receive thumbnails ──
  const addThumbs = useCallback((thumbs) => {
    setGallery(prev => {
      const existingIds = new Set(prev.map(g => g.id));
      const newItems = thumbs.filter(t => !existingIds.has(t.id));
      return [...prev, ...newItems];
    });
  }, []);

  // ── PC side: update thumbnails progressively ──
  const updateThumbs = useCallback((thumbUpdates) => {
    setGallery(prev => {
      const updates = new Map(thumbUpdates.map(t => [t.id, t.thumb]));
      return prev.map(item => {
        const newThumb = updates.get(item.id);
        if (newThumb) return { ...item, thumb: newThumb };
        return item;
      });
    });
  }, []);

  const clearGallery = useCallback(() => {
    setGallery([]);
    filesMap.current.clear();
  }, []);

  return {
    gallery,
    progress,
    processAndStreamFiles,
    getFileById,
    getFilesMap,
    addThumbs,
    updateThumbs,
    clearGallery,
    filesMap
  };
}

// ── Thumbnail generators ──

function generateImageThumb(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = THUMB_SIZE / Math.max(img.width, img.height);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };
    img.src = url;
  });
}

function generateVideoThumb(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.muted = true;
    video.preload = 'metadata';
    
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration / 2);
    };
    
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      const scale = THUMB_SIZE / Math.max(video.videoWidth, video.videoHeight);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Video load failed'));
    };
    video.src = url;
  });
}
