import { DiscordIcon } from '@/components/icons';
import { buildAuthUrl } from '@/lib/api';

const discordAuthUrl = buildAuthUrl('/auth/discord');

const linkButtonStyles =
  'inline-flex items-center justify-center gap-2 w-full max-w-xs px-6 py-3 text-lg font-medium rounded-lg transition-all duration-200 ' +
  'bg-gradient-to-r from-primary to-primary-dark text-text-primary shadow-sm hover:shadow-glow hover:-translate-y-0.5 active:translate-y-0 ' +
  'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background';

export default function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-screen p-6 sm:p-8 animate-fade-in">
      <div className="flex flex-col items-center gap-6 sm:gap-8 max-w-md w-full text-center">
        <div className="flex flex-col items-center gap-3 sm:gap-4">
          <span className="text-6xl sm:text-7xl animate-float">🌧️</span>
          <h1 className="text-3xl sm:text-4xl font-bold gradient-text">Rainbot</h1>
        </div>

        <p className="text-base sm:text-lg text-text-secondary leading-relaxed">
          Connect to Discord to access the music bot dashboard
        </p>

        <a href={discordAuthUrl} className={linkButtonStyles} aria-label="Login with Discord">
          <DiscordIcon size={20} />
          Login with Discord
        </a>

        <p className="text-xs sm:text-sm text-text-muted">
          Secure authentication via Discord OAuth2
        </p>
      </div>
    </div>
  );
}
