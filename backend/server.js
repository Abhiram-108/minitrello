const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Auth middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'fallback-secret'
    );
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, avatar: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
    });

    // Create token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json({ token, user: userWithoutPassword });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Create token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Create board
app.post('/api/boards', authenticateToken, async (req, res) => {
  try {
    const { title, description } = req.body;
    console.log('Creating board for user:', req.user.id, 'Title:', title);

    // Create workspace first
    const workspace = await prisma.workspace.create({
      data: {
        name: `${title} Workspace`,
        ownerId: req.user.id,
      },
    });

    // Create board with lists
    const board = await prisma.board.create({
      data: {
        title,
        description: description || '',
        workspaceId: workspace.id,
        ownerId: req.user.id,
        members: {
          create: {
            userId: req.user.id,
            role: 'owner',
          },
        },
        lists: {
          create: [
            { title: 'To Do', position: 1.0 },
            { title: 'In Progress', position: 2.0 },
            { title: 'Done', position: 3.0 },
          ],
        },
      },
      include: {
        lists: {
          orderBy: { position: 'asc' },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, avatar: true },
            },
          },
        },
      },
    });

    console.log('Board created successfully:', board.id);
    res.status(201).json(board);
  } catch (error) {
    console.error('Create board error:', error);
    res.status(500).json({ error: 'Failed to create board: ' + error.message });
  }
});

// Get user's boards
app.get('/api/boards', authenticateToken, async (req, res) => {
  try {
    const boards = await prisma.board.findMany({
      where: {
        OR: [
          { ownerId: req.user.id },
          { members: { some: { userId: req.user.id } } },
        ],
      },
      include: {
        owner: {
          select: { id: true, name: true, avatar: true },
        },
        lists: {
          include: {
            cards: {
              orderBy: { position: 'asc' },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(boards);
  } catch (error) {
    console.error('Get boards error:', error);
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
});

// Get specific board
app.get('/api/boards/:boardId', authenticateToken, async (req, res) => {
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
        lists: {
          include: {
            cards: {
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
    console.error('Get board error:', error);
    res.status(500).json({ error: 'Failed to fetch board' });
  }
});

// Create card
app.post('/api/cards', authenticateToken, async (req, res) => {
  try {
    const { title, listId, position } = req.body;
    console.log('Creating card:', { title, listId, position });

    // Get list to get boardId
    const list = await prisma.list.findUnique({
      where: { id: listId },
    });

    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    const card = await prisma.card.create({
      data: {
        title,
        position: position || 1.0,
        listId,
        boardId: list.boardId,
      },
      include: {
        list: {
          select: { id: true, title: true },
        },
      },
    });

    console.log('Card created successfully:', card.id);
    res.status(201).json(card);
  } catch (error) {
    console.error('Create card error:', error);
    res.status(500).json({ error: 'Failed to create card: ' + error.message });
  }
});

// Update card (move between lists)
app.put('/api/cards/:cardId', authenticateToken, async (req, res) => {
  try {
    const { listId, position } = req.body;

    const card = await prisma.card.update({
      where: { id: req.params.cardId },
      data: { listId, position },
      include: {
        list: {
          select: { id: true, title: true },
        },
      },
    });

    res.json(card);
  } catch (error) {
    console.error('Update card error:', error);
    res.status(500).json({ error: 'Failed to update card' });
  }
});

// DELETE BOARD ROUTE - ADD THIS
// SIMPLER DELETE APPROACH
app.delete('/api/boards/:boardId', authenticateToken, async (req, res) => {
  try {
    const { boardId } = req.params;
    const userId = req.user.id;

    console.log('Deleting board:', boardId);

    // Manually delete in the correct order to avoid foreign key constraints
    await prisma.card.deleteMany({
      where: { boardId: boardId },
    });

    await prisma.list.deleteMany({
      where: { boardId: boardId },
    });

    await prisma.boardMember.deleteMany({
      where: { boardId: boardId },
    });

    await prisma.activity.deleteMany({
      where: { boardId: boardId },
    });

    // Now delete the board
    await prisma.board.delete({
      where: {
        id: boardId,
        ownerId: userId,
      },
    });

    console.log('✅ Board deleted successfully');
    res.json({ message: 'Board deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);

    if (error.code === 'P2025') {
      return res
        .status(404)
        .json({ error: 'Board not found or you are not the owner' });
    }

    res.status(500).json({ error: 'Failed to delete board' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is working!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Test endpoint: http://localhost:${PORT}/api/test`);
});
