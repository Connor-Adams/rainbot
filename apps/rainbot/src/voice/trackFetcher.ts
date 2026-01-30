import play from 'play-dl';
import type {
  SoundCloudPlaylist,
  SoundCloudTrack,
  SpotifyAlbum,
  SpotifyPlaylist,
  SpotifyTrack,
} from 'play-dl';
import type { Track } from '@rainbot/types/voice';
import { createLogger } from '@rainbot/shared';

const MAX_PLAYLIST_TRACKS = 100;
const log = createLogger('RAINBOT-TRACKS');

function buildSpotifyTitle(name: string, artists?: { name: string }[]): string {
  const artistNames = artists
    ?.map((artist) => artist.name)
    .filter(Boolean)
    .join(', ');
  return artistNames ? `${name} - ${artistNames}` : name;
}

export async function fetchTracks(source: string, _guildId?: string): Promise<Track[]> {
  const tracks: Track[] = [];
  log.debug(`fetchTracks source="${source}"`);

  if (source.startsWith('http://') || source.startsWith('https://')) {
    let url: URL;
    try {
      url = new URL(source);
    } catch {
      throw new Error('Invalid URL format');
    }

    let urlType: string | false | undefined;
    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
      urlType = url.searchParams.has('list') ? 'yt_playlist' : 'yt_video';
    } else if (url.hostname.includes('spotify.com') || url.hostname.includes('open.spotify.com')) {
      const pathParts = url.pathname.split('/').filter((p) => p);
      if (pathParts[0] === 'track') {
        urlType = 'sp_track';
      } else if (pathParts[0] === 'playlist') {
        urlType = 'sp_playlist';
      } else if (pathParts[0] === 'album') {
        urlType = 'sp_album';
      } else {
        urlType = await play.validate(source);
      }
    } else {
      urlType = await play.validate(source);
    }

    log.debug(`fetchTracks urlType=${urlType || 'unknown'}`);
    if (!urlType) {
      throw new Error('Unsupported URL. Supported: YouTube, SoundCloud, Spotify');
    }

    if (urlType === 'yt_video') {
      let cleanSource = source;
      if (url.hostname.includes('youtube.com') && url.searchParams.has('list')) {
        cleanSource = `https://www.youtube.com/watch?v=${url.searchParams.get('v')}`;
      }

      let title = 'Unknown Track';
      let duration: number | undefined;
      try {
        const videoInfo = await play.video_basic_info(cleanSource);
        if (videoInfo?.video_details) {
          title = videoInfo.video_details.title || 'Unknown Track';
          duration = videoInfo.video_details.durationInSec;
        }
      } catch {
        // Keep fallback title
      }

      tracks.push({
        title,
        url: cleanSource,
        duration,
        isLocal: false,
        sourceType: 'youtube',
      });
      log.debug(`fetchTracks youtube video title="${title}" duration=${duration ?? 'n/a'}`);
    } else if (urlType === 'yt_playlist') {
      const playlist = await play.playlist_info(source);
      const videos = await playlist.next(MAX_PLAYLIST_TRACKS);
      if (!videos.length) {
        throw new Error('No videos found in playlist');
      }
      videos.forEach((video) => {
        tracks.push({
          title: video.title || 'Unknown Track',
          url: video.url,
          duration: video.durationInSec,
          isLocal: false,
          sourceType: 'youtube',
        });
      });
      log.debug(`fetchTracks youtube playlist count=${tracks.length}`);
    } else if (urlType === 'sp_track' || urlType === 'sp_playlist' || urlType === 'sp_album') {
      const spotifyInfo = await play.spotify(source);
      if (spotifyInfo.type === 'track') {
        const track = spotifyInfo as SpotifyTrack;
        tracks.push({
          title: buildSpotifyTitle(track.name, track.artists),
          url: track.url,
          duration: track.durationInSec,
          isLocal: false,
          sourceType: 'spotify',
          spotifyId: track.id,
          spotifyUrl: track.url,
        });
      } else {
        const spotifyCollection = spotifyInfo as SpotifyPlaylist | SpotifyAlbum;
        const pageOne = spotifyCollection.page(1) ?? [];
        const spotifyTracks = pageOne.length ? pageOne : await spotifyCollection.all_tracks();
        spotifyTracks.slice(0, MAX_PLAYLIST_TRACKS).forEach((track: SpotifyTrack) => {
          tracks.push({
            title: buildSpotifyTitle(track.name, track.artists),
            url: track.url,
            duration: track.durationInSec,
            isLocal: false,
            sourceType: 'spotify',
            spotifyId: track.id,
            spotifyUrl: track.url,
          });
        });
      }
      log.debug(`fetchTracks spotify count=${tracks.length}`);
    } else if (urlType === 'so_track' || urlType === 'so_playlist') {
      const soundcloudInfo = await play.soundcloud(source);
      if (soundcloudInfo.type === 'track') {
        const track = soundcloudInfo as SoundCloudTrack;
        tracks.push({
          title: track.name || 'Unknown Track',
          url: track.permalink || track.url,
          duration: track.durationInSec,
          isLocal: false,
          sourceType: 'soundcloud',
        });
      } else {
        const playlistTracks = await (soundcloudInfo as SoundCloudPlaylist).all_tracks();
        playlistTracks.slice(0, MAX_PLAYLIST_TRACKS).forEach((track: SoundCloudTrack) => {
          tracks.push({
            title: track.name || 'Unknown Track',
            url: track.permalink || track.url,
            duration: track.durationInSec,
            isLocal: false,
            sourceType: 'soundcloud',
          });
        });
      }
      log.debug(`fetchTracks soundcloud count=${tracks.length}`);
    } else {
      tracks.push({
        title: 'Unknown Track',
        url: source,
        isLocal: false,
        sourceType: 'other',
      });
      log.debug(`fetchTracks fallback urlType=${urlType}`);
    }

    return tracks;
  }

  // Treat as search query
  log.debug(`Searching YouTube for: "${source}"`);
  const ytResults = await play.search(source, { limit: 1 });
  const result = ytResults?.[0];
  if (!result) {
    throw new Error(`No results found for: ${source}`);
  }
  tracks.push({
    title: result.title || source,
    url: result.url,
    duration: result.durationInSec || undefined,
    isLocal: false,
    sourceType: 'youtube',
  });
  log.debug(`fetchTracks search result title="${tracks[0]?.title}" url="${tracks[0]?.url}"`);

  return tracks;
}
