import { useRef } from 'react'

interface UploadButtonProps {
  onUpload: (files: File[]) => void
  isUploading: boolean
  disabled?: boolean
}

export function UploadButton({ onUpload, isUploading, disabled }: UploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      onUpload(files)
      e.target.value = '' // Reset input
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.ogg,.m4a,.webm,.flac"
        multiple
        hidden
        onChange={handleFileChange}
        aria-label="Upload sound files"
      />
      <button
        className="btn btn-secondary flex items-center gap-2 px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={handleClick}
        disabled={isUploading || disabled}
        aria-busy={isUploading}
      >
        {isUploading ? (
          <>
            <span className="animate-spin">⏳</span>
            <span>Uploading...</span>
          </>
        ) : (
          <>
            <span>📤</span>
            <span>Upload</span>
          </>
        )}
      </button>
    </>
  )
}
