# UI Architecture and Component Guidelines

## Overview

This document outlines the architecture, design decisions, and conventions for the Rainbot dashboard UI. The UI is built with React, Vite, TypeScript, and Tailwind CSS following modern best practices for clean, maintainable, and accessible code.

## Technology Stack

### Core

- **React 19.2**: Component-based UI library
- **TypeScript 5.9**: Static typing for improved developer experience
- **Vite 7.2**: Fast build tool and dev server
- **Tailwind CSS 3.x**: Utility-first CSS framework with build-time processing

### State & Data

- **Zustand**: Lightweight state management
- **React Query (@tanstack/react-query)**: Server state management and caching
- **React Router DOM**: Client-side routing

### Additional

- **Chart.js + react-chartjs-2**: Data visualization
- **Axios**: HTTP client

## Design System

### Color Palette

We use semantic color tokens defined in `tailwind.config.js`:

#### Primary Colors

- `primary` - Main brand color (blue)
- `secondary` - Secondary accent (violet)
- `accent` - Tertiary accent (pink)

#### Surface Colors

- `surface` - Card backgrounds (#131318)
- `surface-elevated` - Elevated elements (#181820)
- `surface-hover` - Hover states (#1c1c24)
- `surface-input` - Form inputs (#0f0f14)
- `background` - Page background (#0a0a0f)

#### Text Colors

- `text-primary` - Primary text (white)
- `text-secondary` - Secondary text (#a1a1b0)
- `text-muted` - Muted text (#6b6b7a)
- `text-disabled` - Disabled text (#4a4a55)

#### Semantic Colors

- `success` - Success states (emerald)
- `danger` - Error/danger states (red)
- `warning` - Warning states (amber)
- `info` - Info states (cyan)

Each semantic color has `DEFAULT`, `light`, and `glow` variants.

### Typography

- **Primary font**: Outfit (sans-serif) - Clean, modern
- **Monospace font**: JetBrains Mono - For code/data display

### Spacing Scale

Tailwind's default spacing scale is used throughout (0.25rem increments).

## Project Structure

```
ui/src/
├── components/
│   ├── ui/                  # Primitive UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Badge.tsx
│   │   └── index.tsx
│   ├── icons/               # Icon components
│   │   └── index.tsx
│   ├── common/              # Shared presentational components
│   │   ├── EmptyState.tsx
│   │   └── ListItem.tsx
│   ├── header/              # Header subcomponents
│   │   ├── Logo.tsx
│   │   ├── NavTabs.tsx
│   │   ├── StatusIndicator.tsx
│   │   └── UserInfo.tsx
│   ├── queue/               # Queue-related components
│   │   └── QueueItem.tsx
│   ├── soundboard/          # Soundboard features
│   ├── stats/               # Statistics features
│   ├── tabs/                # Tab content components
│   ├── Header.tsx           # Main header
│   ├── Sidebar.tsx          # Main sidebar
│   ├── ConnectionsList.tsx
│   ├── ServersList.tsx
│   └── QueueList.tsx
├── pages/
│   ├── LoginPage.tsx
│   └── DashboardPage.tsx
├── hooks/                   # Custom React hooks
├── stores/                  # Zustand state stores
├── lib/                     # Utilities and helpers
├── types/                   # TypeScript type definitions
├── App.tsx
├── main.tsx
└── index.css
```

## Component Architecture

### Component Categories

#### 1. UI Primitives (`components/ui/`)

Reusable, low-level components that form the foundation of the UI:

- **Button**: Primary, secondary, danger, and ghost variants
- **Card**: Container with header, title, and content sections
- **Input**: Form input with error states
- **Badge**: Status/count indicators

**Characteristics**:

- Highly reusable
- Accept standard HTML props via rest spread
- Use `forwardRef` for ref forwarding
- Styled entirely with Tailwind classes
- Minimal to no business logic

**Example**:

```tsx
<Button variant="primary" size="lg" icon={<DiscordIcon />} onClick={handleLogin}>
  Login
</Button>
```

#### 2. Common Components (`components/common/`)

Mid-level presentational components used across features:

- **EmptyState**: Consistent empty state UI
- **ListItem**: Reusable list item with icon, title, subtitle

**Characteristics**:

- Composable from UI primitives
- No direct API calls or complex state
- Accept data as props

#### 3. Feature Components

Higher-level components with business logic:

- Data fetching with React Query
- Local state management
- Event handlers
- Composed from lower-level components

**Example**: `ConnectionsList`, `QueueList`

#### 4. Page Components (`pages/`)

Top-level route components that orchestrate features

### Composition Over Inheritance

Components are built by composition rather than inheritance:

❌ **Avoid**: Large monolithic components

```tsx
function Dashboard() {
  // 500 lines of JSX
  return <div>...</div>;
}
```

✅ **Prefer**: Small, focused components

```tsx
function Dashboard() {
  return (
    <Layout>
      <Sidebar />
      <MainContent />
    </Layout>
  );
}
```

### Props and TypeScript

All components use TypeScript interfaces for props:

```tsx
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}
```

Use `type` imports for type-only imports:

```tsx
import type { User } from '@/types';
```

## Styling Conventions

### Tailwind Usage

1. **Use Tailwind utility classes** for all styling
2. **Extract common patterns** into reusable components (not CSS classes)
3. **Use Tailwind config** for custom values (colors, animations, etc.)
4. **Avoid inline styles** except for dynamic values (like animation delays)

### Responsive Design

Use Tailwind's responsive prefixes:

```tsx
className = 'flex-col md:flex-row lg:gap-8';
```

Standard breakpoints:

- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px

### Dark Mode

The UI is dark mode only. All colors are defined for dark backgrounds.

## Icon Management

### Icon Components

Icons are implemented as React components in `components/icons/index.tsx`:

```tsx
export function PlayIcon({ size = 24, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      {...props}
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
```

### Guidelines

❌ **Never** define SVGs inline in components:

```tsx
// Bad
<svg viewBox="0 0 24 24">...</svg>
```

✅ **Always** use icon components:

```tsx
// Good
import { PlayIcon } from '@/components/icons';
<PlayIcon size={20} />;
```

## State Management

### Local State

Use `useState` for component-specific state:

```tsx
const [isOpen, setIsOpen] = useState(false);
```

### Global State (Zustand)

For app-wide state (user auth, selected guild):

```tsx
// stores/authStore.ts
export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  login: (user) => set({ user }),
  logout: () => set({ user: null }),
}));

// In component
const { user, logout } = useAuthStore();
```

### Server State (React Query)

For data fetched from APIs:

```tsx
const { data: status } = useQuery({
  queryKey: ['bot-status'],
  queryFn: () => botApi.getStatus().then((res) => res.data),
  refetchInterval: 5000,
});
```

## Custom Hooks

Extract reusable logic into custom hooks:

```tsx
function usePlayback(guildId: string) {
  const playMutation = useMutation({
    mutationFn: (source: string) => playbackApi.play(guildId, source),
  });

  return { play: playMutation.mutate, isPlaying: playMutation.isPending };
}
```

## Accessibility

### ARIA Labels

Always provide labels for interactive elements:

```tsx
<Button aria-label="Remove from queue">
  <XIcon />
</Button>
```

### Semantic HTML

Use appropriate HTML elements:

```tsx
// Good
<nav>
  <button>Tab 1</button>
</nav>

// Bad
<div>
  <div onClick={...}>Tab 1</div>
</div>
```

### Keyboard Navigation

- All interactive elements should be keyboard accessible
- Use native elements when possible (`<button>`, `<a>`, etc.)
- Focus states are included in UI primitives

## Performance

### Code Splitting

Large feature components can be lazy loaded:

```tsx
const StatisticsTab = lazy(() => import('./tabs/stats/StatisticsTab'));
```

### Memoization

Use React.memo for expensive components that receive stable props:

```tsx
export default memo(ExpensiveComponent);
```

### React Query Caching

Leverage React Query's caching for API data:

```tsx
const { data } = useQuery({
  queryKey: ['key'],
  queryFn: fetchData,
  staleTime: 5000, // Data stays fresh for 5s
  refetchInterval: 10000, // Auto-refetch every 10s
});
```

## Testing

Currently, there is no test infrastructure for the UI. When adding tests:

1. Use Jest + React Testing Library
2. Test user interactions, not implementation details
3. Focus on critical paths (auth flow, playback controls)

## Build and Development

### Development

```bash
cd ui
npm run dev
```

### Production Build

```bash
cd ui
npm run build
```

### Linting

```bash
cd ui
npm run lint
```

## Migration Checklist

When refactoring existing components:

- [ ] Extract inline SVGs to icon components
- [ ] Replace CSS classes with Tailwind utilities
- [ ] Split large components into smaller subcomponents
- [ ] Use UI primitives (Button, Card, etc.) instead of custom markup
- [ ] Add TypeScript types for all props
- [ ] Ensure accessibility (ARIA labels, semantic HTML)
- [ ] Test responsive behavior
- [ ] Verify build passes

## Future Improvements

1. **Form library**: Add React Hook Form for complex forms
2. **Animation library**: Consider Framer Motion for complex animations
3. **Toast notifications**: Implement global toast system
4. **Theme system**: Support light/dark mode toggle
5. **Component library**: Consider Radix UI or Headless UI for complex primitives
6. **Testing**: Add comprehensive test coverage
7. **Storybook**: Document components visually

## Resources

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [React Query Documentation](https://tanstack.com/query/latest)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
