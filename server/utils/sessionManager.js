const crypto = require('crypto');

// In-memory store for active sessions
const sessions = new Map();

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
}

module.exports = {
  createSession: () => {
    let code;
    do {
      code = generateCode();
    } while (sessions.has(code));
    
    const sessionId = crypto.randomUUID();
    sessions.set(code, {
      id: sessionId,
      code,
      devices: new Set(),
      createdAt: Date.now()
    });
    return sessions.get(code);
  },
  getSession: (code) => {
    return sessions.get(code);
  },
  removeSession: (code) => {
    sessions.delete(code);
  }
};
