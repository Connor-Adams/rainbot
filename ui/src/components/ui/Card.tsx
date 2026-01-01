import type { HTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hover?: boolean
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, hover = false, className = '', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`
          bg-surface rounded-2xl border border-border shadow-sm
          transition-all duration-300 ease-out
          ${hover ? 'hover:border-primary hover:shadow-md hover:-translate-y-0.5' : ''}
          ${className}
        `}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

export function CardHeader({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`px-6 py-4 border-b border-border ${className}`} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '', ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={`text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2 ${className}`}
      {...props}
    >
      <span className="w-0.5 h-4 bg-gradient-to-b from-primary to-secondary rounded-full shadow-glow" />
      {children}
    </h3>
  )
}

export function CardContent({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`px-6 py-4 ${className}`} {...props}>
      {children}
    </div>
  )
}

export default Card
