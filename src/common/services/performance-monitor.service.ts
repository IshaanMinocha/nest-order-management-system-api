import { Injectable, Logger } from '@nestjs/common';

interface PerformanceMetrics {
  responseTime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  timestamp: Date;
  endpoint: string;
  statusCode: number;
  requestId: string;
}

interface AggregatedMetrics {
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestCount: number;
  errorCount: number;
  errorRate: number;
  memoryUsageMB: number;
  cpuUsagePercent: number;
}

@Injectable()
export class PerformanceMonitorService {
  private readonly logger = new Logger(PerformanceMonitorService.name);
  private metrics: PerformanceMetrics[] = [];
  private readonly maxMetricsHistory = 10000; // Keep last 10k requests
  private readonly alertThresholds = {
    responseTime: 5000, // 5 seconds
    errorRate: 0.1, // 10%
    memoryUsage: 500 * 1024 * 1024, // 500MB
    cpuUsage: 80, // 80%
  };

  recordMetric(
    endpoint: string,
    responseTime: number,
    statusCode: number,
    requestId: string,
  ): void {
    const metric: PerformanceMetrics = {
      responseTime,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      timestamp: new Date(),
      endpoint,
      statusCode,
      requestId,
    };

    this.metrics.push(metric);

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }

    // Check for performance alerts
    this.checkPerformanceAlerts(metric);
  }

  getMetrics(timeWindowMinutes: number = 15): AggregatedMetrics {
    const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    const recentMetrics = this.metrics.filter((m) => m.timestamp >= cutoffTime);

    if (recentMetrics.length === 0) {
      return {
        avgResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        requestCount: 0,
        errorCount: 0,
        errorRate: 0,
        memoryUsageMB: 0,
        cpuUsagePercent: 0,
      };
    }

    const responseTimes = recentMetrics
      .map((m) => m.responseTime)
      .sort((a, b) => a - b);
    const errorCount = recentMetrics.filter((m) => m.statusCode >= 400).length;
    const latestMetric = recentMetrics[recentMetrics.length - 1];

    return {
      avgResponseTime:
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      p95ResponseTime:
        responseTimes[Math.floor(responseTimes.length * 0.95)] || 0,
      p99ResponseTime:
        responseTimes[Math.floor(responseTimes.length * 0.99)] || 0,
      requestCount: recentMetrics.length,
      errorCount,
      errorRate: errorCount / recentMetrics.length,
      memoryUsageMB: latestMetric.memoryUsage.heapUsed / 1024 / 1024,
      cpuUsagePercent: this.calculateCpuPercent(latestMetric.cpuUsage),
    };
  }

  getEndpointMetrics(
    endpoint: string,
    timeWindowMinutes: number = 15,
  ): AggregatedMetrics {
    const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    const endpointMetrics = this.metrics.filter(
      (m) => m.timestamp >= cutoffTime && m.endpoint === endpoint,
    );

    if (endpointMetrics.length === 0) {
      return {
        avgResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        requestCount: 0,
        errorCount: 0,
        errorRate: 0,
        memoryUsageMB: 0,
        cpuUsagePercent: 0,
      };
    }

    const responseTimes = endpointMetrics
      .map((m) => m.responseTime)
      .sort((a, b) => a - b);
    const errorCount = endpointMetrics.filter(
      (m) => m.statusCode >= 400,
    ).length;
    const latestMetric = endpointMetrics[endpointMetrics.length - 1];

    return {
      avgResponseTime:
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      p95ResponseTime:
        responseTimes[Math.floor(responseTimes.length * 0.95)] || 0,
      p99ResponseTime:
        responseTimes[Math.floor(responseTimes.length * 0.99)] || 0,
      requestCount: endpointMetrics.length,
      errorCount,
      errorRate: errorCount / endpointMetrics.length,
      memoryUsageMB: latestMetric.memoryUsage.heapUsed / 1024 / 1024,
      cpuUsagePercent: this.calculateCpuPercent(latestMetric.cpuUsage),
    };
  }

  getSlowestEndpoints(
    limit: number = 10,
  ): Array<{ endpoint: string; avgResponseTime: number }> {
    const endpointMap = new Map<string, number[]>();

    // Group by endpoint
    this.metrics.forEach((metric) => {
      if (!endpointMap.has(metric.endpoint)) {
        endpointMap.set(metric.endpoint, []);
      }
      endpointMap.get(metric.endpoint)!.push(metric.responseTime);
    });

    // Calculate averages and sort
    const endpointAvgs = Array.from(endpointMap.entries())
      .map(([endpoint, responseTimes]) => ({
        endpoint,
        avgResponseTime:
          responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      }))
      .sort((a, b) => b.avgResponseTime - a.avgResponseTime)
      .slice(0, limit);

    return endpointAvgs;
  }

  private checkPerformanceAlerts(metric: PerformanceMetrics): void {
    // Response time alert
    if (metric.responseTime > this.alertThresholds.responseTime) {
      this.logger.warn(`Slow response detected`, {
        endpoint: metric.endpoint,
        responseTime: metric.responseTime,
        requestId: metric.requestId,
        threshold: this.alertThresholds.responseTime,
      });
    }

    // Memory usage alert
    if (metric.memoryUsage.heapUsed > this.alertThresholds.memoryUsage) {
      this.logger.warn(`High memory usage detected`, {
        memoryUsageMB: metric.memoryUsage.heapUsed / 1024 / 1024,
        thresholdMB: this.alertThresholds.memoryUsage / 1024 / 1024,
        requestId: metric.requestId,
      });
    }

    // Error rate alert (check last 100 requests)
    const recent100 = this.metrics.slice(-100);
    if (recent100.length >= 50) {
      // Only check if we have enough data
      const errorRate =
        recent100.filter((m) => m.statusCode >= 400).length / recent100.length;
      if (errorRate > this.alertThresholds.errorRate) {
        this.logger.error(`High error rate detected`, {
          errorRate: Math.round(errorRate * 100),
          threshold: Math.round(this.alertThresholds.errorRate * 100),
          recentRequests: recent100.length,
        });
      }
    }
  }

  private calculateCpuPercent(cpuUsage: NodeJS.CpuUsage): number {
    // Simple CPU usage calculation (this is approximate)
    const totalCpuTime = cpuUsage.user + cpuUsage.system;
    return Math.min(100, (totalCpuTime / 1000000) * 100); // Convert microseconds to percentage
  }

  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: AggregatedMetrics;
    alerts: string[];
  } {
    const metrics = this.getMetrics(5); // Last 5 minutes
    const alerts: string[] = [];
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check thresholds
    if (metrics.p95ResponseTime > this.alertThresholds.responseTime) {
      alerts.push(
        `High response time: ${Math.round(metrics.p95ResponseTime)}ms`,
      );
      status = 'degraded';
    }

    if (metrics.errorRate > this.alertThresholds.errorRate) {
      alerts.push(`High error rate: ${Math.round(metrics.errorRate * 100)}%`);
      status = 'unhealthy';
    }

    if (
      metrics.memoryUsageMB >
      this.alertThresholds.memoryUsage / 1024 / 1024
    ) {
      alerts.push(`High memory usage: ${Math.round(metrics.memoryUsageMB)}MB`);
      status = 'degraded';
    }

    return { status, metrics, alerts };
  }
}
