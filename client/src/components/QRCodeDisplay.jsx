import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function QRCodeDisplay({ value }) {
  return (
    <div className="bg-white p-4 rounded-xl shadow-[0_0_30px_rgba(0,229,255,0.2)]">
      <QRCodeSVG value={value} size={250} level="H" bgColor="#ffffff" fgColor="#080810" />
    </div>
  );
}
