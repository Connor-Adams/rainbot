import { Button } from '@/components/ui'
import { DiscordIcon } from '@/components/icons'
import { buildAuthUrl } from '@/lib/api'

export default function LoginPage() {
  const handleLogin = () => {
    window.location.href = buildAuthUrl('/auth/discord')
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-8 animate-fade-in">
      <div className="flex flex-col items-center gap-8 max-w-md w-full text-center">
        <div className="flex flex-col items-center gap-4">
          <span className="text-7xl animate-float">🌧️</span>
          <h1 className="text-4xl font-bold gradient-text">Rainbot</h1>
        </div>
        
        <p className="text-lg text-text-secondary leading-relaxed">
          Connect to Discord to access the music bot dashboard
        </p>
        
        <Button
          onClick={handleLogin}
          variant="primary"
          size="lg"
          icon={<DiscordIcon size={20} />}
          className="w-full max-w-xs"
        >
          Login with Discord
        </Button>
        
        <p className="text-sm text-text-muted">
          Secure authentication via Discord OAuth2
        </p>
      </div>
    </div>
  )
}

