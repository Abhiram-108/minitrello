const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

// Create card
router.post('/', async (req, res) => {
  const { title, listId, position, description, dueDate } = req.body;

  try {
    const list = await prisma.list.findFirst({
      where: { id: listId },
      include: { board: true },
    });

    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Verify board access
    const hasAccess = await prisma.board.findFirst({
      where: {
        id: list.boardId,
        OR: [
          { ownerId: req.user.id },
          { members: { some: { userId: req.user.id } } },
        ],
      },
    });

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const card = await prisma.card.create({
      data: {
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : null,
        position: position || 1.0,
        listId,
        boardId: list.boardId,
      },
      include: {
        assignments: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
        list: { select: { id: true, title: true } },
        _count: { select: { comments: true } },
      },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        type: 'card_created',
        boardId: list.boardId,
        userId: req.user.id,
        data: {
          cardTitle: card.title,
          listTitle: list.title,
        },
      },
    });

    res.status(201).json(card);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create card' });
  }
});

// Update card (move between lists, update details)
router.put('/:cardId', async (req, res) => {
  const { title, description, dueDate, listId, position, assignees } = req.body;

  try {
    const card = await prisma.card.findFirst({
      where: { id: req.params.cardId },
      include: { board: true },
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Verify board access
    const hasAccess = await prisma.board.findFirst({
      where: {
        id: card.boardId,
        OR: [
          { ownerId: req.user.id },
          { members: { some: { userId: req.user.id } } },
        ],
      },
    });

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updateData = {
      title,
      description,
      dueDate: dueDate ? new Date(dueDate) : null,
    };

    if (listId !== undefined) updateData.listId = listId;
    if (position !== undefined) updateData.position = position;

    const updatedCard = await prisma.card.update({
      where: { id: req.params.cardId },
      data: updateData,
      include: {
        assignments: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
        list: { select: { id: true, title: true } },
        _count: { select: { comments: true } },
      },
    });

    // Handle assignees if provided
    if (assignees) {
      await prisma.cardAssignment.deleteMany({
        where: { cardId: req.params.cardId },
      });

      if (assignees.length > 0) {
        await prisma.cardAssignment.createMany({
          data: assignees.map((userId) => ({
            cardId: req.params.cardId,
            userId,
          })),
        });
      }
    }

    // Log activity for move
    if (listId && listId !== card.listId) {
      const newList = await prisma.list.findUnique({ where: { id: listId } });
      const oldList = await prisma.list.findUnique({
        where: { id: card.listId },
      });

      await prisma.activity.create({
        data: {
          type: 'card_moved',
          boardId: card.boardId,
          userId: req.user.id,
          data: {
            cardTitle: card.title,
            fromList: oldList.title,
            toList: newList.title,
          },
        },
      });
    }

    res.json(updatedCard);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update card' });
  }
});

// Get card details
router.get('/:cardId', async (req, res) => {
  try {
    const card = await prisma.card.findFirst({
      where: { id: req.params.cardId },
      include: {
        assignments: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
        list: { select: { id: true, title: true } },
        comments: {
          include: {
            author: { select: { id: true, name: true, avatar: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        board: {
          include: {
            members: {
              include: {
                user: { select: { id: true, name: true, avatar: true } },
              },
            },
          },
        },
      },
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Verify board access
    const hasAccess = await prisma.board.findFirst({
      where: {
        id: card.boardId,
        OR: [
          { ownerId: req.user.id },
          { members: { some: { userId: req.user.id } } },
        ],
      },
    });

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(card);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch card' });
  }
});

// Add comment to card
router.post('/:cardId/comments', async (req, res) => {
  const { text } = req.body;

  try {
    const card = await prisma.card.findFirst({
      where: { id: req.params.cardId },
      include: { board: true },
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Verify board access
    const hasAccess = await prisma.board.findFirst({
      where: {
        id: card.boardId,
        OR: [
          { ownerId: req.user.id },
          { members: { some: { userId: req.user.id } } },
        ],
      },
    });

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const comment = await prisma.comment.create({
      data: {
        text,
        cardId: req.params.cardId,
        authorId: req.user.id,
      },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
      },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        type: 'comment_added',
        boardId: card.boardId,
        userId: req.user.id,
        data: {
          cardTitle: card.title,
          commentPreview:
            text.substring(0, 50) + (text.length > 50 ? '...' : ''),
        },
      },
    });

    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

module.exports = router;
