## MiniTrello - Collaborative Kanban Board

A lightweight full-stack Trello-like application for managing projects, tasks, and team collaboration. Includes real-time updates, workspaces, boards, lists, cards, user authentication, and basic search.

Version React Node Database

### Table of Contents

- Overview
- Key Features
- System Architecture
- Database Design
- Installation
- Usage
- API Documentation
- Project Structure
- Business Logic
- Development Features
- License

### Overview

MiniTrello streamlines task organization using a familiar Kanban model. Users create workspaces, boards, lists, and cards; collaborate with members; assign users to cards; add comments; and see activity. Real-time updates are supported via websockets.

**Problem Statement**

- Fragmented task tracking across tools and spreadsheets
- Lack of real-time collaboration and visibility into changes
- Difficult to manage workspaces, boards, and memberships coherently

**Solution**
A web-based Kanban system with authentication, workspace/board membership, drag-and-drop lists/cards, card assignments, comments, and activity logs with real-time updates.

image image

### Key Features

**Core Functionality**

- Multi-workspace and multi-board structure
- Lists and cards with sortable positions (drag-and-drop ready)
- Card assignments and comments
- Workspace and board memberships with roles
- Activity tracking for board events

**Advanced Features**

- Real-time updates via websockets (Socket.IO)
- Search endpoints for boards/cards
- Validation using Zod and `validator`
- Secure auth with JWT, password hashing with bcrypt
- Security headers via Helmet and CORS configuration

**Security & Data Management**

- JWT-based authentication middleware
- Role and membership checks at route level (where applicable)
- Prisma ORM with relational constraints and uniqueness rules

### System Architecture

**Technology Stack**
Frontend

- React ^19 with TypeScript
- React Router ^7 for client-side navigation
- Tailwind CSS ^4 for styling
- DnD Kit for drag-and-drop interactions
- Axios for API calls

Backend

- Node.js with Express ^5
- RESTful API with layered middleware
- Helmet, CORS, Zod-based validation
- Socket.IO for realtime events

Database & ORM

- SQLite (development) via Prisma ^6
- Prisma Client for type-safe queries, migrations, and seeding

Additional Libraries

- bcryptjs, jsonwebtoken, validator

**System Flow**
Client (React) → API Layer (Express) → Business Logic (Controllers/Services) → Database (SQLite via Prisma)
↑ ↑ ↑ ↑
UI Components Route Handlers Middlewares Prisma Client
State Management Axios Services Validation Data Models

### Database Design

**Entity Relationship Model (simplified)**
Users (1:N) ↔ Workspaces (owner) → Boards (1:N) → Lists (1:N) → Cards (1:N)
Users (N:M) ↔ Workspaces via WorkspaceMembers
Users (N:M) ↔ Boards via BoardMembers
Users (N:M) ↔ Cards via CardAssignments
Cards (1:N) → Comments
Boards (1:N) → Activities

**Key Entities**

- Users: Accounts with credentials and profile attributes
- Workspaces: Top-level grouping, owned by a user
- Boards: Kanban boards within a workspace
- Lists: Ordered columns on a board
- Cards: Tasks within lists, with assignments and comments
- Members: WorkspaceMember, BoardMember relations
- Activity: Records user activity on a board

**Database Constraints (from Prisma schema)**

- Unique email on `User`
- Unique membership per user/workspace and user/board
- Unique card assignment per user/card
- Relational integrity across all references

### Installation

**Prerequisites**

- Node.js 18+ (or newer)
- npm

> Dev database uses SQLite via Prisma; no external DB is required for local development.

**Clone Repository**

```bash
git clone <your-repo-url>.git
cd mini-trello
```

**Backend Configuration**

```bash
cd backend
npm install
```

Create `.env` in `backend` (example):

```bash
PORT=5000
NODE_ENV=development
JWT_SECRET="your_jwt_secret_here"
```

Setup Prisma (SQLite)

```bash
npx prisma migrate dev --name init
npm run seed
```

**Frontend Configuration**

```bash
cd ../frontend
npm install
```

**Start Development Servers**

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm start
```

**Access Application**

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5000`

### Usage

**Auth**

- Register and login to obtain a JWT
- Subsequent requests should include `Authorization: Bearer <token>`

**Workspaces and Boards**

- Create a workspace and boards within it
- Invite members to collaborate (workspace/board membership)

**Lists and Cards**

- Create lists, drag to reorder (by `position`)
- Create cards within lists; assign users, comment, and set due dates

**Realtime**

- Connected clients receive updates via websockets for relevant events

### API Documentation (selected)

Auth

```text
POST   /api/auth/register
POST   /api/auth/login
```

Users

```text
GET    /api/users/me                # Current user profile
```

Workspaces

```text
GET    /api/workspaces              # List workspaces
POST   /api/workspaces              # Create workspace
GET    /api/workspaces/:id          # Get workspace details
```

Boards

```text
GET    /api/boards?workspaceId=...  # List boards in a workspace
POST   /api/boards                  # Create board
GET    /api/boards/:id              # Board details
```

Lists

```text
GET    /api/lists?boardId=...       # Lists in a board
POST   /api/lists                   # Create list
PATCH  /api/lists/:id               # Update title/position
```

Cards

```text
GET    /api/cards?listId=...        # Cards in a list
POST   /api/cards                   # Create card
PATCH  /api/cards/:id               # Update card
DELETE /api/cards/:id               # Remove card
```

Search

```text
GET    /api/search?q=...            # Search boards/cards
```

> Note: Consult route files in `backend/routes/` (`auth.js`, `boards.js`, `lists.js`, `cards.js`, `search.js`, `users.js`, `workspaces.js`) for full parameter details and responses.

### Project Structure

```
mini-trello/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # Database schema (SQLite dev)
│   │   └── dev.db               # SQLite database (development)
│   ├── routes/                  # API endpoints
│   │   ├── auth.js
│   │   ├── boards.js
│   │   ├── lists.js
│   │   ├── cards.js
│   │   ├── users.js
│   │   ├── search.js
│   │   └── workspaces.js
│   ├── middleware/              # Auth and socket validation
│   ├── websocket/               # Socket.IO handlers
│   ├── scripts/                 # Seed data
│   └── server.js                # App entry point
└── frontend/
    ├── src/
    │   ├── components/          # Reusable UI components
    │   ├── pages/               # Views (Dashboard, BoardPage, Auth)
    │   ├── context/             # Auth context
    │   ├── App.tsx              # Routing and shell
    │   └── services (via axios) # API layer (inline in components)
    └── public/                  # Static assets
```

### Business Logic

**Assignment & Membership Rules**

- Workspace members can be added once per workspace (unique constraint)
- Board members unique per board
- Card assignments are unique per (card, user)

**List/Card Ordering**

- Lists and cards use `position` (Float) for ordering; clients compute positions when reordering

**Access Control**

- JWT auth protects routes; server-side checks ensure user membership/ownership for sensitive actions

**Validation**

- Input validation with Zod and `validator`, plus Prisma constraints

### Development Features

- Seed script: `npm run seed` in `backend`
- Prisma migrations: `npm run migrate` in `backend`
- Dev server with nodemon: `npm run dev` in `backend`
- Frontend dev: `npm start` in `frontend`

### Environment Variables (backend/.env)

- `PORT` (default 5000)
- `NODE_ENV`
- `JWT_SECRET`

### Notes

- Default development DB is SQLite (file-based). For production, configure a different Prisma datasource and set `DATABASE_URL` accordingly.

### License

This project is provided for educational and demonstration purposes.
