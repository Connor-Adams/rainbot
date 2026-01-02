# Select Menu Components

This directory contains Discord select menu (dropdown) components for the Rainbot music bot.

## Overview

Select menus provide an intuitive way for users to choose from predefined options without typing commands. They support multiple selection types and can handle complex interactions with validation and feedback.

## Structure

```
components/
├── select-menus/
│   └── string/              # String-based select menus
│       ├── filterMenu.ts    # Audio filter selection
│       └── repeatModeMenu.ts # Repeat mode selection
├── builders/
│   └── selectMenuBuilder.ts # Core builder utilities
└── __tests__/              # Component tests
```

## Usage

### Audio Filter Menu

Select audio filters to enhance playback:

```typescript
import { createFilterMenu } from './components/select-menus/string/filterMenu';

// Create filter menu with current filters marked as default
const menu = createFilterMenu(guildId, ['bassboost', 'nightcore']);

await interaction.reply({
  content: 'Choose audio filters:',
  components: [menu],
});
```

**Available Filters:**

- **None** - Clear all filters
- **Bass Boost** - Enhanced bass frequencies
- **Nightcore** - Higher pitch and tempo
- **Vaporwave** - Lower pitch and tempo
- **8D Audio** - Spatial audio effect

### Repeat Mode Menu

Configure repeat behavior:

```typescript
import { createRepeatModeMenu } from './components/select-menus/string/repeatModeMenu';

// Create menu with current mode selected
const menu = createRepeatModeMenu(guildId, 'track');

await interaction.reply({
  content: 'Select repeat mode:',
  components: [menu],
});
```

**Repeat Modes:**

- **Off** - No repeat, play queue once
- **Track** - Repeat current track
- **Queue** - Repeat entire queue

### Builder Utilities

Create custom select menus:

```typescript
import {
  createStringSelectMenu,
  createSelectMenuId,
  validateSelectMenuConfig,
} from './components/builders/selectMenuBuilder';

// Create custom ID with metadata
const customId = createSelectMenuId('my_menu', {
  guildId: '123',
  userId: '456',
});

// Create select menu
const menu = createStringSelectMenu(
  customId,
  'Choose an option',
  [
    { label: 'Option 1', value: 'opt1', emoji: '1️⃣' },
    { label: 'Option 2', value: 'opt2', emoji: '2️⃣' },
  ],
  { minValues: 1, maxValues: 2 }
);

// Validate configuration
const validation = validateSelectMenuConfig({
  minValues: 1,
  maxValues: 2,
  optionsCount: 2,
});
```

## Select Menu Handler System

The handler system manages all select menu interactions centrally.

### Registering Handlers

```typescript
import { registerSelectMenuHandler } from '../handlers/selectMenuHandler';
import type { SelectMenuHandler } from '../types/select-menus';

// Define handler
const myHandler: SelectMenuHandler = async (interaction, context) => {
  const { guildId, userId, metadata } = context;

  // Handle the interaction
  await interaction.reply('Selection received!');

  return { success: true };
};

// Register handler (called at startup)
registerSelectMenuHandler('my_menu', myHandler);
```

### Handler Context

Handlers receive:

- `interaction` - The Discord.js select menu interaction
- `context` - Parsed context including:
  - `guildId` - Server ID
  - `userId` - User who interacted
  - `channelId` - Channel ID
  - `metadata` - Additional data from custom ID

### Handler Result

Handlers return:

```typescript
{
  success: boolean;
  error?: string;      // Error message if failed
  data?: unknown;      // Optional result data
}
```

## Commands Using Select Menus

### `/filter` Command

Displays audio filter selection menu:

```
/filter
```

Users can select up to 3 filters or choose "None" to clear all.

### `/settings` Command

Shows server settings with repeat mode selection:

```
/settings
```

Displays current settings and allows configuration via select menus.

## Custom ID Format

Select menu custom IDs use structured format for metadata:

```
prefix_key1:value1_key2:value2
```

**Examples:**

- `audio_filter_guildId:123456`
- `repeat_mode_guildId:123_userId:789`

**Parsing:**

```typescript
import { parseSelectMenuId } from './components/builders/selectMenuBuilder';

const { prefix, metadata } = parseSelectMenuId(customId);
// prefix: 'audio_filter'
// metadata: { action: 'audio_filter', guildId: '123456' }
```

## Validation

### Filter Validation

```typescript
import { validateFilterSelection } from './components/select-menus/string/filterMenu';

const result = validateFilterSelection(['bassboost', 'nightcore']);
if (result.valid) {
  // Apply filters: result.filters
} else {
  // Show error: result.error
}
```

**Rules:**

- Cannot select "None" with other filters
- Maximum 3 filters at once
- Must be valid filter values

### Repeat Mode Validation

```typescript
import { validateRepeatMode } from './components/select-menus/string/repeatModeMenu';

const result = validateRepeatMode('track');
if (result.valid) {
  // Apply mode: result.mode
}
```

**Rules:**

- Must be one of: 'off', 'track', 'queue'
- Single selection only

### Configuration Validation

```typescript
import { validateSelectMenuConfig } from './components/builders/selectMenuBuilder';

const result = validateSelectMenuConfig({
  minValues: 0,
  maxValues: 3,
  optionsCount: 5,
});
// result.valid: true/false
// result.error: error message if invalid
```

**Discord Limits:**

- Min values: 0-25
- Max values: 1-25
- Max options: 25
- minValues ≤ maxValues
- maxValues ≤ optionsCount

## Testing

Comprehensive test suite with 63 tests:

```bash
# Run all select menu tests
npm test -- --testPathPattern="select|filter|repeat"

# Run specific test suite
npm test -- components/__tests__/filterMenu.test.ts
npm test -- handlers/__tests__/selectMenuHandler.test.ts
```

**Test Coverage:**

- ✅ Builder utilities (19 tests)
- ✅ Handler registration (15 tests)
- ✅ Filter menu components (17 tests)
- ✅ Repeat mode components (12 tests)

## Type Safety

Full TypeScript support with type definitions:

```typescript
import type {
  SelectMenuHandler,
  SelectMenuContext,
  SelectMenuHandlerResult,
  AudioFilter,
  RepeatMode,
  SelectMenuOption,
} from '../types/select-menus';
```

## Integration

Select menu handlers are automatically initialized at bot startup:

```javascript
// index.js
const { initializeSelectMenuHandlers } = require('./dist/handlers/selectMenuRegistry');
initializeSelectMenuHandlers();
```

Interactions are handled in `events/interactionCreate.js`:

```javascript
if (interaction.isAnySelectMenu()) {
  const result = await handleSelectMenuInteraction(interaction);
  // Track statistics, log results
}
```

## Best Practices

1. **Use Structured IDs**: Always include necessary context in custom IDs
2. **Validate Input**: Validate selections before applying changes
3. **Provide Feedback**: Send confirmation messages after selections
4. **Use Ephemeral Replies**: Keep settings changes private
5. **Mark Defaults**: Show current selections as default options
6. **Add Descriptions**: Help users understand each option
7. **Include Emojis**: Visual indicators improve UX
8. **Handle Errors**: Gracefully handle validation failures

## Future Enhancements

Potential additions:

- User select menus (DJ assignment, permissions)
- Role select menus (DJ roles, allowed roles)
- Channel select menus (default channels, logging)
- Playlist selection menu
- Audio quality selection
- Volume presets
- Queue sorting options

## Examples

See implementation in:

- `commands/voice/filter.js` - Filter command
- `commands/voice/settings.js` - Settings command
- `handlers/filterMenuHandler.ts` - Filter handler
- `handlers/repeatModeHandler.ts` - Repeat mode handler
