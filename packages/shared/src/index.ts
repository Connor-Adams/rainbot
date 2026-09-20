// Logger exports
export { createLogger, logger } from './logger';
export type { Logger } from './logger';

// YouTube URL utilities
export {
  parseYouTubeUrl,
  extractYouTubeVideoId,
  toCanonicalYouTubeUrl,
  getYouTubeThumbnailUrl,
  YouTubeUrl,
} from './youtubeUrl';
export type { YouTubeVideoInfo } from './youtubeUrl';

// Outbound proxy URL validation and redaction
export { normalizeProxyUrl, maskProxyUrl, ProxyUrlError } from './proxyUrl';

// Soundboard search text shaping (shared with the ESM UI)
export { normalizeForSearch, humanizeFilename, buildSearchDoc } from './soundSearchText';
export type { SearchDocParts } from './soundSearchText';
