import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';

export default function BotOperations() {
  const [deployMessage, setDeployMessage] = useState<string | null>(null);

  const deployCommandsMutation = useMutation({
    mutationFn: () => adminApi.deployCommands(),
    onSuccess: (res) => {
      setDeployMessage(res.data?.message ?? `Deployed ${res.data?.count ?? 0} command(s).`);
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      setDeployMessage(err.response?.data?.error ?? err.message ?? 'Deploy failed.');
    },
  });

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
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleDeployCommands}
        disabled={deployCommandsMutation.isPending}
      >
        {deployCommandsMutation.isPending ? 'Deploying...' : 'Redeploy commands'}
      </button>
      {deployCommandsMutation.isError && deployMessage && (
        <div className="mt-3 text-xs text-danger-light">{deployMessage}</div>
      )}
      {deployCommandsMutation.isSuccess && deployMessage && (
        <div className="mt-3 text-xs text-text-secondary">{deployMessage}</div>
      )}
    </div>
  );
}
