import React from 'react';
import { File, Image, Video, FileText, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import ProgressBar from './ProgressBar';

export default function FileCard({ fileObj }) {
  const { name, size, type, progress, status } = fileObj;

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const Icon = type.startsWith('image/') ? Image : 
               type.startsWith('video/') ? Video : 
               type.includes('pdf') || type.includes('text') ? FileText : File;

  return (
    <div className="bg-gray-900/50 border border-gray-800 hover:border-gray-700 transition-colors rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gray-800 rounded-lg text-theme-cyan">
          <Icon size={24} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-white truncate">{name}</h4>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{formatSize(size)}</p>
        </div>
        <div className="flex items-center gap-2">
          {status === 'pending' && <span className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Pending</span>}
          {status === 'sending' && <Loader size={18} className="text-theme-cyan animate-spin" />}
          {status === 'receiving' && <Loader size={18} className="text-theme-blue animate-spin" />}
          {status === 'completed' && <CheckCircle size={18} className="text-theme-green shadow-[0_0_10px_rgba(0,255,136,0.5)] rounded-full" />}
          {status === 'error' && <AlertCircle size={18} className="text-red-500" />}
        </div>
      </div>
      
      {(status === 'sending' || status === 'receiving' || status === 'completed') && (
        <ProgressBar progress={progress} label={status === 'completed' ? 'Done' : 'Transferring'} />
      )}
    </div>
  );
}
