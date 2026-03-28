import React, { useEffect, useState } from 'react';

export default function SpeedMeter({ bytesTransferred, active }) {
  const [speed, setSpeed] = useState(0);
  const [lastBytes, setLastBytes] = useState(0);

  useEffect(() => {
    if (!active) {
      setSpeed(0);
      return;
    }

    const interval = setInterval(() => {
      setSpeed(prev => {
        const diff = bytesTransferred - lastBytes;
        setLastBytes(bytesTransferred);
        return diff >= 0 ? diff : 0;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [bytesTransferred, lastBytes, active]);

  const formatSpeed = (bytesPerSec) => {
    if (bytesPerSec === 0) return '0.0 MB/s';
    const mb = bytesPerSec / (1024 * 1024);
    return mb.toFixed(1) + ' MB/s';
  };

  return (
    <div className="flex flex-col items-center justify-center py-4 text-center">
      <div className="text-4xl font-mono font-bold text-theme-cyan drop-shadow-[0_0_15px_rgba(0,229,255,0.4)]">
        {formatSpeed(speed)}
      </div>
      <div className="text-xs text-gray-400 mt-1 uppercase tracking-widest font-semibold flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-theme-cyan animate-pulse"></div> Active Speed
      </div>
    </div>
  );
}
