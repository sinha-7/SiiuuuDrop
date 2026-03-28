import React from 'react';
import { Download, CheckCircle, Loader, X } from 'lucide-react';

function formatSize(bytes) {
  if (bytes === 0 || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function DownloadBar({ downloads, onClearCompleted }) {
  // Group batch downloads to prevent rendering thousands of UI nodes
  const groupedDownloads = [];
  const batches = {};

  downloads.forEach(d => {
    if (d.batchId) {
      if (!batches[d.batchId]) {
        batches[d.batchId] = {
          id: d.batchId, // use batchId as key
          isBatch: true,
          count: 0,
          received: 0,
          size: 0,
          status: 'completed', // true until proven pending
          name: ''
        };
        groupedDownloads.push(batches[d.batchId]);
      }
      const b = batches[d.batchId];
      b.count++;
      b.received += d.received;
      b.size += d.size;
      if (d.status !== 'completed') {
        b.status = 'downloading';
      }
      b.name = `Batch Download (${b.count} items)`;
    } else {
      groupedDownloads.push(d);
    }
  });

  const active = groupedDownloads.filter(d => d.status === 'downloading' || d.status === 'pending');
  const completed = groupedDownloads.filter(d => d.status === 'completed');

  return (
    <div className="download-bar">
      <div className="download-bar-header">
        <span className="download-bar-title">
          <Download size={16} />
          Downloads
          {active.length > 0 && <span className="download-bar-badge">{active.length}</span>}
        </span>
        {completed.length > 0 && (
          <button onClick={onClearCompleted} className="download-bar-clear">
            Clear completed
          </button>
        )}
      </div>
      
      <div className="download-bar-list">
        {groupedDownloads.map(d => (
          <div key={d.id} className={`download-item ${d.status}`}>
            <div className="download-item-info">
              {d.status === 'completed' ? (
                <CheckCircle size={14} className="text-theme-green" />
              ) : d.status === 'downloading' ? (
                <Loader size={14} className="animate-spin text-theme-cyan" />
              ) : (
                <Download size={14} className="text-gray-400" />
              )}
              <span className="download-item-name">{d.name || 'Pending...'}</span>
              <span className="download-item-size">
                {d.size > 0 ? `${formatSize(d.received)} / ${formatSize(d.size)}` : ''}
              </span>
            </div>
            {d.status === 'downloading' && d.size > 0 && (
              <div className="download-item-bar">
                <div 
                  className="download-item-fill"
                  style={{ width: `${(d.received / d.size) * 100}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
