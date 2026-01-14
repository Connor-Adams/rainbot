# Button Components

This directory contains reusable Discord button components for the Rainbot music bot.

## Structure

```
components/
├── buttons/
│   ├── music/           # Music player control buttons
│   ├── pagination/      # Queue pagination buttons
│   └── confirmation/    # Confirmation dialog buttons
├── builders/            # Button builder utilities
├── __tests__/          # Component tests
└── index.ts            # Main exports
```

## Usage

### Music Control Buttons

Create interactive music player controls:

```typescript
import { createMusicControlRow, createBasicControlButtons } from './components';

// Using the full state-based approach
const row = createMusicControlRow({
  isPaused: false,
  hasQueue: true,
  queueLength: 10,
  canSkip: true,
  nowPlaying: 'Song Title',
});

// Or using the simpler backward-compatible approach
const row = createBasicControlButtons(isPaused, hasQueue);
```

### Pagination Buttons

Add pagination controls to queue displays:

```typescript
import { createPaginationRow, calculatePaginationState } from './components';

const state = calculatePaginationState(totalItems, itemsPerPage, currentPage);
const row = createPaginationRow(state, guildId);
```

### Confirmation Buttons

Create confirmation dialogs for destructive actions:

```typescript
import { createConfirmationRow, getConfirmationMessage } from './components';

const row = createConfirmationRow('clear_queue', guildId, userId);
const message = getConfirmationMessage('clear_queue');
```

### Button Builder Utilities

Create custom buttons with metadata:

```typescript
import { createButtonId, parseButtonId, createDangerButton } from './components';

// Create a button ID with metadata
const customId = createButtonId('action', {
  action: 'delete',
  guildId: '12345',
  itemId: '67890',
});

// Parse button ID to extract metadata
const { prefix, metadata } = parseButtonId(customId);

// Create styled buttons
const button = createDangerButton('delete_item', 'Delete', '🗑️');
```

## Button Handler System

The centralized button handler system manages all button interactions:

```typescript
import { registerButtonHandler } from '../apps/raincloud/handlers/buttonHandler';
import type { ButtonHandler } from '@rainbot/protocol';

// Define a handler
const myHandler: ButtonHandler = async (interaction, context) => {
  const { guildId, userId, metadata } = context;

  // Handle the button interaction
  await interaction.reply('Button clicked!');

  return { success: true };
};

// Register the handler
registerButtonHandler('my_button_prefix', myHandler);
```

## Button Styles

Buttons follow Discord's style guidelines:

- **Primary (Blurple)**: Main actions (Play, Resume)
- **Secondary (Gray)**: Navigation (Next, Previous, Pause)
- **Success (Green)**: Confirmations (Yes, Confirm)
- **Danger (Red)**: Destructive actions (Stop, Clear, Delete)
- **Link**: External resources

## Custom ID Format

Button custom IDs use a structured format for metadata:

```
prefix_key1:value1_key2:value2
```

Example: `queue_next_page:2_guildId:12345`

This allows:

- Easy parsing of button context
- Routing to appropriate handlers
- State management across interactions

## Testing

All button components have comprehensive tests:

```bash
npm test components/
npm test handlers/buttonHandler
```

## Integration

Button handlers are automatically initialized at bot startup in `index.js`:

```javascript
const { initializeButtonHandlers } = require('./dist/handlers/buttonRegistry');
initializeButtonHandlers();
```

Button interactions are handled in `events/buttonInteraction.js`.

## Best Practices

1. **Use the handler system**: Register all new button handlers via `registerButtonHandler()`
2. **Include metadata**: Embed necessary context in button custom IDs
3. **Handle errors gracefully**: Always catch and log errors in handlers
4. **Disable appropriately**: Disable buttons that aren't applicable (e.g., skip when queue is empty)
5. **Update state**: Update button states when interactions occur
6. **Test thoroughly**: Add tests for all new button components

## Examples

See the following files for complete examples:

- Music controls: `buttons/music/controlButtons.ts`
- Pagination: `buttons/pagination/paginationButtons.ts`
- Confirmations: `buttons/confirmation/confirmButtons.ts`
- Handler registration: `handlers/buttonRegistry.ts`
- Handler implementation: `handlers/musicButtonHandlers.ts`
