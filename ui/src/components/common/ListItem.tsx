import type { ReactNode } from 'react';

interface ListItemProps {
  icon: string;
  title: string;
  subtitle?: string | ReactNode;
  badge?: ReactNode;
  className?: string;
}

export default function ListItem({ icon, title, subtitle, badge, className = '' }: ListItemProps) {
  return (
    <div
      className={`
        flex items-center gap-3 px-3 py-3
        bg-surface-elevated rounded-lg border border-transparent
        transition-all duration-200
        hover:border-primary hover:bg-surface-hover hover:translate-x-1
        ${className}
      `}
    >
      <span className="text-xl flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary whitespace-nowrap overflow-hidden text-ellipsis mb-1">
          {title}
        </div>
        {subtitle && (
          <div className="text-xs text-text-muted flex items-center gap-2">{subtitle}</div>
        )}
      </div>
      {badge && <div className="flex-shrink-0">{badge}</div>}
    </div>
  );
}
