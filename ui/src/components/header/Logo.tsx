import { Link } from 'react-router-dom';

export default function Logo() {
  return (
    <Link
      to="/player"
      className="flex items-center gap-3 flex-shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span className="text-3xl" aria-hidden>
        🌧️
      </span>
      <h1 className="text-2xl font-bold gradient-text">Rainbot</h1>
    </Link>
  );
}
