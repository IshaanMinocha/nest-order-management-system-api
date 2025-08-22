import { Global, Module } from '@nestjs/common';
import { BusinessRulesService } from './services/business-rules.service';
import { PerformanceMonitorService } from './services/performance-monitor.service';
import { CircuitBreakerService } from './services/circuit-breaker.service';
import { AuditLoggerService } from './services/audit-logger.service';
import { GracefulShutdownService } from './services/graceful-shutdown.service';
import { RateLimiterService } from './services/rate-limiter.service';

@Global()
@Module({
  providers: [
    BusinessRulesService,
    PerformanceMonitorService,
    CircuitBreakerService,
    AuditLoggerService,
    GracefulShutdownService,
    RateLimiterService,
  ],
  exports: [
    BusinessRulesService,
    PerformanceMonitorService,
    CircuitBreakerService,
    AuditLoggerService,
    GracefulShutdownService,
    RateLimiterService,
  ],
})
export class CommonModule {}
