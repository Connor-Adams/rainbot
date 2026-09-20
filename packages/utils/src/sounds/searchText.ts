/**
 * Re-exported from `@rainbot/shared` because the dashboard filters locally
 * with the same rules the server indexes by, and `@rainbot/shared` is the
 * only package the ESM UI can import. Two implementations of this would
 * drift, and the symptom would be search working on the server but not while
 * typing.
 */
export {
  normalizeForSearch,
  humanizeFilename,
  buildSearchDoc,
  type SearchDocParts,
} from '@rainbot/shared';
