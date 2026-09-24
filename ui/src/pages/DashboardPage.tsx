import { Navigate } from 'react-router-dom';

// Unreachable: App.tsx routes each tab directly under the Layout layout route.
// Kept as a redirect stub rather than deleted — file deletion is blocked in this environment.
export default function DashboardPage() {
  return <Navigate to="/player" replace />;
}
