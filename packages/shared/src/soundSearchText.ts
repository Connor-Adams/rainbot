/**
 * Text shaping for soundboard search.
 *
 * `airhorn.ogg` does not match the query "air horn" under a plain substring
 * test - the space breaks it. Normalizing both sides down to bare
 * alphanumerics makes the two identical, which fixes the common case with no
 * model involved at all.
 */

export interface SearchDocParts {
  name: string;
  displayName?: string | null;
  transcript?: string | null;
  caption?: string | null;
  tags?: string[];
}

/** Reduces text to lowercase alphanumerics, so "Air-Horn" === "air horn". */
export function normalizeForSearch(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Turns a filename into words a person (or a tokenizer) would recognize. */
export function humanizeFilename(name: string): string {
  const withoutExt = name.replace(/\.[^/.]+$/, '');
  return withoutExt
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Composes everything known about a sound into one indexable document. */
export function buildSearchDoc(parts: SearchDocParts): string {
  const pieces = [
    parts.name,
    humanizeFilename(parts.name),
    parts.displayName ?? '',
    parts.transcript ?? '',
    parts.caption ?? '',
    (parts.tags ?? []).join(' '),
  ];

  return pieces
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
