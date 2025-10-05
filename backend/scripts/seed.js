const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Adding sample data...');

  // Create a user
  const user = await prisma.user.create({
    data: {
      email: 'test@example.com',
      name: 'Test User',
      password: await bcrypt.hash('password123', 12),
    },
  });

  // Create a workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: 'My Workspace',
      ownerId: user.id,
    },
  });

  // Create a board
  const board = await prisma.board.create({
    data: {
      title: 'My First Board',
      workspaceId: workspace.id,
      ownerId: user.id,
      members: {
        create: {
          userId: user.id,
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
    include: { lists: true },
  });

  // Add some cards
  await prisma.card.create({
    data: {
      title: 'Welcome to Mini Trello!',
      listId: board.lists[0].id,
      boardId: board.id,
      position: 1.0,
    },
  });

  console.log('✅ Setup complete!');
  console.log('📧 Login with: test@example.com');
  console.log('🔑 Password: password123');
}

main();
