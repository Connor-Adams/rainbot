import { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'warning'
  onClose: () => void
}

export default function Toast({ message, type = 'success', onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(true)
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onClose, 400)
    }, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
  }

  return (
    <div
      className={`toast ${type}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateX(0)' : 'translateX(calc(100% + 1.5rem))',
        transition: 'opacity 0.4s, transform 0.4s',
      }}
    >
      <span className="toast-icon text-xl flex-shrink-0">{icons[type]}</span>
      <span className="toast-message text-sm flex-1">{message}</span>
    </div>
  )
}

