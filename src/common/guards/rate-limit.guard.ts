import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

const RATE_LIMIT_KEY = 'rateLimit';

export const RateLimit = (options: RateLimitOptions) => {
  return (
    target: any,
    propertyKey?: string,
    descriptor?: PropertyDescriptor,
  ) => {
    if (descriptor) {
      Reflect.defineMetadata(RATE_LIMIT_KEY, options, descriptor.value);
    } else {
      Reflect.defineMetadata(RATE_LIMIT_KEY, options, target);
    }
  };
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private requestCounts = new Map<
    string,
    { count: number; resetTime: number }
  >();

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const handler = context.getHandler();
    const controller = context.getClass();

    // Get rate limit options from decorator
    const options =
      this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, handler) ||
      this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, controller);

    if (!options) {
      return true; // No rate limiting configured
    }

    const key = this.generateKey(request);
    const now = Date.now();

    // Clean old entries
    this.cleanupOldEntries();

    const record = this.requestCounts.get(key);

    if (!record || record.resetTime < now) {
      // Initialize or reset the counter
      this.requestCounts.set(key, {
        count: 1,
        resetTime: now + options.windowMs,
      });
      return true;
    }

    if (record.count >= options.maxRequests) {
      this.logger.warn(
        `Rate limit exceeded for ${key}. Current: ${record.count}/${options.maxRequests}`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((record.resetTime - now) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Increment counter
    record.count++;
    return true;
  }

  private generateKey(request: Request): string {
    // Use combination of IP and user ID (if authenticated)
    const ip = request.ip || request.connection.remoteAddress || 'unknown';
    const userId = (request as any).user?.id;
    const route = `${request.method}:${request.route?.path || request.path}`;

    return userId ? `user:${userId}:${route}` : `ip:${ip}:${route}`;
  }

  private cleanupOldEntries(): void {
    const now = Date.now();
    for (const [key, record] of this.requestCounts.entries()) {
      if (record.resetTime < now) {
        this.requestCounts.delete(key);
      }
    }
  }
}

// Predefined rate limit configurations
export const RATE_LIMITS = {
  LOGIN: { windowMs: 15 * 60 * 1000, maxRequests: 5 }, // 5 attempts per 15 minutes
  ORDER_CREATION: { windowMs: 60 * 1000, maxRequests: 10 }, // 10 orders per minute
  STOCK_UPDATE: { windowMs: 60 * 1000, maxRequests: 20 }, // 20 updates per minute
  GENERAL_API: { windowMs: 60 * 1000, maxRequests: 100 }, // 100 requests per minute
};
