import { Injectable, Logger } from '@nestjs/common';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
  firstRequest: number;
}

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly store = new Map<string, RateLimitRecord>();
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000,
    );
  }

  checkRateLimit(
    identifier: string,
    config: RateLimitConfig,
  ): {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
  } {
    const now = Date.now();
    const key = identifier;

    let record = this.store.get(key);

    // Initialize or reset if window expired
    if (!record || now >= record.resetTime) {
      record = {
        count: 1,
        resetTime: now + config.windowMs,
        firstRequest: now,
      };
      this.store.set(key, record);

      return {
        allowed: true,
        limit: config.maxRequests,
        remaining: config.maxRequests - 1,
        resetTime: record.resetTime,
      };
    }

    // Check if limit exceeded
    if (record.count >= config.maxRequests) {
      this.logger.warn(`Rate limit exceeded for ${identifier}`, {
        identifier,
        count: record.count,
        limit: config.maxRequests,
        windowMs: config.windowMs,
      });

      return {
        allowed: false,
        limit: config.maxRequests,
        remaining: 0,
        resetTime: record.resetTime,
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      };
    }

    // Increment counter
    record.count++;

    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - record.count,
      resetTime: record.resetTime,
    };
  }

  // Predefined rate limit configurations for different endpoints
  static readonly CONFIGS = {
    // Authentication endpoints - strict limits
    LOGIN: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 5,
    },
    REGISTER: {
      windowMs: 60 * 60 * 1000, // 1 hour
      maxRequests: 3,
    },

    // Order management - moderate limits
    ORDER_CREATION: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 10,
    },
    ORDER_STATUS_UPDATE: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 20,
    },

    // Product management
    PRODUCT_CREATION: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 20,
    },
    STOCK_UPDATE: {
      windowMs: 30 * 1000, // 30 seconds
      maxRequests: 50,
    },

    // General API access
    GENERAL_READ: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 100,
    },

    // Admin operations - higher limits
    ADMIN_OPERATIONS: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 200,
    },

    // Global rate limit per IP
    GLOBAL_IP: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 1000,
    },
  };

  generateKey(req: any, prefix: string = 'default'): string {
    const user = req.user;
    const ip = this.getClientIp(req);

    // If authenticated, use user ID, otherwise use IP
    if (user?.id) {
      return `user:${user.id}:${prefix}`;
    }

    return `ip:${ip}:${prefix}`;
  }

  private getClientIp(req: any): string {
    return (
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      'unknown'
    );
  }

  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, record] of this.store.entries()) {
      if (now >= record.resetTime) {
        this.store.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(
        `Cleaned up ${cleanedCount} expired rate limit records`,
      );
    }
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
