/**
 * Voice manager type definitions
 * Legacy file - use voice-modules.ts for new voice module types
 */

import { VoiceConnection, AudioPlayer } from '@discordjs/voice';
import { VoiceBasedChannel } from 'discord.js';

export interface Track {
    title: string;
    url?: string;
    duration?: number;
    isLocal?: boolean;
    source?: 'youtube' | 'soundcloud' | 'spotify' | 'local' | 'other';
}

export interface QueueInfo {
    nowPlaying: string | null;
    queue: Track[];
    totalInQueue?: number;
}

export interface VoiceStatus {
    channelId: string;
    channelName: string;
    nowPlaying: string | null;
    isPlaying: boolean;
    queueLength: number;
}
