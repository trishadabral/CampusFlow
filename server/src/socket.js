// Socket.IO service for real-time telemetry and admin dashboard sync.
// Only authenticated admins join the 'admins' room to receive live events.

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const pool = require('./dbms/db');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH'],
    },
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization?.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.slice(7)
          : null);

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      let payload;
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
      } catch (err) {
        return next(new Error('Invalid authentication token'));
      }

      const [rows] = await pool.query(
        'SELECT id, name, email, role FROM users WHERE id = ?',
        [payload.id]
      );
      if (!rows.length) {
        return next(new Error('Account not found'));
      }

      socket.user = rows[0];
      next();
    } catch (err) {
      next(err);
    }
  });

  io.on('connection', (socket) => {
    if (socket.user && socket.user.role === 'admin') {
      socket.join('admins');
      socket.emit('connected', {
        message: 'Connected to CampusFlow monitoring stream (admins room)',
        user: socket.user.email,
      });
    }

    socket.on('disconnect', () => {
      // client disconnected
    });
  });

  return io;
}

function getIO() {
  return io;
}

function emitAgentStatus(data) {
  if (io) {
    io.to('admins').emit('agent:status', data);
  }
}

function emitAgentEvent(data) {
  if (io) {
    io.to('admins').emit('agent:event', data);
  }
}

function emitSessionUpdate(data) {
  if (io) {
    io.to('admins').emit('session:update', data);
  }
}

module.exports = {
  initSocket,
  getIO,
  emitAgentStatus,
  emitAgentEvent,
  emitSessionUpdate,
};

