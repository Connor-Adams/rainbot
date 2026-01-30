import { useEffect, useState } from 'react';
import api from '../lib/api';

type SoundRow = {
  sound_name: string;
  is_soundboard: boolean;
  play_count: number;
  last_played: string | null;
  avg_duration: number | null;
};

export default function UserSounds({ userId, guildId }: { userId: string; guildId?: string }) {
  const [loading, setLoading] = useState(false);
  const [sounds, setSounds] = useState<SoundRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    // Defer setting loading to avoid synchronous setState in effect
    Promise.resolve().then(() => setLoading(true));

    api
      .get('/stats/user-sounds', { params: { userId, guildId } })
      .then((res) => {
        setSounds(res.data.sounds || []);
      })
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [userId, guildId]);

  if (!userId) return <div>Select a user to view sounds</div>;
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h3>User Sounds</h3>
      {sounds.length === 0 ? (
        <div>No sounds found</div>
      ) : (
        <ul>
          {sounds.map((s) => (
            <li key={`${s.sound_name}-${s.is_soundboard}`}>
              <strong>{s.sound_name}</strong> — plays: {s.play_count} — last: {s.last_played} — avg:{' '}
              {s.avg_duration}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
