import { Icon, UploadButton as DSUploadButton } from '@connor-adams/designsystem';
import type { FileRejection } from '@connor-adams/designsystem';

/**
 * Audio extensions the sounds API accepts. Kept verbatim from the hand-rolled
 * version - it is both the picker's filter hint and, now, what the design
 * system validates the selection against.
 */
const ACCEPT = '.mp3,.wav,.ogg,.m4a,.webm,.flac';

interface UploadButtonProps {
  onUpload: (files: File[]) => void;
  isUploading: boolean;
  disabled?: boolean;
}

/**
 * Soundboard upload trigger, on the design system's `UploadButton`.
 *
 * It owns the hidden `<input type="file">`, resets that input's value after
 * every selection (so picking the same file twice in a row still fires), sets
 * `aria-busy` while `loading`, and swaps the leading icon for a Spinner.
 *
 * One deliberate behaviour change: `accept` used to be only a picker hint, so a
 * file chosen through the picker's "All Files" escape hatch was handed straight
 * to the server. The design system validates the selection against `accept`, so
 * those files are now turned away client-side. They must not vanish silently,
 * hence `onError` - reported with `alert`, matching how the rest of
 * SoundboardTab surfaces failures.
 */
export function UploadButton({ onUpload, isUploading, disabled }: UploadButtonProps) {
  const handleError = (rejections: FileRejection[]) => {
    alert(`Error: ${rejections.map((rejection) => rejection.message).join('\n')}`);
  };

  return (
    <DSUploadButton
      accept={ACCEPT}
      multiple
      variant="secondary"
      onFiles={onUpload}
      onError={handleError}
      loading={isUploading}
      loadingLabel="Uploading..."
      disabled={disabled}
      icon={<Icon name="upload" size={16} />}
      inputProps={{ 'aria-label': 'Upload sound files' }}
    >
      Upload
    </DSUploadButton>
  );
}
