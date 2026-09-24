import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/lib/api';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function YoutubeIngestSettings() {
  const queryClient = useQueryClient();
  const [removeProxyDialogOpen, setRemoveProxyDialogOpen] = useState(false);
  const [removeCookiesDialogOpen, setRemoveCookiesDialogOpen] = useState(false);

  const { data: youtubeCookies } = useQuery({
    queryKey: ['youtube-cookies'],
    queryFn: () => settingsApi.getYoutubeCookies().then((res) => res.data),
  });
  const { data: youtubeProxy } = useQuery({
    queryKey: ['youtube-proxy'],
    queryFn: () => settingsApi.getYoutubeProxy().then((res) => res.data),
  });

  // Focus fallbacks for the two ConfirmDialogs: a successful delete unmounts
  // the "Remove ..." button that opened the dialog, so focus has nowhere to go
  // back to. Point it at the still-mounted control next to it instead.
  const proxyInputRef = useRef<HTMLInputElement>(null);
  const uploadCookiesButtonRef = useRef<HTMLButtonElement>(null);

  const cookiesFileRef = useRef<HTMLInputElement>(null);
  const uploadCookiesMutation = useMutation({
    mutationFn: (file: File) => settingsApi.uploadYoutubeCookies(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['youtube-cookies'] });
    },
  });
  const deleteCookiesMutation = useMutation({
    mutationFn: () => settingsApi.deleteYoutubeCookies(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['youtube-cookies'] });
    },
  });

  const [proxyInput, setProxyInput] = useState('');
  const saveProxyMutation = useMutation({
    mutationFn: (url: string) => settingsApi.setYoutubeProxy(url),
    onSuccess: () => {
      setProxyInput('');
      queryClient.invalidateQueries({ queryKey: ['youtube-proxy'] });
    },
  });
  const deleteProxyMutation = useMutation({
    mutationFn: () => settingsApi.deleteYoutubeProxy(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['youtube-proxy'] });
    },
  });

  return (
    <>
      <div className="rounded-xl border border-border bg-surface-input p-4">
        <div className="text-sm font-semibold text-text-primary mb-1">YouTube proxy</div>
        <div className="text-xs text-text-secondary mb-4">
          YouTube blocks requests from datacenter IPs, which is what Railway runs on—that is the
          real cause of &quot;Sign in to confirm you&apos;re not a bot&quot;, and no cookie or
          player setting gets around it. Point yt-dlp at a proxy with a residential or mobile IP and
          the block goes away. Accepts <code>http</code>, <code>https</code>, <code>socks4</code>,{' '}
          <code>socks4a</code>, <code>socks5</code> and <code>socks5h</code>. Rainbot picks up a
          change within about five minutes.
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={proxyInputRef}
            type="password"
            className="input flex-1 min-w-[18rem]"
            placeholder="socks5://user:password@host:1080"
            value={proxyInput}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setProxyInput(e.target.value)}
            aria-label="Proxy URL"
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => saveProxyMutation.mutate(proxyInput)}
            disabled={saveProxyMutation.isPending || proxyInput.trim().length === 0}
          >
            {saveProxyMutation.isPending ? 'Saving...' : 'Save proxy'}
          </button>
          {youtubeProxy?.hasProxy && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setRemoveProxyDialogOpen(true)}
              disabled={deleteProxyMutation.isPending}
            >
              {deleteProxyMutation.isPending ? 'Removing...' : 'Remove proxy'}
            </button>
          )}
        </div>
        <div className="mt-2 text-xs text-text-secondary">
          {youtubeProxy?.hasProxy
            ? `✓ Using ${youtubeProxy.proxyUrl}`
            : 'No proxy set — going direct'}
        </div>
        {saveProxyMutation.isError && (
          <div className="mt-2 text-xs text-danger-light">
            {(saveProxyMutation.error as { response?: { data?: { error?: string } } })?.response
              ?.data?.error ?? 'Failed to save proxy'}
          </div>
        )}
        {saveProxyMutation.isSuccess && (
          <div className="mt-2 text-xs text-text-secondary">
            Proxy saved. Rainbot applies it within a few minutes.
          </div>
        )}
        {deleteProxyMutation.isError && (
          <div className="mt-2 text-xs text-danger-light">
            {(deleteProxyMutation.error as Error)?.message ?? 'Delete failed'}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface-input p-4">
        <div className="text-sm font-semibold text-text-primary mb-1">YouTube cookies</div>
        <div className="text-xs text-text-secondary mb-4">
          Fixes &quot;Sign in to confirm you&apos;re not a bot&quot; errors when playing YouTube.
          Export cookies from your browser (extension like &quot;Get cookies.txt LOCALLY&quot;)
          while logged into YouTube, then upload the .txt file. Cookies last a few weeks—re-upload
          when playback fails again.
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={cookiesFileRef}
            type="file"
            accept=".txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                uploadCookiesMutation.mutate(file);
                e.target.value = '';
              }
            }}
            aria-label="Upload cookies file"
          />
          <button
            ref={uploadCookiesButtonRef}
            type="button"
            className="btn btn-secondary"
            onClick={() => cookiesFileRef.current?.click()}
            disabled={uploadCookiesMutation.isPending}
          >
            {uploadCookiesMutation.isPending ? 'Uploading...' : 'Upload cookies (.txt)'}
          </button>
          {youtubeCookies?.hasCookies && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setRemoveCookiesDialogOpen(true)}
              disabled={deleteCookiesMutation.isPending}
            >
              {deleteCookiesMutation.isPending ? 'Removing...' : 'Remove cookies'}
            </button>
          )}
          <span className="text-xs text-text-secondary">
            {youtubeCookies?.hasCookies ? '✓ Cookies configured' : 'No cookies set'}
          </span>
        </div>
        {uploadCookiesMutation.isSuccess && (
          <div className="mt-2 text-xs text-text-secondary">
            Cookies saved. Rainbot will use them on next startup or fetch.
          </div>
        )}
        {uploadCookiesMutation.isError && (
          <div className="mt-2 text-xs text-danger-light">
            {(
              uploadCookiesMutation.error as {
                response?: { data?: { error?: string } };
                message?: string;
              }
            )?.response?.data?.error ??
              (uploadCookiesMutation.error as Error)?.message ??
              'Upload failed'}
          </div>
        )}
        {deleteCookiesMutation.isError && (
          <div className="mt-2 text-xs text-danger-light">
            {(deleteCookiesMutation.error as Error)?.message ?? 'Delete failed'}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={removeProxyDialogOpen}
        title="Remove the YouTube proxy?"
        description="Playback will fall back to direct connections, which may be rate-limited."
        restoreFocusRef={proxyInputRef}
        onCancel={() => setRemoveProxyDialogOpen(false)}
        onConfirm={() => {
          setRemoveProxyDialogOpen(false);
          deleteProxyMutation.mutate();
        }}
      />
      <ConfirmDialog
        open={removeCookiesDialogOpen}
        title="Remove the YouTube cookies?"
        description="Age-restricted and members-only videos will stop playing until new cookies are uploaded."
        restoreFocusRef={uploadCookiesButtonRef}
        onCancel={() => setRemoveCookiesDialogOpen(false)}
        onConfirm={() => {
          setRemoveCookiesDialogOpen(false);
          deleteCookiesMutation.mutate();
        }}
      />
    </>
  );
}
