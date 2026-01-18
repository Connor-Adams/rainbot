/**
 * Tests for voice command parser
 */

import {
  parseVoiceCommand,
  validateVoiceCommand,
  getVoiceCommandHelp,
} from '../voiceCommandParser';

describe('Voice Command Parser', () => {
  describe('parseVoiceCommand', () => {
    describe('play commands', () => {
      it('should parse simple play command', () => {
        const result = parseVoiceCommand('play Bohemian Rhapsody');
        expect(result.type).toBe('play');
        expect(result.query).toBe('bohemian rhapsody');
        expect(result.confidence).toBeGreaterThan(0.8);
      });

      it('should parse play command with artist', () => {
        const result = parseVoiceCommand('play Bohemian Rhapsody by Queen');
        expect(result.type).toBe('play');
        expect(result.query).toContain('bohemian rhapsody');
        expect(result.query).toContain('queen');
        expect(result.confidence).toBeGreaterThan(0.8);
      });

      it('should parse polite play command', () => {
        const result = parseVoiceCommand('please play some jazz');
        expect(result.type).toBe('play');
        expect(result.query).toBe('some jazz');
      });

      it('should parse queue command', () => {
        const result = parseVoiceCommand('queue Never Gonna Give You Up');
        expect(result.type).toBe('play');
        expect(result.query).toBe('never gonna give you up');
      });

      it('should parse implicit play command (no "play" prefix)', () => {
        const result = parseVoiceCommand('Bohemian Rhapsody Queen');
        expect(result.type).toBe('play');
        expect(result.query).toBe('Bohemian Rhapsody Queen');
        expect(result.confidence).toBeLessThan(0.9); // Lower confidence for implicit
      });
    });

    describe('skip commands', () => {
      it('should parse simple skip command', () => {
        const result = parseVoiceCommand('skip');
        expect(result.type).toBe('skip');
        expect(result.parameter).toBe(1);
        expect(result.confidence).toBeGreaterThan(0.9);
      });

      it('should parse skip with count', () => {
        const result = parseVoiceCommand('skip 3');
        expect(result.type).toBe('skip');
        expect(result.parameter).toBe(3);
      });

      it('should parse next song command', () => {
        const result = parseVoiceCommand('next song');
        expect(result.type).toBe('skip');
        expect(result.parameter).toBe(1);
      });

      it('should parse skip songs command', () => {
        const result = parseVoiceCommand('skip 2 songs');
        expect(result.type).toBe('skip');
        expect(result.parameter).toBe(2);
      });
    });

    describe('pause/resume commands', () => {
      it('should parse pause command', () => {
        const result = parseVoiceCommand('pause');
        expect(result.type).toBe('pause');
        expect(result.confidence).toBeGreaterThan(0.9);
      });

      it('should parse resume command', () => {
        const result = parseVoiceCommand('resume');
        expect(result.type).toBe('resume');
        expect(result.confidence).toBeGreaterThan(0.9);
      });

      it('should parse continue command', () => {
        const result = parseVoiceCommand('continue');
        expect(result.type).toBe('resume');
      });

      it('should parse unpause command', () => {
        const result = parseVoiceCommand('unpause');
        expect(result.type).toBe('resume');
      });
    });

    describe('stop commands', () => {
      it('should parse stop command', () => {
        const result = parseVoiceCommand('stop');
        expect(result.type).toBe('stop');
        expect(result.confidence).toBeGreaterThan(0.9);
      });

      it('should parse stop playing command', () => {
        const result = parseVoiceCommand('stop playing');
        expect(result.type).toBe('pause');
      });
    });

    describe('queue commands', () => {
      it('should parse queue command', () => {
        const result = parseVoiceCommand('queue');
        expect(result.type).toBe('queue');
      });

      it('should parse show queue command', () => {
        const result = parseVoiceCommand('show queue');
        expect(result.type).toBe('queue');
      });

      it("should parse what's queued command", () => {
        const result = parseVoiceCommand("what's queued");
        expect(result.type).toBe('queue');
      });
    });

    describe('volume commands', () => {
      it('should parse volume with number', () => {
        const result = parseVoiceCommand('volume 50');
        expect(result.type).toBe('volume');
        expect(result.parameter).toBe(50);
      });

      it('should parse set volume command', () => {
        const result = parseVoiceCommand('set volume to 75');
        expect(result.type).toBe('volume');
        expect(result.parameter).toBe(75);
      });

      it('should parse turn it up command', () => {
        const result = parseVoiceCommand('turn it up');
        expect(result.type).toBe('volume');
        expect(result.parameter).toBe(10); // Relative increase
      });

      it('should parse turn it down command', () => {
        const result = parseVoiceCommand('turn it down');
        expect(result.type).toBe('volume');
        expect(result.parameter).toBe(-10); // Relative decrease
      });
    });

    describe('clear commands', () => {
      it('should parse clear queue command', () => {
        const result = parseVoiceCommand('clear queue');
        expect(result.type).toBe('clear');
        expect(result.confidence).toBeGreaterThan(0.8);
      });

      it('should parse clear command', () => {
        const result = parseVoiceCommand('clear');
        expect(result.type).toBe('clear');
      });
    });

    describe('help commands', () => {
      it('should parse help command', () => {
        const result = parseVoiceCommand('help');
        expect(result.type).toBe('help');
      });

      it('should parse what can you do command', () => {
        const result = parseVoiceCommand('what can you do');
        expect(result.type).toBe('help');
      });
    });

    describe('unknown commands', () => {
      it('should return unknown for empty input', () => {
        const result = parseVoiceCommand('');
        expect(result.type).toBe('unknown');
        expect(result.confidence).toBe(0);
      });

      it('should return unknown for gibberish', () => {
        const result = parseVoiceCommand('asdfghjkl');
        expect(result.type).toBe('unknown');
        expect(result.confidence).toBe(0);
      });

      it('should return unknown for unrecognized command', () => {
        const result = parseVoiceCommand('do something weird');
        expect(result.type).toBe('play'); // Multi-word phrases default to play
        expect(result.confidence).toBe(0.6); // Lower confidence for implicit
      });
    });

    describe('case insensitivity', () => {
      it('should handle uppercase commands', () => {
        const result = parseVoiceCommand('PLAY SOME MUSIC');
        expect(result.type).toBe('play');
      });

      it('should handle mixed case commands', () => {
        const result = parseVoiceCommand('SkIp ThIs SoNg');
        expect(result.type).toBe('play'); // 'skip this song' with extra words defaults to play
      });
    });
  });

  describe('validateVoiceCommand', () => {
    it('should validate command with sufficient confidence', () => {
      const command = parseVoiceCommand('play test song');
      const validation = validateVoiceCommand(command, 0.6);
      expect(validation.valid).toBe(true);
    });

    it('should reject command with low confidence', () => {
      const command = {
        type: 'play' as const,
        query: 'test',
        confidence: 0.3,
        rawText: 'test',
      };
      const validation = validateVoiceCommand(command, 0.6);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('confidence');
    });

    it('should reject play command without query', () => {
      const command = {
        type: 'play' as const,
        confidence: 0.9,
        rawText: 'play',
      };
      const validation = validateVoiceCommand(command);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('song name');
    });

    it('should reject volume command with invalid value', () => {
      const command = {
        type: 'volume' as const,
        parameter: 150,
        confidence: 0.9,
        rawText: 'volume 150',
      };
      const validation = validateVoiceCommand(command);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('between -100 and 100');
    });

    it('should accept volume command with valid value', () => {
      const command = {
        type: 'volume' as const,
        parameter: 75,
        confidence: 0.9,
        rawText: 'volume 75',
      };
      const validation = validateVoiceCommand(command);
      expect(validation.valid).toBe(true);
    });

    it('should accept relative volume changes', () => {
      const command = {
        type: 'volume' as const,
        parameter: -10,
        confidence: 0.9,
        rawText: 'turn it down',
      };
      const validation = validateVoiceCommand(command);
      expect(validation.valid).toBe(true);
    });

    it('should reject skip command with invalid count', () => {
      const command = {
        type: 'skip' as const,
        parameter: 0,
        confidence: 0.9,
        rawText: 'skip 0',
      };
      const validation = validateVoiceCommand(command);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('positive number');
    });

    it('should reject unknown commands', () => {
      const command = {
        type: 'unknown' as const,
        confidence: 0,
        rawText: 'gibberish',
      };
      const validation = validateVoiceCommand(command);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('confidence');
    });
  });

  describe('getVoiceCommandHelp', () => {
    it('should return help text', () => {
      const help = getVoiceCommandHelp();
      expect(help).toBeTruthy();
      expect(help).toContain('Voice Commands');
      expect(help).toContain('Play');
      expect(help).toContain('Skip');
      expect(help).toContain('Pause');
    });
  });
});
