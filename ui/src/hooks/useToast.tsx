import { useState, useCallback, type ReactNode } from 'react'
import Toast from '@/components/Toast'

interface ToastData {
  id: number
  message: string
  type: 'success' | 'error' | 'warning'
}

let toastId = 0

export function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([])

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    const id = toastId++
    setToasts((prev) => [...prev, { id, message, type }])
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const ToastContainer = (): ReactNode => (
    <div className="toast-container fixed bottom-6 right-6 flex flex-col gap-3 z-1000">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  )

  return { showToast, ToastContainer }
}

