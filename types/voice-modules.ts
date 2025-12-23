/**
 * Type definitions for voice modules
 */

import { AudioPlayer, AudioResource, VoiceConnection } from '@discordjs/voice';
import { ChildProcess } from 'child_process';
import { Mutex } from 'async-mutex';

/**
 * Track object representing a song or audio file
 */
export interface Track {
    title: string;
    url?: string;
    duration?: number;
    isLocal?: boolean;
    isStream?: boolean;
    source?: string;
    userId?: string;
    username?: string;
    discriminator?: string;
    spotifyId?: string;
    spotifyUrl?: string;
    sourceType?: 'youtube' | 'spotify' | 'soundcloud' | 'local' | 'other';
}

/**
 * Voice state for a guild
 */
export interface VoiceState {
    connection: VoiceConnection;
    player: AudioPlayer;
    nowPlaying: string | null;
    currentTrack: Track | null;
    currentResource: AudioResource | null;
    queue: Track[];
    channelId: string;
    channelName: string;
    lastUserId: string | null;
    lastUsername: string | null;
    lastDiscriminator: string | null;
    pausedMusic: any | null;
    playbackStartTime: number | null;
    pauseStartTime: number | null;
    totalPausedTime: number;
    overlayProcess: ChildProcess | null;
    volume: number;
    preBuffered: any | null;
    currentTrackSource: string | null;
}

/**
 * Audio resource result
 */
export interface AudioResourceResult {
    resource: AudioResource;
    subprocess?: ChildProcess;
    actualSeek?: number;
}

/**
 * Soundboard result
 */
export interface SoundboardResult {
    overlaid: boolean;
    sound: string;
    message: string;
    error?: string;
}

/**
 * Queue snapshot for persistence
 */
export interface QueueSnapshot {
    guild_id: string;
    channel_id: string;
    queue_data: Track[];
    current_track: Track | null;
    position_ms: number;
    is_paused: boolean;
    volume: number;
    last_user_id: string | null;
    saved_at: Date;
}

/**
 * Track metadata result
 */
export interface TrackMetadata {
    title: string;
    url: string;
    duration?: number;
    spotifyId?: string;
    spotifyUrl?: string;
}

/**
 * Playlist metadata result
 */
export interface PlaylistMetadata {
    title: string;
    entries: any[];
}

/**
 * Queue info snapshot
 */
export interface QueueInfo {
    queue: Track[];
    totalInQueue: number;
    nowPlaying: string | null;
    currentTrack: Track | null;
    playbackPosition?: number;
    hasOverlay?: boolean;
    isPaused?: boolean;
    channelName?: string;
}

/**
 * Play result
 */
export interface PlayResult {
    added: number;
    tracks: Track[];
    totalInQueue: number;
    overlaid?: boolean;
}
