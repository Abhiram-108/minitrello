## MiniTrello - High Level Design (HLD)

A lightweight Trello-style task management system enabling teams to collaborate via workspaces, boards, lists, and cards, with realtime updates and role-aware access control.

### Objectives

- Provide a simple, fast Kanban experience for small teams
- Support collaboration with memberships, comments, and assignments
- Deliver realtime UI updates with minimal backend complexity

### Primary Users & Personas

- Individual contributor: creates cards, moves tasks, comments
- Team lead/owner: manages boards, memberships, and structure
- Viewer/collaborator: reads and participates with limited permissions

### Core Use Cases

- Authenticate users (register/login)
- Create and organize boards with lists and cards
- Assign teammates to cards and comment on tasks
- Track activity and receive realtime updates (card moves, comments)
- Search boards/cards (basic text search)

---

## Architecture Overview

Layered client–server architecture with a thin realtime layer.

- Client (React + TypeScript)

  - UI components, routing, DnD interactions, API services
  - Auth context stores JWT and user profile
  - Socket client for board rooms and live updates

- API (Node.js + Express)

  - REST endpoints for auth, boards, lists, cards, comments, search
  - Middleware for authN/authZ, input validation, and error handling
  - Activity logging for key user actions

- Realtime (Socket.IO)

  - Authenticated socket connections
  - Board-scoped rooms for broadcasting events
  - Events for card moves, new comments, and presence/typing

- Data (Prisma ORM over SQLite for dev)
  - Normalized relational schema: users, workspaces, boards, lists, cards, memberships, comments, activities
  - Unique constraints on memberships and assignments

---

## Logical Component Diagram

- Web App (React)

  - Pages: Login/Register, Dashboard, Board
  - Components: Lists, Cards, Header, ProtectedRoute
  - Context: Auth
  - Services: Axios-based API client, Socket client

- API Service (Express)

  - Controllers/Routes: auth, boards, lists, cards, comments, activities, search
  - Middleware: JWT auth, (future) validation, error handler
  - Services: Board service, Card service (thin, currently co-located in routes)
  - Integrations: Socket.IO server, Prisma client

- Data Layer (Prisma)
  - Models: User, Workspace, WorkspaceMember, Board, BoardMember, List, Card, CardAssignment, Comment, Activity
  - Access patterns via Prisma Client

---

## Deployment Topology (Dev)

- Single Node.js process running Express API
- React dev server (CRA) served separately
- SQLite database file within backend `prisma/dev.db`
- Socket.IO hosted within the API process

Production-ready evolution:

- Managed Postgres/MySQL (DATABASE_URL)
- Reverse proxy (NGINX) terminating TLS
- API + Web (containerized) behind load balancer
- Sticky sessions not required (Socket.IO can be scaled with adapter like Redis)

---

## Data Model (Summary)

- Users own Workspaces; Workspaces contain Boards
- Boards contain Lists; Lists contain Cards
- Users relate to Workspaces and Boards via membership tables
- Cards relate to Users via assignments; Cards have Comments
- Activity logs capture user actions on Boards

Key constraints:

- Unique email on User
- Unique (workspaceId, userId), (boardId, userId), (cardId, userId)
- Referential integrity on all relations

---

## Key Flows

Authenticate

1. Client submits credentials → API verifies → issues JWT and returns user
2. Client stores token and attaches `Authorization: Bearer <token>`

Open Board

1. Client fetches board details (lists/cards)
2. Client connects socket and `join-board`
3. Server emits presence and subsequent realtime updates to room

Move Card (DnD)

1. Client computes new `position` and target `listId`
2. Client updates via REST; server persists, logs `Activity`
3. Server emits `card-moved` to room; clients reconcile UI

Comment on Card

1. Client posts comment via REST; server persists and logs `Activity`
2. Server emits `new-comment`; clients append comment

---

## Realtime Strategy

- Room-per-board: `board:{boardId}`
- JWT-authenticated socket connections
- Events: `user-joined`, `user-left`, `card-moved`, `new-comment`, `user-typing`
- Error propagation via `error` event payloads

---

## Security & Access Control

- AuthN: JWT with 7-day expiry, signed using `JWT_SECRET`
- AuthZ: owner/member checks at board level; owner/admin required for destructive actions
- Transport: CORS; recommend HTTPS in production
- Input: basic validation (Zod planned), DB constraints enforce uniqueness/integrity

---

## Quality Attributes

- Performance: O(1) CRUD operations; client-driven ordering with float positions
- Availability: stateless API; simple restart semantics in dev
- Scalability: horizontal scaling possible with shared DB and Socket.IO adapter
- Observability: health/test endpoints; logging (upgrade to structured logs later)
- Maintainability: Prisma schema as source of truth; typed React front end

---

## Configuration & Environments

- Backend: `PORT`, `NODE_ENV`, `JWT_SECRET` (required in production)
- Database: SQLite (dev). For prod, set `DATABASE_URL` and update Prisma datasource
- Frontend: `.env` for API base URL and socket URL (future)

---

## Risks & Mitigations

- Float position drift → periodic normalization routine
- Realtime scalability → introduce Redis adapter for Socket.IO in multi-instance
- Data growth in activities/comments → pagination and archival policies
- Security hardening → add rate limiting, stricter validation, and CSRF protections where applicable

---

## Roadmap (Selected Enhancements)

- Workspace and board invitations (email)
- Labels, checklists, attachments
- Full-text search and advanced filtering
- Role policies abstraction and audit trails
- Production deployment guides and IaC templates
