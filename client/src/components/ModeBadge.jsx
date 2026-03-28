import React from 'react';
import clsx from 'clsx';
import { Zap, Cloud } from 'lucide-react';

export default function ModeBadge({ mode }) {
  const isLan = mode === 'LAN Direct';
  return (
    <div className={clsx(
      "inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
      isLan ? "bg-theme-green/10 text-theme-green shadow-[0_0_10px_rgba(0,255,136,0.3)] border border-theme-green/30" : 
      mode === 'Relay Mode' ? "bg-theme-blue/10 text-theme-blue border border-theme-blue/30" : "bg-gray-800 text-gray-400"
    )}>
      {isLan ? <Zap size={16} /> : mode === 'Relay Mode' ? <Cloud size={16} /> : null}
      {isLan ? "⚡ LAN Direct" : mode === 'Relay Mode' ? "☁️ Relay Mode" : "Waiting for peer..."}
    </div>
  );
}
