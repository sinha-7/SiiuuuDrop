import React from 'react';
import { motion } from 'framer-motion';

export default function ProgressBar({ progress, label }) {
  return (
    <div className="w-full">
      {label && <div className="text-xs text-gray-400 mb-1 flex justify-between font-mono">
        <span>{label}</span>
        <span>{progress}%</span>
      </div>}
      <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
        <motion.div 
          className="h-full bg-theme-cyan"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ ease: "linear", duration: 0.1 }}
        />
      </div>
    </div>
  );
}
