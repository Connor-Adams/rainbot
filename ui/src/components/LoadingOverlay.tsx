export default function LoadingOverlay() {
  return (
    <div className="loading-overlay fixed inset-0 bg-gray-950/95 backdrop-blur-xl flex flex-col justify-center items-center gap-4 z-1000">
      <div className="loading-spinner w-12 h-12 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin"></div>
      <p className="text-gray-400 text-sm">Checking authentication...</p>
    </div>
  )
}

