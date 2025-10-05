const { authenticateSocket } = require('../middleware/socketAuth');

function setupSocketHandlers(io, prisma) {
  // Socket authentication middleware
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`User ${socket.user.name} connected`);

    // Join board room
    socket.on('join-board', (boardId) => {
      socket.join(`board:${boardId}`);
      console.log(`User ${socket.user.name} joined board:${boardId}`);

      // Notify others about user presence
      socket.to(`board:${boardId}`).emit('user-joined', {
        user: socket.user,
        timestamp: new Date(),
      });
    });

    // Leave board room
    socket.on('leave-board', (boardId) => {
      socket.leave(`board:${boardId}`);
      console.log(`User ${socket.user.name} left board:${boardId}`);

      // Notify others about user leaving
      socket.to(`board:${boardId}`).emit('user-left', {
        user: socket.user,
        timestamp: new Date(),
      });
    });

    // Card moved
    socket.on('card-moved', async (data) => {
      const { cardId, fromListId, toListId, newPosition, boardId } = data;

      try {
        // Update card in database
        const card = await prisma.card.update({
          where: { id: cardId },
          data: {
            listId: toListId,
            position: newPosition,
          },
          include: {
            assignments: {
              include: {
                user: { select: { id: true, name: true, avatar: true } },
              },
            },
            _count: { select: { comments: true } },
          },
        });

        // Broadcast to other users in the board
        socket.to(`board:${boardId}`).emit('card-moved', {
          card,
          movedBy: socket.user,
          timestamp: new Date(),
        });

        // Log activity
        const fromList = await prisma.list.findUnique({
          where: { id: fromListId },
        });
        const toList = await prisma.list.findUnique({
          where: { id: toListId },
        });

        await prisma.activity.create({
          data: {
            type: 'card_moved',
            boardId: boardId,
            userId: socket.user.id,
            data: {
              cardTitle: card.title,
              fromList: fromList.title,
              toList: toList.title,
            },
          },
        });
      } catch (error) {
        console.error('Error moving card:', error);
        socket.emit('error', { message: 'Failed to move card' });
      }
    });

    // New comment
    socket.on('new-comment', async (data) => {
      const { cardId, text, boardId } = data;

      try {
        const comment = await prisma.comment.create({
          data: {
            text,
            cardId,
            authorId: socket.user.id,
          },
          include: {
            author: { select: { id: true, name: true, avatar: true } },
          },
        });

        // Broadcast to other users in the board
        socket.to(`board:${boardId}`).emit('new-comment', {
          comment,
          addedBy: socket.user,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error('Error adding comment:', error);
        socket.emit('error', { message: 'Failed to add comment' });
      }
    });

    // User typing indicator
    socket.on('user-typing', (data) => {
      const { boardId, cardId, isTyping } = data;
      socket.to(`board:${boardId}`).emit('user-typing', {
        user: socket.user,
        cardId,
        isTyping,
        timestamp: new Date(),
      });
    });

    socket.on('disconnect', () => {
      console.log(`User ${socket.user.name} disconnected`);
    });
  });
}

module.exports = { setupSocketHandlers };
