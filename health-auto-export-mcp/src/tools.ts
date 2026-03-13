import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';

import { HealthApiClient } from './client.js';

export function registerTools(server: McpServer, client: HealthApiClient) {
  server.tool(
    'list_health_metrics',
    'List all available health metrics with record counts and date ranges',
    {},
    async () => {
      const data = await client.listMetrics();
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    'get_health_metric',
    'Get raw health metric data points, optionally filtered by date range',
    {
      metric: z.string().describe('Metric name (e.g. heart_rate, step_count, sleep_analysis)'),
      from: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      to: z.string().optional().describe('End date (YYYY-MM-DD)'),
    },
    async ({ metric, from, to }) => {
      const data = await client.getMetric(metric, from, to);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    'get_metric_summary',
    'Get aggregated summary statistics (avg, min, max, sum) for a health metric over a period',
    {
      metric: z.string().describe('Metric name (e.g. heart_rate, step_count, sleep_analysis)'),
      from: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      to: z.string().optional().describe('End date (YYYY-MM-DD)'),
    },
    async ({ metric, from, to }) => {
      const data = await client.getMetricSummary(metric, from, to);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    'get_latest_health_data',
    'Get the most recent N data points for a health metric',
    {
      metric: z.string().describe('Metric name (e.g. heart_rate, step_count, sleep_analysis)'),
      limit: z.number().optional().default(1).describe('Number of recent records to return (1-100)'),
    },
    async ({ metric, limit }) => {
      const data = await client.getLatestMetric(metric, limit);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    'get_workouts',
    'Get workout data, optionally filtered by date range or specific workout ID',
    {
      id: z.string().optional().describe('Specific workout ID to get detailed data'),
      startDate: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
      endDate: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
    },
    async ({ id, startDate, endDate }) => {
      const data = id
        ? await client.getWorkout(id)
        : await client.getWorkouts(startDate, endDate);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
