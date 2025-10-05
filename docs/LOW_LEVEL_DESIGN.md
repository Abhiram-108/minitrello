## MiniTrello - Low Level Design (LLD)

This document details internal modules, data contracts, control flows, validations, and operational considerations for MiniTrello.

### Scope

- Backend (Express + Prisma on SQLite for dev)
- Frontend (React + TypeScript + Tailwind)
- Realtime (Socket.IO)

### Non-Functional Requirements

- Authentication: JWT (HMAC) with 7d expiry
- Availability: Single-instance dev server; stateless HTTP; DB-backed state
- Performance: O(1) typical CRUD, paginated listings in future
- Security: Role checks on boards; owner/admin where required; CORS+Helmet
- Observability: Console logs; health endpoint; add structured logging later

### Environment

- PORT: default 5000
- NODE_ENV: development/production
- JWT_SECRET: required in production

### Packages (key)

- Backend: express ^5, @prisma/client ^6.16, prisma ^6.16, bcryptjs ^3, jsonwebtoken ^9, socket.io ^4.8, helmet ^8, cors ^2.8, zod ^4, validator ^13
- Frontend: react ^19, react-router-dom ^7, tailwindcss ^4, @dnd-kit/\*, axios ^1.12, typescript ^4.9

---

## Data Model (Prisma)

Entities and key fields (see `backend/prisma/schema.prisma` for full schema):

- User(id, email unique, name, avatar?, password, timestamps)
- Workspace(id, name, description?, ownerId → User)
- WorkspaceMember(id, workspaceId+userId unique, role)
- Board(id, title, description?, visibility, workspaceId → Workspace, ownerId → User)
- BoardMember(id, boardId+userId unique, role)
- List(id, title, position float, boardId → Board)
- Card(id, title, description?, position float, listId → List, boardId → Board, dueDate?)
- CardAssignment(id, cardId+userId unique)
- Comment(id, text, cardId → Card, authorId → User)
- Activity(id, type, boardId → Board, userId → User, data Json)

Constraints and invariants:

- Email unique for `User`
- Unique memberships for WorkspaceMember(boardId, userId) and BoardMember
- Unique CardAssignment(cardId, userId)
- Position is client-controlled float supporting reordering

Indexes (implicit):

- Unique indexes as above; consider adding indexes on foreign keys for scale

---

## Backend Architecture

### Server

- `backend/server.js` owns HTTP server and routes
- Middlewares: `cors`, `express.json`, `authenticateToken` (inline)
- Health endpoints: `/api/health`, `/api/test`

### Middleware

- `authenticateToken(req, res, next)`
  - Extracts Bearer token; verifies using `JWT_SECRET`
  - Loads minimal `User` and attaches as `req.user`
  - 401 if missing; 403 if invalid; 401 if user not found

### Route Modules (selected)

- `routes/boards.js`: CRUD for boards, activities listing
- `routes/lists.js`: Create/Update/Delete lists, access checks
- `routes/cards.js`: Create/Update/Get cards, comments
- `routes/auth.js`: Register/Login (if mounted separately)
- `routes/users.js`, `routes/workspaces.js`, `routes/search.js` (present, not detailed here)

### Realtime

- `websocket/socketHandlers.js`: room-based board events, requires socket auth middleware
- Rooms: `board:${boardId}`

---

## API Design

All authenticated endpoints require `Authorization: Bearer <token>`.

### Auth

- POST `/api/auth/register`
  - Body: { name: string, email: string, password: string }
  - 201 → { token, user }
- POST `/api/auth/login`
  - Body: { email: string, password: string }
  - 200 → { token, user }

User object shape (response subset):

```json
{
  "id": "string",
  "email": "user@example.com",
  "name": "Jane Doe",
  "avatar": "https://..." | null
}
```

### Boards

- GET `/api/boards`
  - Returns boards owned by or shared with `req.user`
  - 200 → Array of boards including owner, lists (with cards), ordered by `updatedAt desc`
- GET `/api/boards/:boardId`
  - Access: owner or member
  - 200 → Board with lists and cards (ordered by `position`)
- POST `/api/boards`
  - Body: { title: string, description?: string, workspaceId? (in `routes/boards.js` version), visibility?: 'private'|'public' }
  - Creates board and default lists; adds creator as owner member
  - 201 → Board with lists and members
- PUT `/api/boards/:boardId`
  - Body: { title?, description?, visibility? }
  - Access: owner or member with role in ['owner','admin']
  - 200 → Updated board
- DELETE `/api/boards/:boardId` (in `server.js` simplified version)
  - Access: owner
  - Cascaded manual deletes: cards, lists, boardMembers, activities → board
  - 200 → { message }
- GET `/api/boards/:boardId/activities`
  - Returns recent 20 activities with user info

Board object (typical subset):

```json
{
  "id": "string",
  "title": "Project X",
  "description": "",
  "visibility": "private",
  "workspaceId": "string",
  "owner": { "id": "...", "name": "...", "avatar": null },
  "lists": [ { "id": "...", "title": "Backlog", "position": 1.0, "cards": [ ... ] } ],
  "members": [ { "id": "...", "user": { "id": "...", "name": "..." }, "role": "owner" } ]
}
```

### Lists

- POST `/api/lists`
  - Body: { title: string, boardId: string, position?: number }
  - Access: owner or member
  - 201 → List with cards[] (empty)
- PUT `/api/lists/:listId`
  - Body: { title?: string, position?: number }
  - Access: board owner or member
  - 200 → Updated list with cards[]
- DELETE `/api/lists/:listId`
  - Access: owner or admin
  - 200 → { message }

List object (subset):

```json
{ "id": "string", "title": "Backlog", "position": 1.0, "boardId": "..." }
```

### Cards

- POST `/api/cards`
  - Body: { title: string, listId: string, position?: number, description?: string, dueDate?: ISO }
  - 201 → Card
- PUT `/api/cards/:cardId`
  - Body: { title?, description?, dueDate?, listId?, position?, assignees?: string[] }
  - 200 → Updated card; if `listId` changed, `Activity` of `card_moved` is added
- GET `/api/cards/:cardId`
  - 200 → Card with assignments, list, comments, and board members
- POST `/api/cards/:cardId/comments`
  - Body: { text: string }
  - 201 → Comment; logs `comment_added` activity

Card object (subset):

```json
{
  "id": "string",
  "title": "Implement login",
  "description": "",
  "position": 2.0,
  "listId": "...",
  "boardId": "...",
  "dueDate": null
}
```

### Health

- GET `/api/health` → { status: 'OK', timestamp }
- GET `/api/test` → { message: 'Backend is working!' }

---

## Validation

Server-side checks (Zod planned, pragmatic checks present now):

- Auth: presence and validity of Bearer JWT
- Access control: owner or board member per route
- Existence checks: list/board/card must exist; 404 if missing
- Type checks: title non-empty string; position numeric; dueDate parseable ISO when provided
- Assignment uniqueness enforced by DB on (cardId, userId)

Error responses shape:

```json
{ "error": "string" }
```

- 400: validation, bad credentials, duplicates
- 401: missing token; 403: invalid token/forbidden
- 404: not found
- 500: unexpected

---

## Ordering and Reordering

Positions are floats to allow O(1) insert between items without renumbering all items.

- Initial positions typically 1.0, 2.0, 3.0, ...
- When inserting between `a` and `b`, choose `(a.position + b.position)/2`
- Periodic normalization can be implemented to avoid float precision drift

Client-driven DnD

- On drag end, client computes new `position` and optionally new `listId`, then `PUT /api/cards/:cardId` or `PUT /api/lists/:listId`

---

## Realtime Design (Socket.IO)

Connection

- Socket middleware `authenticateSocket` validates JWT (see `middleware/socketAuth.js`)

Rooms

- `join-board` with `boardId` → joins room `board:${boardId}`; emits `user-joined`
- `leave-board` → leaves room; emits `user-left`

Events

- `card-moved` (client → server)
  - Payload: { cardId, fromListId, toListId, newPosition, boardId }
  - Server updates DB, emits `card-moved` to room with { card, movedBy, timestamp }
  - Logs Activity { type: 'card_moved', data: { cardTitle, fromList, toList } }
- `new-comment` (client → server)
  - Payload: { cardId, text, boardId }
  - Server inserts comment, emits `new-comment` with { comment, addedBy, timestamp }
- `user-typing` (client → server)
  - Payload: { boardId, cardId, isTyping }
  - Server emits `user-typing` to room

Error channel

- On failures, server emits `error` with { message }

---

## Security Model

Authentication

- JWT signed with `JWT_SECRET`; 7d expiry
  Authorization
- Resource-level checks:
  - Board access: owner or member
  - Elevated actions (delete list/board updates): owner or admin
    Input Hardening
- Validate IDs, strings; sanitize text fields where rendered in UI
  Transport
- CORS configured; suggest HTTPS in production

---

## Frontend (brief internals)

Structure

- `src/pages`: `Dashboard`, `BoardPage`, `Login`, `Register`
- `src/context/AuthContext.tsx`: stores user + token; attaches Authorization header via axios interceptor or per-call
- `@dnd-kit` used for DnD; recomputes `position` client-side

Routing

- `ProtectedRoute` guards authenticated pages; redirects to `Login` if no token

State

- Board data fetched via REST; live updates merged from Socket.IO events

---

## Seeding and Migrations

Migrations

- `npm run migrate` in `backend` (dev only) to create SQLite schema

Seed

- `npm run seed` populates sample data via `scripts/seed.js`

---

## Operational Considerations

Transactions

- For multi-entity operations (e.g., cascading deletes), consider wrapping in `prisma.$transaction` for atomicity

Pagination

- For large boards/activities, introduce `limit/offset` or cursor pagination

Indexing

- Add indexes on foreign keys (`boardId`, `listId`, `userId`) when moving beyond SQLite dev

Configuration

- Promote from SQLite to Postgres/MySQL for production and set `DATABASE_URL`

Logging

- Replace console logs with structured logger (pino/winston) and request IDs

Rate Limiting

- Add rate limiting (express-rate-limit) for auth and write-heavy routes

---

## Sequence Flows

Create Board (simplified)

1. Client → POST `/api/boards` { title }
2. Server: create workspace, board, default lists, owner member
3. Server → 201 Board
4. Client renders board; optionally `join-board` via socket

Move Card

1. Client computes new position and target listId
2. Client → PUT `/api/cards/:cardId` { listId, position }
3. Server updates card; logs `Activity`
4. Server (socket) emits `card-moved` to room `board:${boardId}`
5. Other clients update UI in real time

Add Comment

1. Client → POST `/api/cards/:cardId/comments` { text }
2. Server inserts comment; logs `Activity`
3. Server emits `new-comment` to room
4. Clients append comment

---

## Testing Strategy (future)

- Unit: validators, helpers
- Integration: route handlers with Supertest + SQLite in-memory
- E2E: Cypress/Playwright against dev server

---

## Open Items / Future Enhancements

- Full users/workspaces/search routes documentation
- Board invitations and email notifications
- File attachments on cards
- Checklists and labels
- Role-based policy abstraction per route
- Soft deletes and audit trails
