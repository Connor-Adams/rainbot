import { useEffect } from 'react';
import { DiscordIcon } from '@/components/icons';
import { buildAuthUrl, authBaseUrl } from '@/lib/api';

// Navigate to OAuth with cache-bust so browsers/proxies don't return 304 and block the redirect
function goToDiscordAuth() {
  const url = `${buildAuthUrl('/auth/discord')}?_=${Date.now()}`;
  console.info('[Login] Redirecting to OAuth:', url);
  window.location.href = url;
}

const linkButtonStyles =
  'inline-flex items-center justify-center gap-2 w-full max-w-sm px-6 py-3.5 text-base font-semibold rounded-xl transition-colors duration-200 cursor-pointer ' +
  'bg-gradient-to-r from-primary to-primary-dark text-text-primary shadow-sm hover:shadow-glow hover:-translate-y-0.5 active:translate-y-0 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export default function LoginPage() {
  useEffect(() => {
    const authUrl = buildAuthUrl('/auth/discord');
    const currentOrigin =
      typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    console.info('[Login] Auth config:', {
      authBaseUrl,
      currentOrigin,
      loginRedirectTarget: authUrl,
      sameOrigin: authBaseUrl.replace(/\/$/, '') === currentOrigin,
    });
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen p-6 sm:p-8 animate-fade-in">
      <div className="surface-panel w-full max-w-md p-8 sm:p-10 text-center shadow-lg shadow-black/20">
        <div className="flex flex-col items-center gap-4 sm:gap-5">
          <span className="text-5xl sm:text-6xl animate-float" aria-hidden>
            🌧️
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold gradient-text">Rainbot</h1>
        </div>

        <p className="mt-5 text-base text-text-secondary leading-relaxed">
          Connect with Discord to open your music bot dashboard.
        </p>

        <button
          type="button"
          onClick={goToDiscordAuth}
          className={`${linkButtonStyles} mt-8`}
          aria-label="Login with Discord"
        >
          <DiscordIcon size={20} />
          Login with Discord
        </button>

        <p className="mt-6 text-caption">Secure authentication via Discord OAuth2</p>
      </div>
    </div>
  );
}
