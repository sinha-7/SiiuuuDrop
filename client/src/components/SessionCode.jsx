import React from 'react';

export default function SessionCode({ code }) {
  if (!code) return null;
  const digits = code.toString().split('');

  return (
    <div className="flex gap-2 justify-center my-6">
      {digits.map((digit, i) => (
        <React.Fragment key={i}>
          <div className="w-12 h-16 bg-gray-900 border border-gray-700 rounded-lg flex items-center justify-center text-3xl font-mono text-theme-cyan shadow-[0_4px_20px_rgba(0,229,255,0.15)]">
            {digit}
          </div>
          {i === 2 && <div className="w-4 flex items-center justify-center text-gray-500 font-bold">-</div>}
        </React.Fragment>
      ))}
    </div>
  );
}
