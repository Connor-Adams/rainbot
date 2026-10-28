import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@connor-adams/designsystem';
import { settingsApi } from '@/lib/api';

/** The worker reports within one track of YouTube rejecting the cookies. */
const POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * App-wide notice that YouTube no longer accepts the uploaded cookies. Shares
 * its query with the admin panel, so an upload there clears it at once.
 */
export default function YoutubeCookiesBanner() {
  const { data } = useQuery({
    queryKey: ['youtube-cookies'],
    queryFn: ({ signal }) => settingsApi.getYoutubeCookies({ signal }).then((res) => res.data),
    refetchInterval: POLL_INTERVAL_MS,
  });

  if (!data?.stale) return null;

  const since = data.staleSince ? new Date(data.staleSince).toLocaleString() : null;

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
      <Alert
        variant="warning"
        title="YouTube cookies need a refresh"
        action={
          <Link
            to="/admin?section=youtube"
            className="text-sm font-medium underline underline-offset-2"
          >
            Upload new cookies
          </Link>
        }
      >
        YouTube stopped accepting them{since ? ` (since ${since})` : ''}, so some tracks fail with
        &quot;Sign in to confirm you&apos;re not a bot&quot;.
      </Alert>
    </div>
  );
}
