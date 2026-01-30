import { ChevronRightIcon } from './icons';

interface DisplayCardProps {
  name: string;
}

/**
 * Generates a consistent color gradient based on a string value.
 * Same input always produces the same colors.
 */
function generateGradientColors(text: string) {
  // Create a hash from the text for consistent color generation
  const hash = text.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);

  // Convert hash to a hue value (0-360)
  const hue = Math.abs(hash) % 360;

  // Create two colors with a 60-degree hue difference for the gradient
  const startColor = `hsl(${hue}, 70%, 50%)`;
  const endColor = `hsl(${(hue + 60) % 360}, 70%, 50%)`;

  return { startColor, endColor };
}

export default function DisplayCard({ name }: DisplayCardProps) {
  const { startColor, endColor } = generateGradientColors(name);
  const gradientStyle = `linear-gradient(135deg, ${startColor}, ${endColor})`;
  const initials = name.charAt(0).toUpperCase();

  // Base card styles
  const cardClasses = [
    'display-card',
    'relative',
    'overflow-hidden',
    'rounded-xl',
    'bg-surface',
    'border border-border',
    'p-4',
    'transition-colors duration-200',
    'hover:border-border-hover',
  ].join(' ');

  // Avatar circle styles
  const avatarClasses = [
    'flex-shrink-0',
    'w-10 h-10',
    'rounded-full',
    'flex items-center justify-center',
    'text-text-primary font-semibold text-base',
  ].join(' ');

  // Content container
  const contentClasses = ['relative', 'z-10', 'flex items-center gap-3'].join(' ');

  // Title text styles
  const titleClasses = ['text-text-primary', 'font-semibold', 'text-sm', 'truncate'].join(' ');

  // Subtitle text styles
  const subtitleClasses = ['text-text-secondary', 'text-xs', 'mt-0.5'].join(' ');

  // Arrow icon styles
  const arrowClasses = ['w-4 h-4', 'text-text-muted'].join(' ');

  return (
    <div className={cardClasses}>
      {/* Main content container */}
      <div className={contentClasses}>
        {/* Avatar circle with server initial */}
        <div className={avatarClasses} style={{ background: gradientStyle }}>
          {initials}
        </div>

        {/* Text content section */}
        <div className="flex-1 min-w-0">
          <h3 className={titleClasses}>{name}</h3>
          <p className={subtitleClasses}>Server</p>
        </div>

        {/* Arrow indicator icon */}
        <ChevronRightIcon className={arrowClasses} size={16} />
      </div>
    </div>
  );
}
