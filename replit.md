# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### TikTok Search (`artifacts/tiktok-search`)
- **Preview path**: `/`
- **Purpose**: Clean, distraction-free TikTok video search (no recommendations, no history)
- **Stack**: React + Vite + TailwindCSS, dark theme
- **Search**: Uses Brave Search API (`BRAVE_API_KEY` env var) to find TikTok videos
- **Features**: Video thumbnails, view/like counts, post date, one-click copy link button

### API Server (`artifacts/api-server`)
- **Preview path**: `/api`
- **Routes**:
  - `GET /api/healthz` — health check
  - `GET /api/tiktok/search?q=...&count=...` — TikTok video search via Brave API
