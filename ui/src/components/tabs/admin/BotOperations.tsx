import { useState } from 'react';
import { useIsMutating, useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Button } from '@/components/ui';

// Stable mutation key so an in-flight redeploy stays visible in the query
// client's mutation cache after this section unmounts (switching admin
// sub-tabs unmounts it), keeping the button disabled on remount.
const DEPLOY_COMMANDS_KEY = ['admin', 'bot', 'deploy-commands'] as const;

export default function BotOperations() {
  const [deployMessage, setDeployMessage] = useState<string | null>(null);

  const deployCommandsMutation = useMutation({
    mutationKey: DEPLOY_COMMANDS_KEY,
    mutationFn: () => adminApi.deployCommands(),
    onSuccess: (res) => {
      setDeployMessage(res.data?.message ?? `Deployed ${res.data?.count ?? 0} command(s).`);
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      setDeployMessage(err.response?.data?.error ?? err.message ?? 'Deploy failed.');
    },
  });

  // Live from the mutation cache, so it survives this section unmounting.
  const deployRunning = useIsMutating({ mutationKey: DEPLOY_COMMANDS_KEY }) > 0;

  const handleDeployCommands = () => {
    setDeployMessage(null);
    deployCommandsMutation.mutate();
  };

  return (
    <div className="rounded-xl border border-border bg-surface-input p-4">
      <div className="text-sm font-semibold text-text-primary mb-1">Redeploy slash commands</div>
      <div className="text-xs text-text-secondary mb-4">
        Re-register Discord slash commands with Discord. Use this after adding or changing commands
        so they appear in your server (e.g. after a new chat command).
      </div>
      <Button
        type="button"
        variant="primary"
        onClick={handleDeployCommands}
        disabled={deployRunning}
      >
        {deployRunning ? 'Deploying...' : 'Redeploy commands'}
      </Button>
      {deployCommandsMutation.isError && deployMessage && (
        <div className="mt-3 text-xs text-danger-light">{deployMessage}</div>
      )}
      {deployCommandsMutation.isSuccess && deployMessage && (
        <div className="mt-3 text-xs text-text-secondary">{deployMessage}</div>
      )}
    </div>
  );
}
