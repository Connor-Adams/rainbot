/**
 * Shared utility for detecting track source type
 */

export type SourceType = 'youtube' | 'spotify' | 'soundcloud' | 'local' | 'other';

export interface TrackForSourceDetection {
  isLocal?: boolean;
  url?: string;
  spotifyId?: string;
}

/**
 * Detect the source type of a track based on its properties
 * @param track - Track object
 * @returns Source type
 */
export function detectSourceType(track: TrackForSourceDetection): SourceType {
  if (track.isLocal) return 'local';
  if (!track.url) return 'other';

  const url = track.url.toLowerCase();
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('spotify.com') || track.spotifyId) return 'spotify';
  if (url.includes('soundcloud.com')) return 'soundcloud';

  return 'other';
}
