import { ChevronRightIcon } from './icons'

interface DisplayCardProps {
  name: string
}

/**
 * Generates a consistent color gradient based on a string value.
 * Same input always produces the same colors.
 */
function generateGradientColors(text: string) {
  // Create a hash from the text for consistent color generation
  const hash = text
    .split('')
    .reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0)
  
  // Convert hash to a hue value (0-360)
  const hue = Math.abs(hash) % 360
  
  // Create two colors with a 60-degree hue difference for the gradient
  const startColor = `hsl(${hue}, 70%, 50%)`
  const endColor = `hsl(${(hue + 60) % 360}, 70%, 50%)`
  
  return { startColor, endColor }
}

export default function DisplayCard({ name }: DisplayCardProps) {
  const { startColor, endColor } = generateGradientColors(name)
  const gradientStyle = `linear-gradient(135deg, ${startColor}, ${endColor})`
  const initials = name.charAt(0).toUpperCase()

  // Base card styles
  const cardClasses = [
    'display-card',
    'relative',
    'overflow-hidden',
    'rounded-xl',
    'bg-gradient-to-br from-surface to-surface-elevated',
    'border border-border',
    'p-4',
    'transition-all duration-300',
    'hover:border-primary',
    'hover:shadow-md hover:shadow-primary/20',
    'group',
  ].join(' ')

  // Background gradient overlay (appears on hover)
  const backgroundOverlayClasses = [
    'absolute',
    'inset-0',
    'opacity-0',
    'group-hover:opacity-10',
    'transition-opacity duration-300',
  ].join(' ')

  // Avatar circle styles
  const avatarClasses = [
    'flex-shrink-0',
    'w-12 h-12',
    'rounded-full',
    'flex items-center justify-center',
    'text-white font-bold text-lg',
    'shadow-lg',
    'transition-transform duration-300',
    'group-hover:scale-110',
  ].join(' ')

  // Content container
  const contentClasses = [
    'relative',
    'z-10',
    'flex items-center gap-3',
  ].join(' ')

  // Title text styles
  const titleClasses = [
    'text-text-primary',
    'font-semibold',
    'text-sm',
    'truncate',
    'group-hover:text-primary',
    'transition-colors duration-300',
  ].join(' ')

  // Subtitle text styles
  const subtitleClasses = [
    'text-text-secondary',
    'text-xs',
    'mt-0.5',
  ].join(' ')

  // Arrow icon styles
  const arrowClasses = [
    'w-5 h-5',
    'text-text-muted',
    'group-hover:text-primary',
    'transition-all duration-300',
    'group-hover:translate-x-1',
  ].join(' ')

  // Shine effect overlay (sweeps across on hover)
  const shineClasses = [
    'absolute',
    'inset-0',
    '-translate-x-full',
    'group-hover:translate-x-full',
    'transition-transform duration-700',
    'bg-gradient-to-r from-transparent via-white/10 to-transparent',
  ].join(' ')

  return (
    <div className={cardClasses}>
      {/* Animated gradient background overlay */}
      <div
        className={backgroundOverlayClasses}
        style={{ background: gradientStyle }}
      />

      {/* Main content container */}
      <div className={contentClasses}>
        {/* Avatar circle with server initial */}
        <div
          className={avatarClasses}
          style={{ background: gradientStyle }}
        >
          {initials}
        </div>

        {/* Text content section */}
        <div className="flex-1 min-w-0">
          <h3 className={titleClasses}>
            {name}
          </h3>
          <p className={subtitleClasses}>
            Server
          </p>
        </div>

        {/* Arrow indicator icon */}
        <ChevronRightIcon className={arrowClasses} size={20} />
      </div>

      {/* Shine effect overlay */}
      <div className={shineClasses} />
    </div>
  )
}
