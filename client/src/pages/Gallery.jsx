import React, { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useGallerySync } from '../hooks/useGallerySync';
import { useFileDownload } from '../hooks/useFileDownload';
import GallerySidebar from '../components/GallerySidebar';
import GalleryGrid from '../components/GalleryGrid';
import GalleryToolbar from '../components/GalleryToolbar';
import DownloadBar from '../components/DownloadBar';
import { Zap, Wifi, WifiOff } from 'lucide-react';

export default function Gallery() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sessionCode, targetPeerId } = location.state || JSON.parse(sessionStorage.getItem('swiftdrop_gallery') || '{}');
  
  const { socket, connected } = useSocket();
  const { gallery, addThumbs, updateThumbs } = useGallerySync(socket);
  const { downloads, requestFiles, onFileStart, onFileChunk, onFileEnd, clearCompleted, activeCount } = useFileDownload(socket);
  
  const [peerConnected, setPeerConnected] = useState(!!targetPeerId);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [filter, setFilter] = useState('all'); // all, photo, video
  const [sortBy, setSortBy] = useState('date-desc');
  const [searchQuery, setSearchQuery] = useState('');

  // Persist session
  useEffect(() => {
    if (sessionCode) {
      sessionStorage.setItem('swiftdrop_gallery', JSON.stringify({ sessionCode, targetPeerId }));
    }
  }, [sessionCode, targetPeerId]);

  // Rejoin session
  useEffect(() => {
    if (!socket || !sessionCode) {
      if (!sessionCode) navigate('/');
      return;
    }
    socket.emit('join_session', sessionCode);
  }, [socket, sessionCode]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const onPeer = (id) => setPeerConnected(true);
    const onPeerDc = () => setPeerConnected(false);
    const onThumbs = (data) => addThumbs(data.thumbs);
    const onThumbUpdate = (data) => updateThumbs(data.thumbs);

    socket.on('peer_connected', onPeer);
    socket.on('peer_disconnected', onPeerDc);
    socket.on('gallery_thumbs', onThumbs);
    socket.on('gallery_thumb_update', onThumbUpdate);
    socket.on('file_start', onFileStart);
    socket.on('file_chunk', onFileChunk);
    socket.on('file_end', onFileEnd);

    return () => {
      socket.off('peer_connected', onPeer);
      socket.off('peer_disconnected', onPeerDc);
      socket.off('gallery_thumbs', onThumbs);
      socket.off('gallery_thumb_update', onThumbUpdate);
      socket.off('file_start', onFileStart);
      socket.off('file_chunk', onFileChunk);
      socket.off('file_end', onFileEnd);
    };
  }, [socket, addThumbs, onFileStart, onFileChunk, onFileEnd]);

  // Filter + sort gallery
  const filteredGallery = useMemo(() => {
    let items = [...gallery];
    
    // Filter
    if (filter === 'photo') items = items.filter(i => i.type?.startsWith('image/'));
    else if (filter === 'video') items = items.filter(i => i.type?.startsWith('video/'));
    
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q));
    }
    
    // Sort
    switch (sortBy) {
      case 'date-desc': items.sort((a, b) => (b.date || 0) - (a.date || 0)); break;
      case 'date-asc': items.sort((a, b) => (a.date || 0) - (b.date || 0)); break;
      case 'size-desc': items.sort((a, b) => b.size - a.size); break;
      case 'size-asc': items.sort((a, b) => a.size - b.size); break;
      case 'name': items.sort((a, b) => a.name.localeCompare(b.name)); break;
      default: break;
    }
    
    return items;
  }, [gallery, filter, sortBy, searchQuery]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredGallery.map(i => i.id)));
  };

  const deselectAll = () => setSelectedIds(new Set());

  const handleDownload = () => {
    const ids = Array.from(selectedIds);
    if (ids.length > 0) {
      requestFiles(ids);
      setSelectedIds(new Set());
    }
  };

  const photoCount = gallery.filter(i => i.type?.startsWith('image/')).length;
  const videoCount = gallery.filter(i => i.type?.startsWith('video/')).length;

  return (
    <div className="gallery-layout">
      <GallerySidebar
        peerConnected={peerConnected}
        sessionCode={sessionCode}
        totalCount={gallery.length}
        photoCount={photoCount}
        videoCount={videoCount}
        filter={filter}
        onFilterChange={setFilter}
        onDisconnect={() => navigate('/')}
      />
      
      <div className="gallery-main">
        <div className="gallery-header">
          <div className="gallery-brand">
            <Zap size={22} className="text-theme-cyan" />
            <span className="gallery-brand-text">SiiuuuDrop</span>
            <span className="gallery-session-badge">{sessionCode}</span>
          </div>
          <div className="gallery-connection-status">
            {peerConnected ? (
              <span className="status-connected"><Wifi size={14} /> Phone Connected</span>
            ) : (
              <span className="status-waiting"><WifiOff size={14} /> Waiting for phone...</span>
            )}
          </div>
        </div>

        <GalleryToolbar
          selectedCount={selectedIds.size}
          totalCount={filteredGallery.length}
          sortBy={sortBy}
          onSortChange={setSortBy}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
          onDownload={handleDownload}
        />

        {gallery.length === 0 ? (
          <div className="gallery-empty">
            <div className="gallery-empty-icon">📱</div>
            <h3>Waiting for photos...</h3>
            <p>Open SiiuuuDrop on your phone and share your gallery.</p>
            <p className="gallery-empty-hint">Your photos will appear here automatically.</p>
          </div>
        ) : (
          <GalleryGrid
            items={filteredGallery}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        )}
      </div>

      {downloads.length > 0 && (
        <DownloadBar
          downloads={downloads}
          onClearCompleted={clearCompleted}
        />
      )}
    </div>
  );
}
