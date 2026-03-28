import React, { useCallback, useState } from 'react';
import { UploadCloud, Image as ImageIcon, File as FileIcon } from 'lucide-react';
import clsx from 'clsx';

export default function FileDropZone({ onFilesSelected }) {
  const [isDragActive, setIsDragActive] = useState(false);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragActive(false);
  }, []);

  const onDrop = useCallback(async (e) => {
    e.preventDefault();
    setIsDragActive(false);
    
    const items = e.dataTransfer.items;
    const files = [];

    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i].webkitGetAsEntry();
        if (item) {
          await scanFiles(item, files);
        }
      }
    } else {
      files.push(...e.dataTransfer.files);
    }
    
    if (files.length > 0) {
      onFilesSelected(files);
    }
  }, [onFilesSelected]);

  const scanFiles = async (item, fileList) => {
    if (item.isFile) {
      const file = await new Promise((resolve) => item.file(resolve));
      fileList.push(file);
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      const entries = await new Promise((resolve) => dirReader.readEntries(resolve));
      for (const entry of entries) {
        await scanFiles(entry, fileList);
      }
    }
  };

  const onFileInputChange = (e) => {
    if (e.target.files?.length > 0) {
      onFilesSelected(Array.from(e.target.files));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div 
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={clsx(
          "w-full h-48 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all relative",
          isDragActive ? "border-theme-cyan bg-theme-cyan/5" : "border-gray-700 bg-gray-900/30"
        )}
      >
        <UploadCloud size={48} className={isDragActive ? "text-theme-cyan transition-transform scale-110" : "text-gray-500"} />
        <p className="mt-4 text-lg font-medium text-white">
          {isDragActive ? "Drop files now" : "Drag & Drop anywhere here"}
        </p>
      </div>
      
      <div className="flex gap-4">
        <label className="flex-1 flex items-center justify-center gap-2 py-4 bg-gray-800 hover:bg-gray-700 rounded-xl cursor-pointer transition-colors text-white font-medium border border-gray-700">
          <ImageIcon size={20} className="text-theme-cyan" />
          <span>Photos / Videos</span>
          <input 
            type="file" 
            multiple 
            accept="image/*,video/*"
            className="hidden"
            onChange={onFileInputChange}
          />
        </label>
        
        <label className="flex-1 flex items-center justify-center gap-2 py-4 bg-gray-800 hover:bg-gray-700 rounded-xl cursor-pointer transition-colors text-white font-medium border border-gray-700">
          <FileIcon size={20} className="text-theme-blue" />
          <span>Other Files</span>
          <input 
            type="file" 
            multiple 
            className="hidden"
            onChange={onFileInputChange}
          />
        </label>
      </div>
    </div>
  );
}
