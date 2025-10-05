const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

// Get user's boards
router.get('/', async (req, res) => {
  try {
    const boards = await prisma.board.findMany({
      where: {
        OR: [
          { ownerId: req.user.id },
          { members: { some: { userId: req.user.id } } },
        ],
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        workspace: { select: { id: true, name: true } },
        members: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
        _count: { select: { lists: true, members: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(boards);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
});

// Get board details
router.get('/:boardId', async (req, res) => {
  try {
    const board = await prisma.board.findFirst({
      where: {
        id: req.params.boardId,
        OR: [
          { ownerId: req.user.id },
          { members: { some: { userId: req.user.id } } },
        ],
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        workspace: { select: { id: true, name: true } },
        members: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
        lists: {
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
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    res.json(board);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch board' });
  }
});

// Create board
router.post('/', async (req, res) => {
  const { title, description, workspaceId, visibility = 'private' } = req.body;

  try {
    const board = await prisma.board.create({
      data: {
        title,
        description,
        visibility,
        workspaceId,
        ownerId: req.user.id,
        members: {
          create: { userId: req.user.id, role: 'owner' },
        },
        lists: {
          create: [
            { title: 'Backlog', position: 1.0 },
            { title: 'In Progress', position: 2.0 },
            { title: 'Done', position: 3.0 },
          ],
        },
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        lists: { orderBy: { position: 'asc' } },
        members: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
      },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        type: 'board_created',
        boardId: board.id,
        userId: req.user.id,
        data: { boardTitle: board.title },
      },
    });

    res.status(201).json(board);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create board' });
  }
});

// Update board
router.put('/:boardId', async (req, res) => {
  const { title, description, visibility } = req.body;

  try {
    const board = await prisma.board.update({
      where: {
        id: req.params.boardId,
        OR: [
          { ownerId: req.user.id },
          {
            members: {
              some: { userId: req.user.id, role: { in: ['owner', 'admin'] } },
            },
          },
        ],
      },
      data: { title, description, visibility },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        members: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
      },
    });

    res.json(board);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update board' });
  }
});

// Get board activities
router.get('/:boardId/activities', async (req, res) => {
  try {
    const activities = await prisma.activity.findMany({
      where: { boardId: req.params.boardId },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

module.exports = router;
