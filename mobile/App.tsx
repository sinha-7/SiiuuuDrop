import React, { useState, useRef, useCallback } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  SafeAreaView, StatusBar, Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import {
  requestPermission, getAllAssets, generateThumbnailsParallel,
  getAssetFileUri, GalleryAsset, setThumbnailsPaused
} from './services/gallery';
import {
  connectToServer, joinSession, sendGalleryThumbs,
  streamFileToPC, disconnectFromServer, getSocket
} from './services/socket';

type AppState = 'connect' | 'loading' | 'syncing' | 'thumbs' | 'connected';

export default function App() {
  const [state, setState] = useState<AppState>('connect');
  const [serverIp, setServerIp] = useState('192.168.0.112');
  const [sessionCode, setSessionCode] = useState('');
  const [error, setError] = useState('');
  const [totalAssets, setTotalAssets] = useState(0);
  const [loadedAssets, setLoadedAssets] = useState(0);
  const [syncedThumbs, setSyncedThumbs] = useState(0);
  const [sharedCount, setSharedCount] = useState(0);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const allAssetsRef = useRef<GalleryAsset[]>([]);

  const handleConnect = useCallback(async () => {
    if (!sessionCode || sessionCode.length !== 6) { setError('Enter a 6-digit code'); return; }
    setError(''); setState('loading');

    try {
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert('Permission Required', 'Please allow photo library access.');
        setState('connect'); return;
      }

      const socket = connectToServer(`http://${serverIp}:3001`);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Connection timeout')), 10000);
        socket.on('connect', () => { clearTimeout(t); resolve(); });
        socket.on('connect_error', (e) => { clearTimeout(t); reject(e); });
      });

      joinSession(sessionCode);
      await new Promise<void>(r => { socket.once('session_joined', () => r()); setTimeout(r, 2000); });

      // ── PHASE 1: Send metadata instantly (no thumbnails) ──
      setState('syncing');
      allAssetsRef.current = [];
      
      const allItems = await getAllAssets(
        (batch) => {
          // Send metadata immediately — PC will show placeholders
          const metaOnly = batch.map(a => ({
            id: a.id,
            name: a.filename,
            size: 0,
            type: a.mediaType === 'photo' ? 'image/jpeg' : 'video/mp4',
            date: a.creationTime,
            width: a.width,
            height: a.height,
            duration: a.duration,
            thumb: null, // No thumbnail yet
          }));
          sendGalleryThumbs(metaOnly);
        },
        (loaded, total) => { setLoadedAssets(loaded); setTotalAssets(total); }
      );

      allAssetsRef.current = allItems;
      setSharedCount(allItems.length);

      // ── PHASE 2: Generate thumbnails in parallel (background) ──
      setState('thumbs');
      setSyncedThumbs(0);

      // Don't await — let it run in background while user is already browsing
      generateThumbnailsParallel(
        allItems,
        (thumbBatch) => {
          // Send thumbnail updates — PC will replace placeholders
          socket.emit('gallery_thumb_update', { thumbs: thumbBatch });
        },
        (done, total) => { setSyncedThumbs(done); }
      ).then(() => {
        setState('connected');
      });

      // Listen for download requests from PC
      const activeSocket = getSocket();
      activeSocket?.on('request_download', async (fileIds: string[]) => {
        console.log(`[DL] Received request to download ${fileIds.length} files`);
        
        // Pause background thumbnails to free up RAM for the download
        setThumbnailsPaused(true);

        for (const fileId of fileIds) {
          try {
            console.log(`[DL] Processing fileId: ${fileId}`);
            const fileInfo = await getAssetFileUri(fileId);
            if (fileInfo) {
              console.log(`[DL] Asset info found: ${fileInfo.filename}`);
              setUploading(fileInfo.filename);
              setUploadProgress(0);
              await streamFileToPC(fileInfo.uri, fileId, fileInfo.filename, fileInfo.size, fileInfo.mimeType,
                (sent, total) => setUploadProgress(Math.round((sent / total) * 100)));
              console.log(`[DL] Finished streaming: ${fileInfo.filename}`);
              setUploading(null);
            } else {
              console.warn(`[DL] Could not get asset info for ${fileId}`);
            }
          } catch (e) {
            console.error(`[DL] Error processing fileId ${fileId}:`, e);
          }
        }

        // Resume thumbnails after download batch is finished
        setThumbnailsPaused(false);
      });

    } catch (err: any) {
      setError(err.message || 'Failed to connect');
      setState('connect');
    }
  }, [serverIp, sessionCode]);

  const handleDisconnect = () => {
    disconnectFromServer();
    allAssetsRef.current = [];
    setState('connect');
    setSharedCount(0);
  };

  const thumbPercent = totalAssets > 0 ? Math.round((syncedThumbs / totalAssets) * 100) : 0;

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}><Text style={s.logo}>⚡ SiiuuuDrop</Text></View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

        {state === 'connect' && (
          <View style={s.card}>
            <Text style={s.title}>Connect to PC</Text>
            <Text style={s.subtitle}>Enter your PC's IP and the 6-digit code from your PC browser.</Text>
            <Text style={s.label}>PC IP ADDRESS</Text>
            <TextInput style={s.input} value={serverIp} onChangeText={setServerIp}
              placeholder="192.168.0.xxx" placeholderTextColor="#555" keyboardType="numeric" autoCorrect={false} />
            <Text style={s.label}>SESSION CODE</Text>
            <TextInput style={[s.input, s.codeInput]} value={sessionCode}
              onChangeText={(t) => setSessionCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="000000" placeholderTextColor="#555" keyboardType="number-pad" maxLength={6} />
            {error ? <Text style={s.error}>{error}</Text> : null}
            <TouchableOpacity style={s.connectBtn} onPress={handleConnect}>
              <Text style={s.connectBtnText}>Connect & Share Gallery</Text>
            </TouchableOpacity>
          </View>
        )}

        {state === 'loading' && (
          <View style={s.card}>
            <ActivityIndicator size="large" color="#00e5ff" />
            <Text style={s.statusText}>Connecting to PC...</Text>
          </View>
        )}

        {state === 'syncing' && (
          <View style={s.card}>
            <ActivityIndicator size="large" color="#00e5ff" />
            <Text style={s.statusText}>Loading gallery...</Text>
            <View style={s.prog}>
              <Text style={s.progLabel}>Found {loadedAssets} of {totalAssets} items</Text>
              <View style={s.bar}><View style={[s.fill, { width: `${totalAssets > 0 ? (loadedAssets / totalAssets) * 100 : 0}%` }]} /></View>
            </View>
          </View>
        )}

        {(state === 'thumbs' || state === 'connected') && (
          <>
            <View style={[s.card, { borderColor: '#00e67630', alignItems: 'center' as const }]}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>✅</Text>
              <Text style={s.title}>Connected to PC</Text>
              <Text style={{ color: '#00e5ff', fontFamily: 'monospace', marginTop: 4 }}>Session: {sessionCode}</Text>
            </View>

            <View style={[s.card, { borderColor: '#00e5ff20', alignItems: 'center' as const }]}>
              <Text style={{ fontSize: 48, fontWeight: '700', color: '#00e5ff' }}>{sharedCount}</Text>
              <Text style={{ color: '#888', marginTop: 4 }}>items visible on PC</Text>
            </View>

            {state === 'thumbs' && (
              <View style={s.card}>
                <Text style={{ color: '#aaa', fontSize: 13, marginBottom: 8 }}>
                  Generating thumbnails: {syncedThumbs}/{totalAssets} ({thumbPercent}%)
                </Text>
                <View style={s.bar}><View style={[s.fill, { width: `${thumbPercent}%` }]} /></View>
                <Text style={{ color: '#555', fontSize: 11, marginTop: 8 }}>
                  PC can already browse and download your photos!
                </Text>
              </View>
            )}

            {uploading && (
              <View style={s.card}>
                <Text style={{ color: '#00e5ff', fontWeight: '600', marginBottom: 8 }}>📤 Sending: {uploading}</Text>
                <View style={s.bar}><View style={[s.fill, { width: `${uploadProgress}%` }]} /></View>
              </View>
            )}

            <TouchableOpacity 
              style={[s.disconnectBtn, { borderColor: '#00e5ff', marginBottom: 12 }]} 
              onPress={async () => {
                const first = allAssetsRef.current[0];
                if (!first) return;
                const fileInfo = await getAssetFileUri(first.id);
                if (fileInfo) {
                  setUploading(fileInfo.filename);
                  await streamFileToPC(fileInfo.uri, first.id, fileInfo.filename, fileInfo.size, fileInfo.mimeType,
                    (sent, total) => setUploadProgress(Math.round((sent / total) * 100)));
                  setUploading(null);
                }
              }}
            >
              <Text style={{ color: '#00e5ff' }}>Test Send 1st Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.disconnectBtn} onPress={handleDisconnect}>
              <Text style={{ color: '#666' }}>Disconnect</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080810' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  logo: { fontSize: 22, fontWeight: '700', color: '#fff' },
  content: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: '#0c0c18', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#1a1a2e', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 24, lineHeight: 20 },
  label: { fontSize: 11, fontWeight: '600', color: '#666', marginBottom: 6, marginTop: 12, letterSpacing: 1 },
  input: { backgroundColor: '#12121e', borderRadius: 12, padding: 16, color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#1a1a2e' },
  codeInput: { fontSize: 24, fontWeight: '700', letterSpacing: 8, textAlign: 'center' },
  error: { color: '#ff5252', fontSize: 13, marginTop: 12, textAlign: 'center' },
  connectBtn: { backgroundColor: '#00e5ff', borderRadius: 12, padding: 16, marginTop: 24, alignItems: 'center' },
  connectBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  statusText: { color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 16, textAlign: 'center' },
  prog: { marginTop: 20, width: '100%' },
  progLabel: { color: '#aaa', fontSize: 12, marginBottom: 8 },
  bar: { height: 6, backgroundColor: '#1a1a2e', borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#00e5ff', borderRadius: 3 },
  disconnectBtn: { borderWidth: 1, borderColor: '#333', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 },
});
