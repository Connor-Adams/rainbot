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

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-surface to-surface-elevated border border-border p-4 transition-all duration-300 hover:border-border-hover hover:shadow-lg hover:shadow-primary/20 group">
      {/* Animated gradient background overlay */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300"
        style={{ background: gradientStyle }}
      />

      {/* Main content container */}
      <div className="relative z-10 flex items-center gap-3">
        {/* Avatar circle with server initial */}
        <div
          className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-text-primary font-bold text-lg shadow-lg transition-transform duration-300 group-hover:scale-110"
          style={{ background: gradientStyle }}
        >
          {initials}
        </div>

        {/* Text content section */}
        <div className="flex-1 min-w-0">
          <h3 className="text-text-primary font-semibold text-sm truncate group-hover:text-primary transition-colors duration-300">
            {name}
          </h3>
          <p className="text-text-secondary text-xs mt-0.5">
            Server
          </p>
        </div>

        {/* Arrow indicator icon */}
        <ChevronRightIcon 
          size={20}
          className="text-text-muted group-hover:text-primary transition-all duration-300 group-hover:translate-x-1"
        />
      </div>

      {/* Shine effect overlay */}
      <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  )
}
