const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 50e6 // 50MB for thumbnail batches
});

app.use(cors());
app.use(express.json({ limit: 'Infinity' }));
app.use(express.urlencoded({ limit: 'Infinity', extended: true }));

const sessionRoutes = require('./routes/session');
const relayRoutes = require('./routes/relay');
const socketHandlers = require('./socket/handlers');

app.use('/api/session', sessionRoutes);
app.use('/api/relay', relayRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Initialize socket handlers
socketHandlers(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
