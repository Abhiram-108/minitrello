const jwt = require('jsonwebtoken');

const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication error'));
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback-secret'
    );
    socket.user = { id: decoded.userId };
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
};

module.exports = { authenticateSocket };
