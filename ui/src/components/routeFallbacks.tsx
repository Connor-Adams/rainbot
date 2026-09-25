import type { ReactNode } from 'react';
import { Skeleton, SkeletonText, Spinner, Text } from '@connor-adams/designsystem';

/**
 * Suspense fallbacks for the lazily-loaded tabs.
 *
 * Two rules shape this file:
 *
 * 1. Everything here renders WHILE the tab's chunk is still downloading, so it
 *    must live in the entry chunk. That means it may only import things the
 *    entry already carries — the design system, and nothing else. In
 *    particular it must not reach for `@/components/common`: that barrel is
 *    pulled into the statistics chunk by the 21 stats sections, and importing
 *    `StatsLoading` from it here would drag all seven of its components back
 *    into the entry to save writing four lines of skeleton.
 *
 * 2. A fallback should occupy the same box as the thing it stands in for. Every
 *    tab renders the same `panel` card, so each fallback starts from that shell
 *    and then sketches the header and body that tab actually has. A bare
 *    centred spinner on a transparent background would make the layout jump
 *    once the chunk lands, which is the failure mode this whole change is
 *    supposed to avoid.
 */

/** The `panel` card shell every tab's root `<section>` renders. */
function PanelFallback({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`panel bg-surface rounded-2xl border border-border p-4 sm:p-6 ${className}`.trim()}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      {children}
    </section>
  );
}

/** A stand-in for a `<Tabs overflow="scroll">` pill row. */
function TabRowFallback({ pills }: { pills: number }) {
  return (
    <div className="flex gap-2 overflow-hidden">
      {Array.from({ length: pills }, (_, index) => (
        <Skeleton key={index} h={32} w={index % 3 === 0 ? 96 : 76} className="rounded-full" />
      ))}
    </div>
  );
}

/**
 * Statistics: an `<h2>`, then 21 scrolling pills, then one section panel. The
 * spinner-and-caption body deliberately mirrors `StatsLoading`'s default
 * variant, which is what the section itself shows a moment later while its own
 * query is in flight — so the transition from "chunk loading" to "data
 * loading" is visually continuous instead of two different waits.
 */
export function StatisticsTabFallback() {
  return (
    <PanelFallback label="Loading statistics" className="stats-panel">
      <div className="mb-6 space-y-4">
        <Skeleton h={30} w={260} />
        <TabRowFallback pills={8} />
      </div>
      <div className="flex flex-col items-center gap-3 py-12">
        <Spinner tone="muted" label="Loading statistics..." />
        <Text tone="muted">Loading statistics...</Text>
      </div>
    </PanelFallback>
  );
}

/** Admin: title, subtitle, a six-pill section row, then a settings form. */
export function AdminTabFallback() {
  return (
    <PanelFallback label="Loading admin tasks">
      <div className="mb-6 space-y-2">
        <Skeleton h={24} w={160} />
        <Skeleton h={16} w={320} />
      </div>
      <div className="mb-4">
        <TabRowFallback pills={6} />
      </div>
      <div className="space-y-4">
        <SkeletonText lines={3} />
        <Skeleton h={44} />
        <Skeleton h={44} />
      </div>
    </PanelFallback>
  );
}

/** Soundboard: a title/actions header, a search row, then the sound tile grid. */
export function SoundboardTabFallback() {
  return (
    <PanelFallback label="Loading sounds">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton h={24} w={150} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Skeleton h={34} w={160} className="rounded-lg" />
          <Skeleton h={34} w={120} className="rounded-lg" />
        </div>
      </div>
      <div className="mb-6">
        <Skeleton h={44} className="rounded-lg" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
        {Array.from({ length: 12 }, (_, index) => (
          <Skeleton key={index} h={104} className="rounded-xl" />
        ))}
      </div>
    </PanelFallback>
  );
}

/** Recordings: a heading and a list of rows. */
export function RecordingsTabFallback() {
  return (
    <PanelFallback label="Loading recordings">
      <div className="mb-6">
        <Skeleton h={24} w={180} />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} h={56} className="rounded-lg" />
        ))}
      </div>
    </PanelFallback>
  );
}

/** The emoji picker's box inside the sound edit modal: 320px tall, full width. */
export function EmojiPickerFallback() {
  return (
    <div
      className="flex h-[320px] w-full items-center justify-center"
      role="status"
      aria-busy="true"
      aria-label="Loading emoji picker"
    >
      <Spinner tone="muted" label="Loading emoji picker..." />
    </div>
  );
}
