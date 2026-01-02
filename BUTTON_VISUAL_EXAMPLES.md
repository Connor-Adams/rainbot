# Button Components Visual Examples

This document shows how the implemented button components appear in Discord.

## Music Player Controls

### Now Playing with Controls

**When Playing:**
```
🎵 Now Playing
━━━━━━━━━━━━━━━━━━
Song Name - Artist Name
2:34 / 3:45

📋 Queue — 5 tracks
01 Next Song • 3:21
02 Another Track • 4:12
03 Third Song • 2:45
...and 2 more

▶️ Playing • General Voice • Use /play to add tracks

[⏸️ Pause] [⏭️ Skip] [⏹️ Stop] [📋 View Queue]
 Secondary   Secondary   Danger    Secondary
```

**When Paused:**
```
⏸️ Paused
━━━━━━━━━━━━━━━━━━
Song Name - Artist Name
1:23 / 3:45

📋 Queue — 5 tracks
01 Next Song • 3:21
02 Another Track • 4:12
...

⏸️ Paused • General Voice

[▶️ Resume] [⏭️ Skip] [⏹️ Stop] [📋 View Queue]
  Success    Secondary   Danger    Secondary
   (Green)
```

**With Empty Queue:**
```
🎵 Now Playing
━━━━━━━━━━━━━━━━━━
Last Song Playing
1:02 / 2:15

📋 Queue
Queue is empty

▶️ Playing • General Voice

[⏸️ Pause] [⏭️ Skip] [⏹️ Stop] [📋 View Queue]
 Secondary   Disabled    Danger    Secondary
              (Gray)
```

## Queue Pagination

### Queue Command with Pagination

**Page 1 of 3:**
```
🎵 Music Queue
━━━━━━━━━━━━━━━━━━
Current Song Playing
2:15 / 3:30

📋 Up Next — 45 tracks (Page 1/3)
01 Track Name • 3:21
02 Another Song • 4:12
03 Third Track • 2:45
...
20 Twentieth Song • 3:33

Total: 45 tracks in queue • General Voice

[⏮️ First] [◀️ Previous] [📄 Page 1/3] [▶️ Next] [⏭️ Last]
 Disabled    Disabled      Disabled      Secondary  Secondary
             (Can't go back)            (Can go forward)
```

**Page 2 of 3:**
```
🎵 Music Queue
━━━━━━━━━━━━━━━━━━
Current Song Playing
2:15 / 3:30

📋 Up Next — 45 tracks (Page 2/3)
21 Twenty-First Song • 3:21
22 Twenty-Second Song • 4:12
...
40 Fortieth Song • 3:33

Total: 45 tracks in queue • General Voice

[⏮️ First] [◀️ Previous] [📄 Page 2/3] [▶️ Next] [⏭️ Last]
 Secondary   Secondary     Disabled     Secondary  Secondary
           (Both directions available)
```

**Small Queue (No Pagination):**
```
🎵 Music Queue
━━━━━━━━━━━━━━━━━━
Current Song Playing

📋 Up Next — 5 tracks
01 Next Song • 3:21
02 Another Track • 4:12
03 Third Song • 2:45
04 Fourth Song • 3:15
05 Fifth Song • 2:30

Total: 5 tracks in queue

(No pagination buttons - queue fits on one page)
```

## Confirmation Dialogs

### Clear Queue Confirmation

```
⚠️ You are about to clear 25 tracks from the queue.

This action cannot be undone. Are you sure?

💡 Tip: Use `/clear confirm:true` to skip this confirmation.

[✅ Confirm] [❌ Cancel]
   Success     Danger
   (Green)     (Red)
```

**After Confirming:**
```
🗑️ Cleared 25 tracks from the queue.

▶️ Still playing: Current Song Name
```

**After Cancelling:**
```
❌ Cancelled.
```

### Stop Playback Confirmation (Future Enhancement)

```
⚠️ Are you sure you want to stop playback and clear the queue?

[⚠️ Yes, Proceed] [❌ Cancel]
      Danger       Secondary
      (Red)
```

## Button States and Styles

### Button Style Guide

| Style | Color | Use Case | Example |
|-------|-------|----------|---------|
| **Primary** | Blurple | Main actions | Play (future) |
| **Secondary** | Gray | Navigation, default actions | Pause, Skip, Previous, Next |
| **Success** | Green | Positive actions | Resume, Confirm |
| **Danger** | Red | Destructive actions | Stop, Clear, Delete |
| **Link** | Blue link | External URLs | (Future use) |

### State Examples

**Enabled Button:**
```
[▶️ Resume]
  Success
  (Clickable)
```

**Disabled Button:**
```
[⏭️ Skip]
  Secondary
  (Grayed out, not clickable)
```

**Loading State (Future):**
```
[⏳ Loading...]
   Secondary
   (Disabled during operation)
```

## Button Custom IDs

### Format Structure
```
prefix_key1:value1_key2:value2
```

### Real Examples

1. **Simple Action:**
   ```
   player_pause
   ```

2. **With Guild Context:**
   ```
   queue_next_page:2_guildId:123456789
   ```

3. **With User Authorization:**
   ```
   confirm_action:clear_queue_guildId:123456_userId:987654
   ```

4. **Full Pagination:**
   ```
   queue_first_page:0_guildId:123456789
   queue_prev_page:1_guildId:123456789
   queue_next_page:3_guildId:123456789
   queue_last_page:4_guildId:123456789
   ```

## User Interaction Flow

### Playing Music
```
User: /play never gonna give you up

Bot: 🎵 Now Playing
     Rick Astley - Never Gonna Give You Up
     0:00 / 3:32
     
     📋 Queue
     Queue is empty
     
     [⏸️ Pause] [⏭️ Skip] [⏹️ Stop] [📋 View Queue]

User: *clicks Pause button*

Bot: ⏸️ Paused
     Rick Astley - Never Gonna Give You Up
     1:23 / 3:32
     
     [▶️ Resume] [⏭️ Skip] [⏹️ Stop] [📋 View Queue]

User: *clicks Resume button*

Bot: 🎵 Now Playing
     Rick Astley - Never Gonna Give You Up
     1:23 / 3:32
     
     [⏸️ Pause] [⏭️ Skip] [⏹️ Stop] [📋 View Queue]
```

### Navigating Queue
```
User: /queue

Bot: 🎵 Music Queue
     Current Song
     
     📋 Up Next — 45 tracks (Page 1/3)
     01-20 [tracks listed]
     
     [⏮️ First] [◀️ Previous] [📄 Page 1/3] [▶️ Next] [⏭️ Last]

User: *clicks Next button*

Bot: [Updates to Page 2]
     📋 Up Next — 45 tracks (Page 2/3)
     21-40 [tracks listed]
     
     [⏮️ First] [◀️ Previous] [📄 Page 2/3] [▶️ Next] [⏭️ Last]

User: *clicks Last button*

Bot: [Updates to Page 3]
     📋 Up Next — 45 tracks (Page 3/3)
     41-45 [tracks listed]
     
     [⏮️ First] [◀️ Previous] [📄 Page 3/3] [▶️ Next] [⏭️ Last]
```

### Clearing Queue with Confirmation
```
User: /clear

Bot: ⚠️ You are about to clear 25 tracks from the queue.
     
     This action cannot be undone. Are you sure?
     
     💡 Tip: Use `/clear confirm:true` to skip this confirmation.
     
     [✅ Confirm] [❌ Cancel]

User: *clicks Confirm button*

Bot: 🗑️ Cleared 25 tracks from the queue.
     
     ▶️ Still playing: Current Song Name
```

## Error Handling Examples

### Bot Not in Voice Channel
```
User: *clicks Pause button*

Bot: ❌ I'm not in a voice channel!
     (Ephemeral message - only visible to user)
```

### Unauthorized User
```
User A: /clear
Bot: [Shows confirmation with buttons]

User B: *tries to click Confirm*
Bot: ❌ This confirmation is not for you!
     (Ephemeral - only User B sees this)
```

### Outdated Interaction
```
[After 15 minutes of inactivity]

User: *clicks button*

Discord: This interaction failed
         (Standard Discord error for expired interactions)
```

## Button Layout Rules

### Single Row (Used by Music Controls)
```
Maximum 5 buttons per row:
[Button 1] [Button 2] [Button 3] [Button 4] [Button 5]
```

### Multiple Rows (Possible Future Enhancement)
```
Row 1: [⏸️ Pause] [⏭️ Skip] [⏹️ Stop] [📋 Queue]
Row 2: [🔉 Vol-] [🔊 Volume: 100%] [🔊 Vol+]
```

### Pagination (Full Mode)
```
5 buttons when totalPages > 2:
[⏮️ First] [◀️ Previous] [📄 Page X/Y] [▶️ Next] [⏭️ Last]

3 buttons when totalPages <= 2:
[◀️ Previous] [📄 Page X/Y] [▶️ Next]
```

## Implementation Notes

### Button Persistence
- Buttons are attached to messages
- State updates require message editing
- Button collectors not used (stateless design)
- Each click fetches current state fresh

### Rate Limiting
- Discord enforces interaction rate limits
- Spamming buttons may trigger cooldowns
- Bot handles rate limit errors gracefully

### Mobile Considerations
- Buttons work on mobile Discord
- Touch-friendly size (automatic)
- Emoji clearly visible
- Labels are concise

### Accessibility
- Emoji + text labels for clarity
- Color coding follows conventions
- Disabled state is obvious
- Screen reader friendly
