const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

// Create list
router.post('/', async (req, res) => {
  const { title, boardId, position } = req.body;

  try {
    // Verify board access
    const board = await prisma.board.findFirst({
      where: {
        id: boardId,
        OR: [
          { ownerId: req.user.id },
          { members: { some: { userId: req.user.id } } },
        ],
      },
    });

    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const list = await prisma.list.create({
      data: {
        title,
        position: position || 1.0,
        boardId,
      },
      include: {
        cards: {
          include: {
            assignments: {
              include: {
                user: { select: { id: true, name: true, avatar: true } },
              },
            },
            _count: { select: { comments: true } },
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        type: 'list_created',
        boardId: boardId,
        userId: req.user.id,
        data: { listTitle: list.title },
      },
    });

    res.status(201).json(list);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create list' });
  }
});

// Update list (reordering, title)
router.put('/:listId', async (req, res) => {
  const { title, position } = req.body;

  try {
    const list = await prisma.list.findFirst({
      where: { id: req.params.listId },
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

    const updatedList = await prisma.list.update({
      where: { id: req.params.listId },
      data: { title, position },
      include: {
        cards: {
          include: {
            assignments: {
              include: {
                user: { select: { id: true, name: true, avatar: true } },
              },
            },
            _count: { select: { comments: true } },
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    res.json(updatedList);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update list' });
  }
});

// Delete list
router.delete('/:listId', async (req, res) => {
  try {
    const list = await prisma.list.findFirst({
      where: { id: req.params.listId },
      include: { board: true },
    });

    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Only owner or admin can delete
    const hasPermission = await prisma.board.findFirst({
      where: {
        id: list.boardId,
        OR: [
          { ownerId: req.user.id },
          {
            members: {
              some: { userId: req.user.id, role: { in: ['owner', 'admin'] } },
            },
          },
        ],
      },
    });

    if (!hasPermission) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    await prisma.list.delete({
      where: { id: req.params.listId },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        type: 'list_deleted',
        boardId: list.boardId,
        userId: req.user.id,
        data: { listTitle: list.title },
      },
    });

    res.json({ message: 'List deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete list' });
  }
});

module.exports = router;
