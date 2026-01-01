/**
 * Centralized Chart.js setup - import this once to register all components
 * This prevents multiple registrations which can cause issues
 */
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

// Only register once
let registered = false;

export function ensureChartJSRegistered() {
  if (registered) return;

  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
  );

  // Set global defaults to prevent infinite sizing issues
  ChartJS.defaults.responsive = true;
  ChartJS.defaults.maintainAspectRatio = true;
  ChartJS.defaults.animation = false; // Disable animations to prevent crashes

  registered = true;
}

// Auto-register on import
ensureChartJSRegistered();

export { ChartJS };
