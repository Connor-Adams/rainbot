# Testing the Button Components Implementation

This guide explains how to test the newly implemented button components.

## Prerequisites

1. Bot must be running with compiled TypeScript:

   ```bash
   npm run build:ts
   node index.js
   ```

2. Bot must be invited to a Discord server
3. You must be in a voice channel

## Unit Tests

### Running All Tests

```bash
npm test
```

### Running Specific Test Suites

```bash
# Button builder tests
npm test components/__tests__/buttonBuilder.test.ts

# Music control button tests
npm test components/__tests__/controlButtons.test.ts

# Pagination button tests
npm test components/__tests__/paginationButtons.test.ts

# Button handler system tests
npm test handlers/__tests__/buttonHandler.test.ts
```

### Expected Test Results

All tests should pass:

- ✓ Button builder tests (25+ assertions)
- ✓ Music control tests (15+ assertions)
- ✓ Pagination tests (20+ assertions)
- ✓ Handler system tests (15+ assertions)

## Integration Testing

### 1. Test Music Control Buttons

#### Setup

1. Join a voice channel
2. Use `/join` to bring the bot to your channel
3. Use `/play <song name>` to start playing music

#### Test Play/Pause Button

```
1. Use /np to show now playing card with buttons
2. Click [⏸️ Pause] button
   Expected: Button changes to [▶️ Resume] (green)
   Expected: Embed title changes to "⏸️ Paused"
   Expected: Music pauses

3. Click [▶️ Resume] button
   Expected: Button changes to [⏸️ Pause] (gray)
   Expected: Embed title changes to "🎵 Now Playing"
   Expected: Music resumes
```

#### Test Skip Button

```
1. Add multiple songs to queue: /play <song 1>, /play <song 2>
2. Use /np
3. Click [⏭️ Skip] button
   Expected: Embed updates showing next song
   Expected: Next song starts playing
   Expected: Skip button remains enabled if queue not empty

4. Skip until queue is empty
   Expected: Skip button becomes disabled (grayed out)
```

#### Test Stop Button

```
1. Play music with queue
2. Use /np
3. Click [⏹️ Stop] button
   Expected: Message updates to show "⏹️ Stopped"
   Expected: All buttons disappear
   Expected: Music stops completely
   Expected: Queue is cleared
```

#### Test Queue Button

```
1. Add songs to queue
2. Use /np
3. Click [📋 View Queue] button
   Expected: Ephemeral message appears (only you see it)
   Expected: Shows current track and queue
   Expected: Original message unchanged
```

### 2. Test Pagination Buttons

#### Setup Small Queue (No Pagination)

```
1. Add 1-20 songs to queue
2. Use /queue
   Expected: No pagination buttons
   Expected: All songs shown on one page
```

#### Setup Large Queue (With Pagination)

```
1. Use /play <playlist url> with 40+ songs
2. Use /queue
   Expected: Shows first 20 tracks
   Expected: Shows "(Page 1/3)" or similar
   Expected: Pagination buttons appear
```

#### Test Next Page Button

```
1. Use /queue on large queue
2. Click [▶️ Next] button
   Expected: Message updates to page 2
   Expected: Shows tracks 21-40
   Expected: Previous button becomes enabled
   Expected: Page indicator updates to "Page 2/X"
```

#### Test Previous Page Button

```
1. Navigate to page 2 or later
2. Click [◀️ Previous] button
   Expected: Message updates to previous page
   Expected: Previous page tracks shown
   Expected: Page indicator updates
```

#### Test First Page Button

```
1. Navigate to middle page
2. Click [⏮️ First] button
   Expected: Jumps to page 1
   Expected: Shows tracks 1-20
   Expected: First and Previous buttons become disabled
```

#### Test Last Page Button

```
1. On first page
2. Click [⏭️ Last] button
   Expected: Jumps to last page
   Expected: Shows remaining tracks
   Expected: Next and Last buttons become disabled
```

#### Test Page Boundary Handling

```
1. On first page
   Expected: First and Previous buttons are disabled

2. On last page
   Expected: Next and Last buttons are disabled

3. On middle page
   Expected: All buttons are enabled
```

#### Test Direct Page Access

```
1. Use /queue page:2
   Expected: Opens directly to page 2
   Expected: Pagination buttons work from there

2. Use /queue page:999 (invalid high page)
   Expected: Shows last available page
   Expected: No error
```

### 3. Test Confirmation Buttons

#### Test Clear Command with Small Queue

```
1. Add 1-3 songs to queue
2. Use /clear
   Expected: Clears immediately without confirmation
   Expected: Success message appears
```

#### Test Clear Command with Large Queue

```
1. Add 10+ songs to queue
2. Use /clear
   Expected: Confirmation dialog appears (ephemeral)
   Expected: Shows track count
   Expected: Shows [✅ Confirm] and [❌ Cancel] buttons

3. Click [✅ Confirm]
   Expected: Message updates to "Cleared X tracks"
   Expected: Queue is actually cleared
   Expected: Current track keeps playing

4. Click [❌ Cancel]
   Expected: Message updates to "Cancelled"
   Expected: Queue remains unchanged
```

#### Test Clear with Confirmation Skip

```
1. Add many songs to queue
2. Use /clear confirm:true
   Expected: Clears immediately without confirmation dialog
   Expected: Success message appears
```

#### Test Unauthorized User Access

```
1. User A uses /clear (shows confirmation)
2. User B tries to click [✅ Confirm]
   Expected: User B sees "This confirmation is not for you!"
   Expected: Original confirmation remains for User A
   Expected: Queue not cleared
```

## Error Condition Testing

### Test Bot Not in Voice Channel

```
1. Bot is not in voice channel
2. Try to use /play, /np, /queue
   Expected: Error message appears
   Expected: No buttons shown (appropriate)
```

### Test User Not in Voice Channel

```
1. Bot is in voice channel
2. You leave voice channel
3. Try to click control buttons
   Expected: Appropriate error handling
   Expected: May show "Please join voice channel" type message
```

### Test Queue Changes During Interaction

```
1. Open /queue on page 2
2. Another user clears queue
3. Click pagination button
   Expected: Graceful handling (shows empty or adjusted pages)
   Expected: No crash or error
```

### Test Multiple Rapid Button Clicks

```
1. Click pause/resume rapidly several times
   Expected: Bot handles gracefully
   Expected: Final state is consistent
   Expected: No race conditions or crashes
```

### Test Concurrent Users

```
1. User A clicks pause
2. User B clicks pause simultaneously
   Expected: Both operations processed
   Expected: Final state is consistent
   Expected: Both see updated buttons
```

## Performance Testing

### Button Response Time

```
Measure time from button click to UI update:
- Target: < 1 second for music controls
- Target: < 2 seconds for queue pagination
- Target: < 1 second for confirmations

Test with:
- Small queue (1-20 tracks)
- Medium queue (21-100 tracks)
- Large queue (100+ tracks)
```

### Memory Usage

```
Monitor bot memory during:
1. Creating many button components
2. Handling many button clicks
3. Multiple guilds using buttons simultaneously

Expected: No memory leaks or unusual growth
```

## Edge Cases

### Empty Queue

```
1. Clear all tracks
2. Use /np or /queue
   Expected: Appropriate empty state message
   Expected: Skip button disabled
   Expected: Stop button still works (stops current track)
```

### Single Track

```
1. Play only one track
2. Check button states
   Expected: Skip button disabled (no queue)
   Expected: Pause/stop buttons work
```

### Very Long Queue

```
1. Add 200+ tracks
2. Test pagination
   Expected: Handles correctly
   Expected: Page indicator shows correct total
   Expected: Can navigate to last page
   Expected: Performance acceptable
```

### Bot Restart During Interaction

```
1. Open message with buttons
2. Restart bot
3. Try to click buttons
   Expected: Discord shows "Interaction failed" (normal)
   Expected: Bot doesn't crash on restart
   Expected: New interactions work normally
```

### Network Latency

```
Test with high latency connection:
1. Click buttons
2. Check for timeout errors
   Expected: Reasonable timeout handling
   Expected: User feedback on delays
```

## Regression Testing

### Existing Features Still Work

```
Verify these unchanged features work:
- /join command
- /leave command
- /play command
- /np command (with new buttons)
- /queue command (with new pagination)
- /pause command (slash command, not button)
- /skip command (slash command, not button)
- /stop command (slash command, not button)
- /vol command
- Resume/dismiss buttons (existing)
```

### Statistics Tracking

```
1. Click various buttons
2. Check logs for statistics tracking
   Expected: Button interactions logged
   Expected: Success/failure tracked
   Expected: Metadata captured
```

## Troubleshooting

### Buttons Not Appearing

```
Check:
- Bot has necessary permissions (Send Messages, Embed Links)
- TypeScript compiled (npm run build:ts)
- Button handlers registered (check logs for "Registering button handlers")
- No errors in console during button creation
```

### Buttons Not Responding

```
Check:
- Button handlers registered (check logs)
- Bot has respond to interactions permission
- No errors in button handler logs
- Guild ID available in button context
```

### Pagination Not Working

```
Check:
- Queue has more than 20 tracks
- Pagination handlers registered
- Custom IDs include page metadata
- No errors during page navigation
```

### Confirmation Not Showing

```
Check:
- Queue has more than 3 tracks (threshold)
- confirm:false not set on command
- Confirmation button components compiled
- Handlers registered
```

## Test Checklist

Use this checklist for full validation:

### Music Controls

- [ ] Pause button works and updates state
- [ ] Resume button works and updates state
- [ ] Skip button works when queue exists
- [ ] Skip button disabled when queue empty
- [ ] Stop button works and clears queue
- [ ] Queue button shows ephemeral message
- [ ] Buttons update in real-time
- [ ] Multiple users can interact

### Pagination

- [ ] Pagination appears for large queues (20+)
- [ ] Next button works
- [ ] Previous button works
- [ ] First button works
- [ ] Last button works
- [ ] Page indicator accurate
- [ ] Direct page access works (/queue page:N)
- [ ] Boundaries handled (first/last page)
- [ ] No pagination for small queues

### Confirmation

- [ ] Confirmation shows for large clear (>3)
- [ ] Confirmation skipped for small clear (≤3)
- [ ] Confirm button works
- [ ] Cancel button works
- [ ] User authorization enforced
- [ ] Skip confirmation flag works (confirm:true)

### Error Handling

- [ ] Bot not in channel handled
- [ ] User not authorized handled
- [ ] Empty queue handled
- [ ] Outdated interaction handled gracefully
- [ ] Concurrent clicks handled

### Integration

- [ ] Works with existing slash commands
- [ ] Statistics tracked correctly
- [ ] Logs show button interactions
- [ ] No breaking changes to existing features
- [ ] TypeScript compiles without errors

### Performance

- [ ] Response time < 3 seconds
- [ ] No memory leaks
- [ ] Handles large queues efficiently
- [ ] Multiple guilds work simultaneously

## Success Criteria

Implementation is successful if:

1. ✅ All unit tests pass
2. ✅ All integration tests pass
3. ✅ No errors in bot logs during testing
4. ✅ Buttons respond within acceptable time
5. ✅ No breaking changes to existing features
6. ✅ User experience is smooth and intuitive
7. ✅ Error handling is graceful
8. ✅ Documentation is complete

## Reporting Issues

If you find issues, report:

1. What you were testing
2. What you expected
3. What actually happened
4. Error messages (if any)
5. Bot logs during the issue
6. Steps to reproduce

Example:

```
Issue: Skip button doesn't update
Testing: Clicking skip button on /np
Expected: Message updates with next song
Actual: Button clicked but nothing happens
Error: None visible
Logs: [paste relevant logs]
Steps: 1) /play song1, 2) /play song2, 3) /np, 4) Click skip
```
