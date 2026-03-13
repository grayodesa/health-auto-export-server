export class HealthApiClient {
  private baseUrl: string;
  private token: string;
  private timeout: number;

  constructor(baseUrl: string, token: string, timeout = 30000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.timeout = timeout;
  }

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          url.searchParams.set(key, value);
        }
      });
    }

    const response = await fetch(url.toString(), {
      headers: { 'api-key': this.token },
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`API error ${response.status}: ${body || response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async listMetrics() {
    return this.request<{ total: number; metrics: Array<{ name: string; count: number; firstDate: string | null; lastDate: string | null }> }>(
      '/api/metrics',
    );
  }

  async getMetric(metric: string, from?: string, to?: string) {
    const params: Record<string, string> = {};
    if (from) params.from = from;
    if (to) params.to = to;
    return this.request<unknown[]>(`/api/metrics/${metric}`, params);
  }

  async getMetricSummary(metric: string, from?: string, to?: string) {
    const params: Record<string, string> = {};
    if (from) params.from = from;
    if (to) params.to = to;
    return this.request<Record<string, unknown>>(`/api/metrics/${metric}/summary`, params);
  }

  async getLatestMetric(metric: string, limit?: number) {
    const params: Record<string, string> = {};
    if (limit) params.limit = String(limit);
    return this.request<unknown[]>(`/api/metrics/${metric}/latest`, params);
  }

  async getWorkouts(startDate?: string, endDate?: string) {
    const params: Record<string, string> = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return this.request<unknown[]>('/api/workouts', params);
  }

  async getWorkout(id: string) {
    return this.request<Record<string, unknown>>(`/api/workouts/${id}`);
  }
}
