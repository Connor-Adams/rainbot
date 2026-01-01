# Recharts Migration

## Required Package Installation

Run the following command to install Recharts and remove Chart.js:

```bash
cd ui
npm uninstall chart.js react-chartjs-2
npm install recharts
```

## Migration Completed

All 16 stats components have been converted from Chart.js to Recharts:

### Components Converted:
1. ApiLatencyStats.tsx - Line charts
2. CommandsStats.tsx - Bar and Pie charts
3. EngagementStats.tsx - Mixed charts
4. ErrorsStats.tsx - Bar and Doughnut charts
5. GuildEventsStats.tsx - Bar charts
6. InteractionsStats.tsx - Bar charts
7. PerformanceStats.tsx - Line charts
8. QueueStats.tsx - Bar charts
9. RetentionStats.tsx - Line charts
10. SearchStats.tsx - Bar charts
11. SessionsStats.tsx - Line and Bar charts
12. SoundsStats.tsx - Bar and Pie charts
13. TimeStats.tsx - Line charts
14. UserSessionsStats.tsx - Line charts
15. UserTracksStats.tsx - Bar charts
16. WebAnalyticsStats.tsx - Line charts

### Benefits of Recharts:
- Better React integration (no registration needed)
- Cleaner API
- Smaller bundle size
- Better TypeScript support
- More composable and declarative
- Semantic color tokens already applied
