const express = require('express');
const router = express.Router();
const sessionManager = require('../utils/sessionManager');

router.post('/create', (req, res) => {
  const session = sessionManager.createSession();
  res.json({ sessionId: session.id, code: session.code });
});

router.post('/join/:code', (req, res) => {
  const { code } = req.params;
  const session = sessionManager.getSession(code);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // devices count will be managed by socket.io
  res.json({ sessionId: session.id, code: session.code });
});

router.get('/:id/status', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = router;
