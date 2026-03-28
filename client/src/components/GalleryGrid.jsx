import React from 'react';
import { FileText, Film, Image as ImageIcon, Check } from 'lucide-react';

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function GalleryGrid({ items, selectedIds, onToggleSelect }) {
  if (items.length === 0) {
    return (
      <div className="gallery-grid-empty">
        <p>No items match your filters.</p>
      </div>
    );
  }

  // Group by date
  const groups = {};
  items.forEach(item => {
    const key = item.date ? formatDate(item.date) : 'Unknown Date';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  return (
    <div className="gallery-grid-scroll">
      {Object.entries(groups).map(([date, groupItems]) => (
        <div key={date} className="gallery-date-group">
          <div className="gallery-date-header">
            <span>{date}</span>
            <span className="gallery-date-count">{groupItems.length} items</span>
          </div>
          <div className="gallery-grid">
            {groupItems.map(item => {
              const isSelected = selectedIds.has(item.id);
              const isVideo = item.type?.startsWith('video/');
              
              return (
                <div
                  key={item.id}
                  className={`gallery-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => onToggleSelect(item.id)}
                >
                  {item.thumb ? (
                    <img src={item.thumb} alt={item.name} className="gallery-thumb" loading="lazy" />
                  ) : (
                    <div className="gallery-thumb-placeholder">
                      {isVideo ? <Film size={28} /> : <ImageIcon size={28} />}
                    </div>
                  )}
                  
                  {/* Video badge */}
                  {isVideo && (
                    <div className="gallery-video-badge">
                      <Film size={12} />
                    </div>
                  )}
                  
                  {/* Selection indicator */}
                  <div className={`gallery-check ${isSelected ? 'checked' : ''}`}>
                    {isSelected && <Check size={14} strokeWidth={3} />}
                  </div>
                  
                  {/* Hover overlay */}
                  <div className="gallery-item-overlay">
                    <span className="gallery-item-name">{item.name}</span>
                    <span className="gallery-item-size">{formatSize(item.size)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
