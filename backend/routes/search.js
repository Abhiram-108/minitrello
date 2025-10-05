const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

// Search cards in a board
router.get('/boards/:boardId/cards', async (req, res) => {
  try {
    const { boardId } = req.params;
    const { q } = req.query;

    // Verify board access
    const hasAccess = await prisma.board.findFirst({
      where: {
        id: boardId,
        OR: [
          { ownerId: req.user.id },
          { members: { some: { userId: req.user.id } } },
        ],
      },
    });

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const cards = await prisma.card.findMany({
      where: {
        boardId,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: {
        list: { select: { id: true, title: true } },
      },
    });

    res.json(cards);
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
