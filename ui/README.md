# Rainbot UI

React + TypeScript UI for the Rainbot Discord music bot dashboard.

## Project Structure

This follows the **monorepo pattern** - a best practice for full-stack applications:

```
rainbot/                    # Project root
├── ui/                     # Frontend (React + TypeScript)
│   ├── src/                # Source code
│   ├── dist/               # Build output (gitignored)
│   └── package.json        # Frontend dependencies
├── server/                 # Backend (Express)
├── commands/               # Discord bot commands
└── package.json            # Backend dependencies
```

**Why this structure?**
- ✅ Clear separation of concerns (frontend vs backend)
- ✅ Independent dependency management
- ✅ Can deploy frontend/backend separately if needed
- ✅ Follows industry best practices (Next.js, Create React App, etc. use similar patterns)
- ✅ Easy to understand and maintain

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **React Query** - Data fetching and caching
- **React Router** - Client-side routing
- **Zustand** - State management
- **Chart.js** - Statistics visualization
- **Tailwind CSS** - Styling (via CDN)

## Development

```bash
# Install dependencies
cd ui
npm install

# Start dev server (runs on port 5173, proxies API to localhost:3000)
npm run dev

# Build for production
npm run build
# Output: ui/dist/
```

## Production

The Express server automatically serves the React build from `ui/dist/`:

```bash
# From project root
npm run build:ui    # Build React app → ui/dist/
npm start           # Start Express server (serves ui/dist/)
```

## API Integration

All API calls are made through `src/lib/api.ts` using Axios. The Vite dev server proxies `/api` and `/auth` requests to `http://localhost:3000` (configured in `vite.config.ts`).

## State Management

- **Auth Store** (`stores/authStore.ts`) - Authentication state and user info
- **Guild Store** (`stores/guildStore.ts`) - Selected guild/server state

Both stores use Zustand with localStorage persistence.
