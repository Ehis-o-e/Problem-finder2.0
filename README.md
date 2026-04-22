# ProblemFinder 2.0

ProblemFinder 2.0 is a full-stack problem discovery tool that helps users find real-world pain points from Reddit discussions and explore them through an AI chat interface. The project is split into a TypeScript/Express backend and a React/Vite frontend.

## What it does

- Accepts a user query such as "problems in logistics" or "show me startup pain points in healthcare"
- Maps that query to relevant subreddits
- Fetches Reddit posts, filters noise, and classifies posts as usable problem statements
- Stores discovered problems in PostgreSQL with Prisma
- Lets users chat with an AI assistant about discovered problems
- Supports follow-up questions like exploring a specific numbered problem from a previous result list

## Monorepo structure

```text
ProblemFinder2.0/
|- problemFinder-be/        # Express + TypeScript + Prisma backend
|- problemFinder-fe/my-app/ # React + Vite frontend
```

## Tech stack

- Frontend: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons
- Backend: Node.js, Express 5, TypeScript, Prisma, PostgreSQL, Zod
- AI provider: Groq or OpenRouter
- External data source: Reddit

## Core flow

1. The frontend creates a conversation session.
2. The user sends a prompt.
3. The backend decides whether the prompt is a discovery request or a normal follow-up conversation.
4. For discovery, the backend parses the query, finds relevant subreddits, fetches Reddit posts, filters and classifies them, then stores reusable results.
5. The assistant returns a curated numbered list of problems and can continue discussing any selected item.

## Prerequisites

- Node.js 18+
- PostgreSQL
- A Reddit app for API credentials
- At least one AI API key:
  - `GROQ_API_KEY`, or
  - `OPENROUTER_API_KEY`

## Environment variables

The backend currently needs more variables than the checked-in `.env.example` shows.

### Backend: `problemFinder-be/.env`

```env
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/problemfinder_dev?schema=public"
PORT=5000
CORS_ORIGIN=http://localhost:5173

# AI
GROQ_API_KEY=
# or
OPENROUTER_API_KEY=

# Reddit
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=web:ProblemFinder2.0:1.0
```

### Frontend: `problemFinder-fe/my-app/.env`

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

If `VITE_API_BASE_URL` is not set, the frontend falls back to `/api/v1`.

## Installation

### Backend

```bash
cd problemFinder-be
npm install
npx prisma migrate deploy
npm run dev
```

For local schema changes during development:

```bash
npm run dev:migrate
```

### Frontend

```bash
cd problemFinder-fe/my-app
npm install
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`

## Useful backend scripts

Inside `problemFinder-be`:

- `npm run dev` - start backend in development
- `npm run build` - compile TypeScript
- `npm start` - run compiled backend
- `npm run dev:migrate` - create/apply development migration
- `npm run dev:migrate:deploy` - deploy development migrations
- `npm run dev:studio` - open Prisma Studio

## Main API routes

Base URL: `/api/v1`

### Health

- `GET /` - basic OK response
- `GET /live` - liveness check
- `GET /health` - health check with database connectivity

### Query parser

- `POST /query-parser`
  - body: `{ "query": "problems in logistics" }`

### Discovery

- `POST /discover`
  - body: `{ "query": "problems in logistics" }`

### Conversation

- `POST /conversation/session`
  - body: `{}` or `{ "problemId": "<uuid>" }`
- `POST /conversation/chat`
  - body: `{ "sessionId": "<uuid>", "message": "show me 3 logistics problems" }`
- `GET /conversation/history/:sessionId`

### AI chatbot legacy routes

- `POST /ai-chatbot/session`
- `POST /ai-chatbot/chat`
- `GET /ai-chatbot/history/:sessionId`

## Database

Prisma models currently include:

- `Problem`
- `User`
- `ChatSession`
- `ChatMessage`
- `Message`
- `ThreadMessage`
- `DirectMessage`
- `BuildInterest`
- `Notification`
- `Proposal`
- `ProposalComment`
- `ProposalInterest`

The README focuses on the discovery/chat parts of the app, but the schema already includes collaboration and messaging features that appear to be in progress.

## Current limitations

- Discovery currently depends on Reddit only. If Reddit is rate-limited, unavailable, or returns weak subreddit matches, result quality drops.
- Query parsing is heuristic. The category is derived from the top subreddit match, so ambiguous prompts can be routed to the wrong topic.
- Session pool state is stored in memory. If the backend restarts, the numbered discovery context for active sessions is lost even though chat messages remain in the database.
- The frontend chat list is client-side only. Refreshing the browser clears the visible sidebar chat history unless that state is rebuilt manually.
- The backend `.env.example` is incomplete right now. Reddit and AI credentials are required for full discovery/chat behavior but are not all documented there.
- `CORS_ORIGIN` in `.env.example` still points to `http://localhost:3000`, while the Vite frontend runs on `http://localhost:5173` by default.
- There is no full authentication flow wired into the current chat UI, so the main experience behaves like a guest session.
- There are test helper files in `src/test`, but no real automated test suite is configured under `npm test` yet.

## Suggested next improvements

- Expand `.env.example` so setup matches actual runtime requirements
- Persist session pool state in the database or cache layer
- Add automated tests for query parsing, discovery routing, and conversation behavior
- Support more data sources beyond Reddit
- Rehydrate frontend chat sessions after refresh
- Add authentication and user-specific saved discovery history

## Notes

- The frontend has its own generated Vite README in `problemFinder-fe/my-app/README.md`; this root README is the project-level documentation for the full monorepo.
- If you use `pnpm` instead of `npm`, the lockfiles suggest that workflow should also work.
