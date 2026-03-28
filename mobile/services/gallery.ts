import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const THUMB_SIZE = 100; // Smaller = faster
const META_BATCH = 100; // Send metadata in batches of 100
const THUMB_BATCH = 20; // Send thumbnails in batches of 20
const PARALLEL = 2;     // Process 2 thumbnails at once (safer for RAM)

let isPaused = false;
export function setThumbnailsPaused(p: boolean) {
  isPaused = p;
}

export interface GalleryAsset {
  id: string;
  filename: string;
  uri: string;
  mediaType: 'photo' | 'video' | 'audio' | 'unknown';
  width: number;
  height: number;
  duration: number;
  creationTime: number;
}

export async function requestPermission(): Promise<boolean> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  return status === 'granted';
}

// Phase 1: Load ALL asset metadata (fast — no file I/O)
export async function getAllAssets(
  onBatch: (assets: GalleryAsset[]) => void,
  onProgress: (loaded: number, total: number) => void
): Promise<GalleryAsset[]> {
  let hasNextPage = true;
  let endCursor: string | undefined;
  let all: GalleryAsset[] = [];

  const first = await MediaLibrary.getAssetsAsync({ first: 1, mediaType: ['photo', 'video'] });
  const totalCount = first.totalCount;
  onProgress(0, totalCount);

  while (hasNextPage) {
    const page = await MediaLibrary.getAssetsAsync({
      first: META_BATCH,
      after: endCursor,
      mediaType: ['photo', 'video'],
      sortBy: [MediaLibrary.SortBy.creationTime],
    });

    const assets: GalleryAsset[] = page.assets.map(a => ({
      id: a.id,
      filename: a.filename,
      uri: a.uri,
      mediaType: a.mediaType as any,
      width: a.width,
      height: a.height,
      duration: a.duration,
      creationTime: a.creationTime,
    }));

    all = all.concat(assets);
    onBatch(assets);
    onProgress(all.length, totalCount);
    hasNextPage = page.hasNextPage;
    endCursor = page.endCursor;
  }

  return all;
}

// Phase 2: Generate thumbnails in PARALLEL (much faster)
export async function generateThumbnailsParallel(
  assets: GalleryAsset[],
  onBatch: (thumbs: any[]) => void,
  onProgress: (done: number, total: number) => void
): Promise<void> {
  let done = 0;
  let batch: any[] = [];

  for (let i = 0; i < assets.length; i += PARALLEL) {
    // If a download starts, we pause the background thumbnail engine 
    // to prevent CPU/RAM competition and OOM crashes.
    while (isPaused) {
      await new Promise(r => setTimeout(r, 1000));
    }

    const chunk = assets.slice(i, i + PARALLEL);
    
    const results = await Promise.all(
      chunk.map(async (asset) => {
        let thumb: string | null = null;
        if (asset.mediaType === 'photo') {
          try {
            const result = await manipulateAsync(
              asset.uri,
              [{ resize: { width: THUMB_SIZE } }],
              { compress: 0.4, format: SaveFormat.JPEG, base64: true }
            );
            thumb = `data:image/jpeg;base64,${result.base64}`;
          } catch (e) {
            // Skip failed thumbnails silently
          }
        }
        return { id: asset.id, thumb };
      })
    );

    batch.push(...results.filter(r => r.thumb !== null));
    done += chunk.length;

    if (batch.length >= THUMB_BATCH || i + PARALLEL >= assets.length) {
      if (batch.length > 0) {
        onBatch(batch);
        batch = [];
      }
      onProgress(done, assets.length);
    }
  }
}

export async function getAssetFileUri(assetId: string): Promise<{ uri: string; filename: string; size: number; mimeType: string } | null> {
  console.log(`[DL/Gallery] Calling getAssetInfoAsync for ${assetId}`);
  try {
    const info = await MediaLibrary.getAssetInfoAsync(assetId);
    console.log(`[DL/Gallery] Asset info received. localUri: ${info.localUri}, uri: ${info.uri}`);
    
    const targetUri = info.localUri || info.uri;
    if (!targetUri) {
      console.warn(`[DL/Gallery] No URI found for asset ${assetId}`);
      return null;
    }
    
    console.log(`[DL/Gallery] Getting FileSystem info for ${targetUri}`);
    
    let finalSize = 0;
    try {
      // Modern Expo 54 File API (synchronous properties)
      const fsAny = FileSystem as any;
      if (fsAny.File) {
        const file = new fsAny.File(targetUri);
        if (!file.exists) {
          console.warn(`[DL/Gallery] File does not exist: ${targetUri}`);
          return null;
        }
        finalSize = file.size || 0;
      }
    } catch (fsErr) {
      console.warn(`[DL/Gallery] File API threw (ignoring): ${fsErr}`);
      // If File API fails, we just don't get the size. File might still exist.
    }

    const ext = info.filename.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic',
      gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime',
    };

    console.log(`[DL/Gallery] Returning file info for ${info.filename}. Size: ${finalSize}`);

    return {
      uri: targetUri,
      filename: info.filename,
      size: finalSize,
      mimeType: mimeMap[ext] || 'application/octet-stream',
    };
  } catch (e: any) {
    console.error('[DL/Gallery] getAssetFileUri threw error:', e.message || e);
    return null;
  }
}
