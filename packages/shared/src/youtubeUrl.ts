/**
 * YouTube URL parser – one place for video ID, watch URL, and thumbnail.
 * Use parseYouTubeUrl() for a single parse, or the helpers when you only need one value.
 */

/** 11-char YouTube video ID (alphanumeric, hyphen, underscore). */
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const WATCH_BASE = 'https://www.youtube.com/watch?v=';
const THUMB_BASE = 'https://img.youtube.com/vi/';
const THUMB_SUFFIX = '/maxresdefault.jpg';

export interface YouTubeVideoInfo {
  /** 11-character video ID. */
  videoId: string;
  /** Canonical watch URL (no list/index params). */
  watchUrl: string;
  /** Thumbnail image URL (maxresdefault). */
  thumbnailUrl: string;
}

/**
 * Parse a YouTube video URL or raw video ID into a single result object.
 * Handles: youtube.com/watch?v=ID, youtu.be/ID, embed, /v/, and raw 11-char ID.
 * Strips list/index params from watch URLs.
 *
 * @returns YouTubeVideoInfo or null if input is not a valid video URL/ID
 */
export function parseYouTubeUrl(input: string | null | undefined): YouTubeVideoInfo | null {
  const videoId = extractVideoId(input);
  if (!videoId) return null;
  return {
    videoId,
    watchUrl: WATCH_BASE + videoId,
    thumbnailUrl: THUMB_BASE + videoId + THUMB_SUFFIX,
  };
}

function extractVideoId(input: string | null | undefined): string | null {
  if (input == null || typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;

  // Raw video ID
  if (VIDEO_ID_REGEX.test(s)) return s;

  try {
    const url = new URL(s);
    const host = url.hostname.toLowerCase();

    // youtu.be/VIDEO_ID
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0] ?? '';
      return id && VIDEO_ID_REGEX.test(id) ? id : null;
    }

    // youtube.com variants
    if (!host.includes('youtube.com')) return null;

    // /watch?v=VIDEO_ID (ignores list= and index=)
    if (url.pathname.includes('/watch')) {
      const id = url.searchParams.get('v');
      return id && VIDEO_ID_REGEX.test(id) ? id : null;
    }
    // /v/VIDEO_ID (legacy)
    const vLegacy = url.pathname.match(/^\/v\/([a-zA-Z0-9_-]{11})/);
    if (vLegacy?.[1]) return vLegacy[1];
    // /embed/VIDEO_ID
    const embed = url.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embed?.[1]) return embed[1];

    return null;
  } catch {
    return null;
  }
}

/** Get video ID from a URL or raw ID, or null. */
export function extractYouTubeVideoId(input: string | null | undefined): string | null {
  return extractVideoId(input);
}

/** Get canonical watch URL from a URL or raw ID, or null. */
export function toCanonicalYouTubeUrl(input: string | null | undefined): string | null {
  return parseYouTubeUrl(input)?.watchUrl ?? null;
}

/** Get thumbnail URL (maxresdefault) from a URL or raw ID, or null. */
export function getYouTubeThumbnailUrl(input: string | null | undefined): string | null {
  return parseYouTubeUrl(input)?.thumbnailUrl ?? null;
}

/**
 * Namespace for YouTube URL parsing – use when you want a single import.
 *
 * @example
 * import { YouTubeUrl } from '@rainbot/shared';
 * const info = YouTubeUrl.parse('https://youtu.be/dQw4w9WgXcQ');
 * if (info) console.log(info.thumbnailUrl);
 * const id = YouTubeUrl.getVideoId(url);
 */
export const YouTubeUrl = {
  parse: parseYouTubeUrl,
  getVideoId: extractYouTubeVideoId,
  toWatchUrl: toCanonicalYouTubeUrl,
  getThumbnailUrl: getYouTubeThumbnailUrl,
} as const;
