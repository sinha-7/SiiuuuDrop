import React from 'react';
import { Search, Download, CheckSquare, Square, ArrowDownAZ, ArrowUpDown } from 'lucide-react';

export default function GalleryToolbar({
  selectedCount, totalCount, sortBy, onSortChange,
  searchQuery, onSearchChange, onSelectAll, onDeselectAll, onDownload
}) {
  return (
    <div className="gallery-toolbar">
      <div className="toolbar-left">
        {/* Select toggle */}
        <button
          onClick={selectedCount > 0 ? onDeselectAll : onSelectAll}
          className="toolbar-btn"
          title={selectedCount > 0 ? 'Deselect All' : 'Select All'}
        >
          {selectedCount > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
          <span>{selectedCount > 0 ? `${selectedCount} selected` : 'Select'}</span>
        </button>

        {/* Search */}
        <div className="toolbar-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className="toolbar-right">
        {/* Sort */}
        <div className="toolbar-sort">
          <ArrowUpDown size={16} />
          <select value={sortBy} onChange={e => onSortChange(e.target.value)}>
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="size-desc">Largest First</option>
            <option value="size-asc">Smallest First</option>
            <option value="name">Name A-Z</option>
          </select>
        </div>

        {/* Download */}
        <button
          onClick={onDownload}
          disabled={selectedCount === 0}
          className="toolbar-download-btn"
        >
          <Download size={18} />
          <span>Download{selectedCount > 0 ? ` (${selectedCount})` : ''}</span>
        </button>
      </div>
    </div>
  );
}
