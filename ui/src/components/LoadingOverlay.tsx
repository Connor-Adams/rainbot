export default function LoadingOverlay() {
  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-xl flex flex-col justify-center items-center gap-4 z-toast">
      <div className="w-12 h-12 border-4 border-border border-t-primary rounded-full animate-spin" />
      <p className="text-text-secondary text-sm">Checking authentication...</p>
    </div>
  )
}

