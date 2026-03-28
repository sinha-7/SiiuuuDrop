import { useCallback } from 'react';
import streamSaver from 'streamsaver';

export function useFileStream() {
  const receiveFile = useCallback(async (fileName, fileSize, fileType) => {
    let writableStream;

    // Use File System Access API if available
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: fileName });
        writableStream = await handle.createWritable();
      } catch (e) {
        // User cancelled or error, fallback
        console.warn('File System Access API failed or cancelled', e);
        if (e.name === 'AbortError') throw e; // bubble up abort
        writableStream = streamSaver.createWriteStream(fileName, { size: fileSize });
      }
    } else {
      // Fallback: streamsaver
      writableStream = streamSaver.createWriteStream(fileName, { size: fileSize });
    }

    const writer = writableStream.getWriter();

    return {
      writeChunk: async (chunk) => {
        await writer.write(new Uint8Array(chunk));
      },
      finish: async () => {
        await writer.close();
      }
    };
  }, []);

  return { receiveFile };
}
