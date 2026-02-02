/**
 * YouTube URL parsing utilities.
 * Extracts video IDs and normalizes URLs for consistent downstream handling.
 */

/** YouTube video IDs are 11 characters: alphanumeric, hyphen, underscore */
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extract YouTube video ID from any supported video URL format.
 * Handles: youtube.com/watch?v=ID, youtu.be/ID, m.youtube.com/..., with or without list/index/t params.
 *
 * @returns The 11-character video ID, or null if not a valid YouTube video URL
 */
export function extractYouTubeVideoId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // youtu.be/VIDEO_ID
    if (hostname === 'youtu.be') {
      const id = parsed.pathname.slice(1).split('/')[0] ?? '';
      return id && VIDEO_ID_PATTERN.test(id) ? id : null;
    }

    // youtube.com, www.youtube.com, m.youtube.com, music.youtube.com, etc.
    if (hostname.includes('youtube.com')) {
      // /watch?v=VIDEO_ID
      if (parsed.pathname.includes('/watch')) {
        const id = parsed.searchParams.get('v');
        return id && VIDEO_ID_PATTERN.test(id) ? id : null;
      }
      // /v/VIDEO_ID (legacy)
      const vMatch = parsed.pathname.match(/^\/v\/([a-zA-Z0-9_-]{11})/);
      if (vMatch?.[1]) return vMatch[1];
      // /embed/VIDEO_ID
      const embedMatch = parsed.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch?.[1]) return embedMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

/** Canonical watch URL base */
const CANONICAL_WATCH_URL = 'https://www.youtube.com/watch?v=';

/**
 * Convert a YouTube URL or raw video ID to the canonical watch URL.
 * Strips playlist params, youtu.be, etc. for consistent downstream use.
 *
 * @returns https://www.youtube.com/watch?v=VIDEO_ID or null if not a valid video
 */
export function toCanonicalYouTubeUrl(urlOrId: string | null | undefined): string | null {
  if (!urlOrId || typeof urlOrId !== 'string') return null;

  // Already looks like a raw video ID
  if (VIDEO_ID_PATTERN.test(urlOrId)) {
    return CANONICAL_WATCH_URL + urlOrId;
  }

  const id = extractYouTubeVideoId(urlOrId);
  return id ? CANONICAL_WATCH_URL + id : null;
}

/**
 * Get YouTube thumbnail URL from a video URL or ID.
 * Returns maxresdefault; caller can fall back to hqdefault/mqdefault if needed.
 */
export function getYouTubeThumbnailUrl(urlOrId: string | null | undefined): string | null {
  const id =
    extractYouTubeVideoId(urlOrId) ?? (urlOrId && VIDEO_ID_PATTERN.test(urlOrId) ? urlOrId : null);
  return id ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg` : null;
}
