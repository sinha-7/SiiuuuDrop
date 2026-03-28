import { io, Socket } from 'socket.io-client';
import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';

const CHUNK_SIZE = 128 * 1024; // 128KB base64 string chunks

let socket: Socket | null = null;

export function connectToServer(serverUrl: string): Socket {
  if (socket?.connected) socket.disconnect();

  socket = io(serverUrl, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => console.log('Connected:', socket?.id));
  socket.on('disconnect', (r) => console.log('Disconnected:', r));
  socket.on('connect_error', (e) => console.error('Connection error:', e.message));

  return socket;
}

export function getSocket(): Socket | null { return socket; }

export function joinSession(code: string): void {
  socket?.emit('join_session', code);
}

export function sendGalleryThumbs(thumbs: any[]): void {
  socket?.emit('gallery_thumbs', { thumbs });
}

export async function streamFileToPC(
  fileUri: string, fileId: string, fileName: string,
  fileSize: number, mimeType: string,
  onProgress?: (sent: number, total: number) => void
): Promise<void> {
  console.log(`[DL] streamFileToPC started for ${fileName} (${fileId})`);
  if (!socket) {
    console.warn('[DL] Socket is null! Aborting stream.');
    return;
  }

  const fsAny = FileSystem as any;
  const legacyDir = FileSystemLegacy.cacheDirectory || FileSystemLegacy.documentDirectory || '';
  const cacheDirectory = legacyDir.endsWith('/') ? legacyDir : legacyDir + '/';
  const cacheUri = cacheDirectory + 'dl_' + Date.now() + '_' + fileName.replace(/[^a-zA-Z0-9.]/g, '_');

  try {
    console.log(`[DL] Copying ${fileUri} to ${cacheUri} using Legacy SDK`);
    
    // 1. Copy to cache using Legacy API to prevent "Method copyAsync is deprecated"
    await FileSystemLegacy.copyAsync({ from: fileUri, to: cacheUri });
    
    console.log(`[DL] Verifying cache file exists...`);
    let actualSize = fileSize;
    try {
      if (fsAny.File) {
        const file = new fsAny.File(cacheUri);
        actualSize = file.size || fileSize;
      }
    } catch(e) { console.warn('[DL] File API size check skipped', e); }
    
    console.log(`[DL] Actual size: ${actualSize}`);

    // 2. Start streaming
    console.log(`[DL] Emitting file_start`);
    socket.emit('file_start', {
      id: fileId,
      name: fileName,
      size: actualSize,
      type: mimeType,
    });

    let offset = 0;
    while (offset < actualSize || actualSize === 0) {
      const length = Math.min(CHUNK_SIZE, actualSize > 0 ? actualSize - offset : CHUNK_SIZE);
      
      let base64Chunk = '';
      try {
        // 3. Read base64 chunks from the standard file URI
        base64Chunk = await FileSystemLegacy.readAsStringAsync(cacheUri, {
          encoding: 'base64' as any,
          position: offset,
          length: length,
        });
      } catch (e: any) {
        console.error(`[DL] Chunk read error at offset ${offset}:`, e.message || e);
        break;
      }

      if (!base64Chunk || base64Chunk.length === 0) {
        console.log('[DL] Reached EOF');
        break;
      }

      // 4. Send chunk as Base64 string to avoid RN ArrayBuffer polyfill crash
      //    AWAIT the custom E2E acknowledgement from the PC to provide strict memory backpressure.
      //    This guarantees the JS string queue never grows beyond 1 chunk!
      await new Promise<void>(resolve => {
        const onAck = (data: any) => {
          if (data.id === fileId && data.offset === offset) {
            socket!.off('file_chunk_ack', onAck);
            resolve();
          }
        };
        socket!.on('file_chunk_ack', onAck);

        socket!.emit('file_chunk', {
          id: fileId,
          chunk: base64Chunk,
          offset,
          isBase64: true,
        });
      });

      offset += length;
      onProgress?.(offset, actualSize);

      // Periodically yield to the Javascript engine to allow Garbage Collection
      // of the Base64 strings, which prevents RAM spikes on iOS.
      if ((offset / length) % 10 === 0) {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    // 5. End streaming
    console.log(`[DL] Emitting file_end`);
    socket.emit('file_end', { id: fileId, name: fileName, type: mimeType });

  } catch (err: any) {
    console.error('[DL] streamFileToPC error:', err.message || err);
    socket.emit('file_end', { id: fileId, name: fileName, type: mimeType });
  } finally {
    // 6. Cleanup
    try {
      await FileSystemLegacy.deleteAsync(cacheUri, { idempotent: true });
    } catch(e) {}
  }
}

export function disconnectFromServer(): void {
  socket?.disconnect();
  socket = null;
}
