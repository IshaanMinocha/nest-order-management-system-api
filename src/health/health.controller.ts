import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { PerformanceMonitorService } from '../common/services/performance-monitor.service';
import { CircuitBreakerService } from '../common/services/circuit-breaker.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly performanceMonitor: PerformanceMonitorService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Check application health' })
  @ApiResponse({ status: 200, description: 'Application is healthy' })
  @ApiResponse({ status: 503, description: 'Application is unhealthy' })
  async check() {
    return this.healthService.check();
  }

  @Get('detailed')
  @ApiOperation({ summary: 'Get detailed health information' })
  @ApiResponse({ status: 200, description: 'Detailed health information' })
  async detailed() {
    return this.healthService.getDetailedHealth();
  }

  @Get('performance')
  @ApiOperation({ summary: 'Get performance metrics' })
  @ApiResponse({ status: 200, description: 'Performance metrics' })
  @ApiQuery({
    name: 'timeWindow',
    required: false,
    description: 'Time window in minutes',
    example: 15,
  })
  performance(@Query('timeWindow') timeWindow?: string): any {
    const windowMinutes = timeWindow ? parseInt(timeWindow, 10) : 15;
    const metrics = this.performanceMonitor.getMetrics(windowMinutes);
    const healthStatus = this.performanceMonitor.getHealthStatus();
    const slowestEndpoints = this.performanceMonitor.getSlowestEndpoints();

    return {
      metrics,
      healthStatus,
      slowestEndpoints,
      timeWindowMinutes: windowMinutes,
    };
  }

  @Get('circuits')
  @ApiOperation({ summary: 'Get circuit breaker status' })
  @ApiResponse({ status: 200, description: 'Circuit breaker status' })
  circuits(): any {
    return this.circuitBreaker.getAllCircuitStatuses();
  }
}
