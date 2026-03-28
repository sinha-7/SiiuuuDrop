import React from 'react';
import { Smartphone, Image as ImageIcon, Film, FolderOpen, LogOut, Zap } from 'lucide-react';

export default function GallerySidebar({ 
  peerConnected, sessionCode, totalCount, photoCount, videoCount,
  filter, onFilterChange, onDisconnect 
}) {
  const items = [
    { key: 'all', icon: FolderOpen, label: 'All Items', count: totalCount },
    { key: 'photo', icon: ImageIcon, label: 'Photos', count: photoCount },
    { key: 'video', icon: Film, label: 'Videos', count: videoCount },
  ];

  return (
    <div className="gallery-sidebar">
      <div className="sidebar-device">
        <div className="sidebar-device-icon">
          <Smartphone size={24} className="text-theme-cyan" />
          <span className={`sidebar-device-dot ${peerConnected ? 'online' : 'offline'}`} />
        </div>
        <div className="sidebar-device-info">
          <span className="sidebar-device-name">Phone</span>
          <span className="sidebar-device-status">
            {peerConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="sidebar-divider" />

      <nav className="sidebar-nav">
        <div className="sidebar-nav-label">LIBRARY</div>
        {items.map(item => (
          <button
            key={item.key}
            onClick={() => onFilterChange(item.key)}
            className={`sidebar-nav-item ${filter === item.key ? 'active' : ''}`}
          >
            <item.icon size={18} />
            <span className="sidebar-nav-text">{item.label}</span>
            <span className="sidebar-nav-count">{item.count}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-spacer" />

      <button onClick={onDisconnect} className="sidebar-disconnect">
        <LogOut size={16} />
        <span>Disconnect</span>
      </button>
    </div>
  );
}
