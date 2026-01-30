import { useRef, useState } from 'react';
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';
import { useClickOutside } from '@/hooks/useClickOutside';

interface EditModalProps {
  soundName: string;
  initialDisplayName?: string;
  initialEmoji?: string;
  onSave: (displayName: string, emoji: string) => void;
  onTrim?: (startMs: number, endMs: number) => Promise<void> | void;
  onCancel: () => void;
}

export function EditModal({
  soundName,
  initialDisplayName = '',
  initialEmoji = '🎵',
  onSave,
  onTrim,
  onCancel,
}: EditModalProps) {
  // Use a key prop on the modal instead of syncing state in useEffect
  // The parent should add key={soundName} to reset state when sound changes
  const baseName = soundName.replace(/\.[^/.]+$/, '');
  const [displayName, setDisplayName] = useState(initialDisplayName || baseName);
  const [emoji, setEmoji] = useState(initialEmoji);
  const [trimStartSec, setTrimStartSec] = useState('0');
  const [trimEndSec, setTrimEndSec] = useState('');
  const [isTrimming, setIsTrimming] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const quickEmojis = ['🎵', '🔥', '😂', '😮', '👏', '💯', '⚡', '✨', '🔔', '🎉', '😎', '💥'];

  useClickOutside(pickerRef, () => {
    if (isPickerOpen) {
      setIsPickerOpen(false);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedDisplayName = displayName.trim() || baseName;
    onSave(resolvedDisplayName, emoji.trim() || '🎵');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (isPickerOpen) {
        setIsPickerOpen(false);
        return;
      }
      onCancel();
    }
  };

  const handleTrim = async () => {
    if (!onTrim) return;
    const start = Number(trimStartSec);
    const end = Number(trimEndSec);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      alert('Enter valid start/end seconds (end must be greater than start).');
      return;
    }
    try {
      setIsTrimming(true);
      await onTrim(Math.floor(start * 1000), Math.floor(end * 1000));
    } catch (error) {
      const message = (error as Error).message || 'Trim failed';
      alert(message);
    } finally {
      setIsTrimming(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-surface rounded-xl border border-border p-4 sm:p-6 w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="modal-title"
        aria-modal="true"
      >
        <h3 id="modal-title" className="text-lg font-semibold text-text-primary mb-4">
          Customize Sound
        </h3>

        <form onSubmit={handleSubmit}>
          <div className="space-y-5">
            <div>
              <label htmlFor="emoji-input" className="block text-sm text-text-secondary mb-2">
                Emoji
              </label>
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-[56px,1fr,auto] items-center gap-3">
                  <div className="text-3xl bg-surface-elevated border border-border rounded-xl w-14 h-14 flex items-center justify-center shrink-0">
                    {emoji || '🎵'}
                  </div>
                  <input
                    id="emoji-input"
                    type="text"
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    className="min-w-0 px-4 py-3 bg-surface-input border border-border rounded-lg text-text-primary text-2xl text-center focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    placeholder="🎵"
                    maxLength={6}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="px-4 py-3 rounded-lg border border-border text-sm text-text-secondary hover:bg-surface-hover transition-colors"
                    onClick={() => setIsPickerOpen((prev) => !prev)}
                    aria-expanded={isPickerOpen}
                    aria-controls="emoji-picker"
                  >
                    {isPickerOpen ? 'Close' : 'Pick'}
                  </button>
                </div>
                <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                  {quickEmojis.map((quickEmoji) => (
                    <button
                      key={quickEmoji}
                      type="button"
                      className="h-10 rounded-lg border border-border bg-surface-elevated text-xl hover:bg-surface-hover transition-colors"
                      onClick={() => setEmoji(quickEmoji)}
                      aria-label={`Use ${quickEmoji}`}
                    >
                      {quickEmoji}
                    </button>
                  ))}
                </div>
              </div>
              {isPickerOpen && (
                <div
                  ref={pickerRef}
                  id="emoji-picker"
                  className="mt-3 rounded-lg border border-border bg-surface-input p-3 shadow-lg max-h-[360px] overflow-hidden"
                >
                  <EmojiPicker
                    onEmojiClick={(emojiData: EmojiClickData) => {
                      setEmoji(emojiData.emoji);
                      setIsPickerOpen(false);
                    }}
                    skinTonesDisabled
                    searchDisabled={false}
                    lazyLoadEmojis
                    height={320}
                    width="100%"
                  />
                </div>
              )}
              <p className="text-xs text-text-muted">
                Tip: Use the picker to browse/search, or type an emoji directly.
              </p>
            </div>

            <div>
              <label htmlFor="name-input" className="block text-sm text-text-secondary mb-2">
                Display Name
              </label>
              <input
                id="name-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 bg-surface-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                placeholder={baseName}
              />
              <p className="text-xs text-text-muted mt-2">
                Clear the name to fall back to the filename.
              </p>
            </div>

            <p className="text-xs text-text-muted flex items-center gap-2">
              <span>🎧</span>
              <span className="truncate">{soundName}</span>
            </p>

            <div className="border-t border-border pt-4">
              <h4 className="text-sm font-semibold text-text-primary mb-2">Trim Clip</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="trim-start" className="block text-xs text-text-secondary mb-1">
                    Start (sec)
                  </label>
                  <input
                    id="trim-start"
                    type="number"
                    min="0"
                    step="0.01"
                    value={trimStartSec}
                    onChange={(e) => setTrimStartSec(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>
                <div>
                  <label htmlFor="trim-end" className="block text-xs text-text-secondary mb-1">
                    End (sec)
                  </label>
                  <input
                    id="trim-end"
                    type="number"
                    min="0"
                    step="0.01"
                    value={trimEndSec}
                    onChange={(e) => setTrimEndSec(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>
              </div>
              <p className="text-xs text-text-muted mt-2">
                Trimming re-encodes to Ogg Opus. Use short clips for rapid sampling.
              </p>
              <button
                type="button"
                onClick={handleTrim}
                disabled={!onTrim || isTrimming}
                className="mt-3 w-full px-4 py-2.5 bg-secondary hover:bg-secondary-dark disabled:bg-secondary/40 disabled:text-text-muted text-text-primary rounded-lg transition-colors font-medium"
              >
                {isTrimming ? 'Trimming...' : 'Apply Trim'}
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <button
              type="button"
              className="flex-1 px-4 py-2.5 bg-surface-elevated hover:bg-surface-hover text-text-primary rounded-lg transition-colors font-medium"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-dark text-text-primary rounded-lg transition-colors font-medium"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
