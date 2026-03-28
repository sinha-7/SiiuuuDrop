const sessionManager = require('../utils/sessionManager');

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join_session', (code) => {
      console.log(`Join request for code: ${code} from socket: ${socket.id}`);
      const session = sessionManager.getSession(code);
      if (session) {
        socket.join(session.id);
        socket.sessionId = session.id;
        socket.sessionCode = code;
        
        const existingPeers = Array.from(session.devices);
        session.devices.add(socket.id);
        
        console.log(`Session ${code}: peers=[${existingPeers.join(',')}] + new=${socket.id}`);
        
        // Notify others in room
        socket.to(session.id).emit('peer_connected', socket.id);
        
        // Acknowledge self and send existing peer
        const peerId = existingPeers.length > 0 ? existingPeers[0] : null;
        socket.emit('session_joined', session.id, peerId);
      } else {
        console.log(`Session NOT found: ${code}`);
        socket.emit('error', 'Session not found');
      }
    });

    // ── Gallery thumbnail streaming (phone → PC) ──
    socket.on('gallery_thumbs', (data) => {
      console.log(`gallery_thumbs: ${data.thumbs?.length} items from ${socket.id}`);
      if (socket.sessionId) {
        socket.to(socket.sessionId).emit('gallery_thumbs', data);
      }
    });

    // ── Progressive thumbnail updates ──
    socket.on('gallery_thumb_update', (data) => {
      if (socket.sessionId) {
        socket.to(socket.sessionId).emit('gallery_thumb_update', data);
      }
    });

    // ── PC requests specific files for download ──
    socket.on('request_download', (fileIds) => {
      console.log(`request_download: ${fileIds?.length} files from ${socket.id}`);
      if (socket.sessionId) {
        socket.to(socket.sessionId).emit('request_download', fileIds);
      }
    });

    // ── File streaming: phone → server → PC ──
    socket.on('file_start', (meta) => {
      // meta = { id, name, size, type }
      if (socket.sessionId) {
        socket.to(socket.sessionId).emit('file_start', meta);
      }
    });

    socket.on('file_chunk', (data) => {
      // data = { id, chunk (ArrayBuffer/String), offset }
      if (socket.sessionId) {
        socket.to(socket.sessionId).emit('file_chunk', data);
      }
    });

    socket.on('file_chunk_ack', (data) => {
      if (socket.sessionId) {
        socket.to(socket.sessionId).emit('file_chunk_ack', data);
      }
    });

    socket.on('file_end', (meta) => {
      // meta = { id, name }
      if (socket.sessionId) {
        socket.to(socket.sessionId).emit('file_end', meta);
      }
    });

    // ── Legacy events (keep for backward compat) ──
    socket.on('webrtc_offer', (offer, targetId) => {
      socket.to(targetId).emit('webrtc_offer', offer, socket.id);
    });

    socket.on('webrtc_answer', (answer, targetId) => {
      socket.to(targetId).emit('webrtc_answer', answer, socket.id);
    });

    socket.on('webrtc_ice_candidate', (candidate, targetId) => {
      socket.to(targetId).emit('webrtc_ice_candidate', candidate, socket.id);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      if (socket.sessionId && socket.sessionCode) {
        const session = sessionManager.getSession(socket.sessionCode);
        if (session) {
          session.devices.delete(socket.id);
          io.to(socket.sessionId).emit('peer_disconnected', socket.id);
          
          if (session.devices.size === 0) {
            sessionManager.removeSession(socket.sessionCode);
          }
        }
      }
    });
  });
};
