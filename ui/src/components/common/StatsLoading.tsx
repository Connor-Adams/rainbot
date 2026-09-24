import { Spinner, Text } from '@connor-adams/designsystem';

interface StatsLoadingProps {
  message?: string;
}

export default function StatsLoading({ message = 'Loading statistics...' }: StatsLoadingProps) {
  return (
    <div className="stats-loading flex flex-col items-center gap-3 py-12">
      <Spinner tone="muted" />
      <Text tone="muted">{message}</Text>
    </div>
  );
}
