import { Spinner, Text } from '@connor-adams/designsystem';

export default function LoadingOverlay() {
  return (
    <div className="loading-overlay fixed inset-0 bg-background/95 backdrop-blur-xl flex flex-col justify-center items-center gap-4 z-toast">
      <Spinner size="lg" tone="primary" />
      <Text tone="muted">Checking authentication...</Text>
    </div>
  );
}
