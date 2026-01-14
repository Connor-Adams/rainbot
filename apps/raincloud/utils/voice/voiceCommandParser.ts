/**
 * Voice Command Parser - Parse natural language into music commands
 */

import type { ParsedVoiceCommand, VoiceCommandType } from '@rainbot/protocol';
import { createLogger } from '../logger';

const log = createLogger('VOICE_PARSER');

/**
 * Command patterns for matching voice input
 */
const COMMAND_PATTERNS: Array<{
  type: VoiceCommandType;
  patterns: RegExp[];
  extractor?: (match: RegExpMatchArray, fullText: string) => ParsedVoiceCommand;
}> = [
  {
    type: 'play',
    patterns: [
      /^(?:play|queue|add)\s+(.+?)(?:\s+by\s+(.+?))?$/i,
      /^(?:can you |please )?play\s+(.+)$/i,
      /^(?:put on|start playing|start)\s+(.+)$/i,
    ],
    extractor: (match, fullText) => {
      const songPart = match[1]?.trim();
      const artistPart = match[2]?.trim();
      const query = artistPart ? `${songPart} ${artistPart}` : songPart;

      return {
        type: 'play',
        query: query || '',
        confidence: 0.9,
        rawText: fullText,
      };
    },
  },
  {
    type: 'skip',
    patterns: [
      /^(?:skip|next|next song|skip this|skip song)(?:\s+(\d+))?$/i,
      /^(?:can you |please )?skip(?:\s+(\d+))?(?:\s+songs?)?$/i,
    ],
    extractor: (match, fullText) => {
      const count = match[1] ? parseInt(match[1], 10) : 1;
      return {
        type: 'skip',
        parameter: count,
        confidence: 0.95,
        rawText: fullText,
      };
    },
  },
  {
    type: 'pause',
    patterns: [/^(?:pause|stop playing|hold on|wait)$/i],
    extractor: (_match, fullText) => ({
      type: 'pause',
      confidence: 0.95,
      rawText: fullText,
    }),
  },
  {
    type: 'resume',
    patterns: [/^(?:resume|continue|unpause|keep going|go on|start again)$/i],
    extractor: (_match, fullText) => ({
      type: 'resume',
      confidence: 0.95,
      rawText: fullText,
    }),
  },
  {
    type: 'stop',
    patterns: [/^(?:stop|stop playing|turn off|shut up|be quiet)$/i],
    extractor: (_match, fullText) => ({
      type: 'stop',
      confidence: 0.95,
      rawText: fullText,
    }),
  },
  {
    type: 'queue',
    patterns: [
      /^(?:queue|show queue|what'?s in queue|what'?s queued|what'?s playing next|what'?s up)$/i,
    ],
    extractor: (_match, fullText) => ({
      type: 'queue',
      confidence: 0.9,
      rawText: fullText,
    }),
  },
  {
    type: 'volume',
    patterns: [
      /^(?:volume|set volume|change volume)\s+(?:to\s+)?(\d+)(?:\s*%?)?$/i,
      /^(?:turn it\s+)?(?:up|down|louder|quieter)$/i,
    ],
    extractor: (match, fullText) => {
      let parameter: number | undefined;

      if (match[1]) {
        parameter = parseInt(match[1], 10);
      } else {
        // Handle relative volume changes
        const lower = fullText.toLowerCase();
        if (lower.includes('up') || lower.includes('louder')) {
          parameter = 10; // Increase by 10
        } else if (lower.includes('down') || lower.includes('quieter')) {
          parameter = -10; // Decrease by 10
        }
      }

      return {
        type: 'volume',
        parameter,
        confidence: 0.85,
        rawText: fullText,
      };
    },
  },
  {
    type: 'clear',
    patterns: [/^(?:clear queue|clear|remove all|delete queue)$/i],
    extractor: (_match, fullText) => ({
      type: 'clear',
      confidence: 0.9,
      rawText: fullText,
    }),
  },
  {
    type: 'help',
    patterns: [/^(?:help|what can you do|commands|how do i use you)$/i],
    extractor: (_match, fullText) => ({
      type: 'help',
      confidence: 0.9,
      rawText: fullText,
    }),
  },
];

/**
 * Parse transcribed speech into a voice command
 */
export function parseVoiceCommand(text: string): ParsedVoiceCommand {
  const normalized = text.trim().toLowerCase();

  if (!normalized || normalized.length === 0) {
    return {
      type: 'unknown',
      confidence: 0,
      rawText: text,
    };
  }

  log.debug(`Parsing voice command: "${normalized}"`);

  // Try each command pattern
  for (const { type, patterns, extractor } of COMMAND_PATTERNS) {
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) {
        log.info(`Matched command type: ${type}`);
        if (extractor) {
          return extractor(match, text);
        }
        return {
          type,
          confidence: 0.9,
          rawText: text,
        };
      }
    }
  }

  // No pattern matched - check if it looks like a play command by default
  // (common fallback for "song name" without explicit "play" prefix)
  if (normalized.split(/\s+/).length >= 2) {
    log.info('No explicit command found, assuming play command');
    return {
      type: 'play',
      query: text.trim(),
      confidence: 0.6, // Lower confidence for implicit commands
      rawText: text,
    };
  }

  log.warn(`Could not parse voice command: "${text}"`);
  return {
    type: 'unknown',
    confidence: 0,
    rawText: text,
  };
}

/**
 * Generate help text for voice commands
 */
export function getVoiceCommandHelp(): string {
  return `**Voice Commands:**
  
**Music Control:**
• "Play [song name]" or "Play [song] by [artist]"
• "Skip" or "Skip [number]"
• "Pause" or "Resume"
• "Stop"
• "Queue" - Show what's playing next
• "Clear queue"

**Volume:**
• "Volume [number]" - Set volume (0-100)
• "Turn it up" or "Turn it down"

**Help:**
• "Help" - Show this message

**Tips:**
• Speak clearly and wait for the bot to respond
• You can say "play" or just say the song name
• For best results, include the artist name`;
}

/**
 * Validate a parsed command before execution
 */
export function validateVoiceCommand(
  command: ParsedVoiceCommand,
  minConfidence: number = 0.6
): { valid: boolean; reason?: string } {
  // Check confidence threshold
  if (command.confidence < minConfidence) {
    return {
      valid: false,
      reason: `Command confidence (${command.confidence.toFixed(2)}) below threshold (${minConfidence})`,
    };
  }

  // Validate command-specific requirements
  switch (command.type) {
    case 'play':
      if (!command.query || command.query.trim().length === 0) {
        return {
          valid: false,
          reason: 'Play command requires a song name or query',
        };
      }
      break;

    case 'volume':
      if (command.parameter !== undefined) {
        const vol = Number(command.parameter);
        if (isNaN(vol)) {
          return {
            valid: false,
            reason: 'Volume must be a number',
          };
        }
        // Allow relative volume changes (negative values for 'turn it down')
        // Absolute values must be 0-100, relative changes can be -100 to 100
        if (Math.abs(vol) > 100) {
          return {
            valid: false,
            reason: 'Volume adjustment must be between -100 and 100',
          };
        }
      }
      break;

    case 'skip':
      if (command.parameter !== undefined) {
        const count = Number(command.parameter);
        if (isNaN(count) || count < 1) {
          return {
            valid: false,
            reason: 'Skip count must be a positive number',
          };
        }
      }
      break;

    case 'unknown':
      return {
        valid: false,
        reason: 'Could not understand command',
      };
  }

  return { valid: true };
}
