import { Injectable, Logger } from '@nestjs/common';

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  timeoutMs: number; // Time to wait before attempting reset
  monitoringPeriodMs: number; // Period to monitor failures
  slowCallDurationThreshold: number; // Slow call threshold in ms
  slowCallRateThreshold: number; // Percentage of slow calls to trigger
}

interface CircuitMetrics {
  failures: number;
  successes: number;
  timeouts: number;
  slowCalls: number;
  lastFailureTime: number;
  state: CircuitState;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private circuits = new Map<string, CircuitMetrics>();

  private readonly defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    timeoutMs: 60000, // 1 minute
    monitoringPeriodMs: 300000, // 5 minutes
    slowCallDurationThreshold: 5000, // 5 seconds
    slowCallRateThreshold: 0.5, // 50%
  };

  async executeWithCircuitBreaker<T>(
    circuitName: string,
    operation: () => Promise<T>,
    config?: Partial<CircuitBreakerConfig>,
  ): Promise<T> {
    const effectiveConfig = { ...this.defaultConfig, ...config };
    const metrics = this.getOrCreateCircuit(circuitName);

    // Check if circuit is open
    if (metrics.state === CircuitState.OPEN) {
      if (Date.now() - metrics.lastFailureTime < effectiveConfig.timeoutMs) {
        throw new Error(`Circuit breaker is OPEN for ${circuitName}`);
      } else {
        // Try to transition to half-open
        metrics.state = CircuitState.HALF_OPEN;
        this.logger.log(
          `Circuit breaker transitioning to HALF_OPEN for ${circuitName}`,
        );
      }
    }

    const startTime = Date.now();

    try {
      const result = await operation();
      const duration = Date.now() - startTime;

      this.recordSuccess(circuitName, duration, effectiveConfig);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordFailure(circuitName, duration, effectiveConfig);
      throw error;
    }
  }

  private getOrCreateCircuit(circuitName: string): CircuitMetrics {
    if (!this.circuits.has(circuitName)) {
      this.circuits.set(circuitName, {
        failures: 0,
        successes: 0,
        timeouts: 0,
        slowCalls: 0,
        lastFailureTime: 0,
        state: CircuitState.CLOSED,
      });
    }
    return this.circuits.get(circuitName)!;
  }

  private recordSuccess(
    circuitName: string,
    duration: number,
    config: CircuitBreakerConfig,
  ): void {
    const metrics = this.getOrCreateCircuit(circuitName);

    metrics.successes++;

    // Check if it's a slow call
    if (duration > config.slowCallDurationThreshold) {
      metrics.slowCalls++;
    }

    // If we're in half-open state and got a success, close the circuit
    if (metrics.state === CircuitState.HALF_OPEN) {
      metrics.state = CircuitState.CLOSED;
      metrics.failures = 0;
      this.logger.log(
        `Circuit breaker CLOSED for ${circuitName} after successful recovery`,
      );
    }

    // Check slow call rate
    this.checkSlowCallRate(circuitName, config);
  }

  private recordFailure(
    circuitName: string,
    duration: number,
    config: CircuitBreakerConfig,
  ): void {
    const metrics = this.getOrCreateCircuit(circuitName);

    metrics.failures++;
    metrics.lastFailureTime = Date.now();

    // Check if it's a slow call
    if (duration > config.slowCallDurationThreshold) {
      metrics.slowCalls++;
    }

    this.logger.warn(`Circuit breaker recorded failure for ${circuitName}`, {
      failures: metrics.failures,
      threshold: config.failureThreshold,
      duration,
    });

    // Open circuit if failure threshold exceeded
    if (
      metrics.failures >= config.failureThreshold ||
      metrics.state === CircuitState.HALF_OPEN
    ) {
      metrics.state = CircuitState.OPEN;
      this.logger.error(`Circuit breaker OPENED for ${circuitName}`, {
        failures: metrics.failures,
        threshold: config.failureThreshold,
      });
    }

    // Check slow call rate
    this.checkSlowCallRate(circuitName, config);
  }

  private checkSlowCallRate(
    circuitName: string,
    config: CircuitBreakerConfig,
  ): void {
    const metrics = this.getOrCreateCircuit(circuitName);
    const totalCalls = metrics.successes + metrics.failures;

    if (totalCalls > 10) {
      // Only check if we have enough data
      const slowCallRate = metrics.slowCalls / totalCalls;

      if (slowCallRate > config.slowCallRateThreshold) {
        this.logger.warn(`High slow call rate detected for ${circuitName}`, {
          slowCallRate: Math.round(slowCallRate * 100),
          threshold: Math.round(config.slowCallRateThreshold * 100),
          totalCalls,
          slowCalls: metrics.slowCalls,
        });

        // Consider opening circuit for high slow call rate
        if (slowCallRate > 0.8) {
          // 80% slow calls
          metrics.state = CircuitState.OPEN;
          metrics.lastFailureTime = Date.now();
          this.logger.error(
            `Circuit breaker OPENED for ${circuitName} due to high slow call rate`,
          );
        }
      }
    }
  }

  getCircuitStatus(circuitName: string): {
    state: CircuitState;
    metrics: CircuitMetrics;
    healthScore: number;
  } {
    const metrics = this.getOrCreateCircuit(circuitName);
    const totalCalls = metrics.successes + metrics.failures;

    let healthScore = 100;
    if (totalCalls > 0) {
      const successRate = metrics.successes / totalCalls;
      const slowCallRate = metrics.slowCalls / totalCalls;
      healthScore = Math.round(successRate * (1 - slowCallRate) * 100);
    }

    return {
      state: metrics.state,
      metrics: { ...metrics },
      healthScore,
    };
  }

  getAllCircuitStatuses(): Record<
    string,
    {
      state: CircuitState;
      metrics: CircuitMetrics;
      healthScore: number;
    }
  > {
    const statuses: Record<string, any> = {};

    for (const [circuitName] of this.circuits) {
      statuses[circuitName] = this.getCircuitStatus(circuitName);
    }

    return statuses;
  }

  resetCircuit(circuitName: string): void {
    const metrics = this.getOrCreateCircuit(circuitName);
    metrics.failures = 0;
    metrics.successes = 0;
    metrics.timeouts = 0;
    metrics.slowCalls = 0;
    metrics.state = CircuitState.CLOSED;
    metrics.lastFailureTime = 0;

    this.logger.log(`Circuit breaker manually reset for ${circuitName}`);
  }

  // Predefined circuit breaker configurations for different services
  static readonly CIRCUIT_CONFIGS = {
    DATABASE: {
      failureThreshold: 3,
      timeoutMs: 30000, // 30 seconds
      slowCallDurationThreshold: 2000, // 2 seconds
      slowCallRateThreshold: 0.3, // 30%
    },
    EXTERNAL_API: {
      failureThreshold: 5,
      timeoutMs: 60000, // 1 minute
      slowCallDurationThreshold: 5000, // 5 seconds
      slowCallRateThreshold: 0.5, // 50%
    },
    EMAIL_SERVICE: {
      failureThreshold: 10,
      timeoutMs: 120000, // 2 minutes
      slowCallDurationThreshold: 10000, // 10 seconds
      slowCallRateThreshold: 0.7, // 70%
    },
  };
}
