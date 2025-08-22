import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RateLimiterService } from '../services/rate-limiter.service';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyPrefix?: string;
}

const ADVANCED_RATE_LIMIT_KEY = 'advancedRateLimit';

export const AdvancedRateLimit = (options: RateLimitOptions) => {
  return (
    target: any,
    propertyKey?: string,
    descriptor?: PropertyDescriptor,
  ) => {
    if (descriptor) {
      Reflect.defineMetadata(
        ADVANCED_RATE_LIMIT_KEY,
        options,
        descriptor.value,
      );
    } else {
      Reflect.defineMetadata(ADVANCED_RATE_LIMIT_KEY, options, target);
    }
  };
};

@Injectable()
export class AdvancedRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(AdvancedRateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimiterService: RateLimiterService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const handler = context.getHandler();
    const controller = context.getClass();

    // Get rate limit options from decorator
    const options =
      this.reflector.get<RateLimitOptions>(ADVANCED_RATE_LIMIT_KEY, handler) ||
      this.reflector.get<RateLimitOptions>(ADVANCED_RATE_LIMIT_KEY, controller);

    if (!options) {
      return true; // No rate limiting configured
    }

    const keyPrefix = options.keyPrefix || 'api';
    const identifier = this.rateLimiterService.generateKey(request, keyPrefix);

    const result = this.rateLimiterService.checkRateLimit(identifier, options);

    // Add rate limit headers
    response.setHeader('X-RateLimit-Limit', result.limit);
    response.setHeader('X-RateLimit-Remaining', result.remaining);
    response.setHeader(
      'X-RateLimit-Reset',
      new Date(result.resetTime).toISOString(),
    );

    if (!result.allowed) {
      if (result.retryAfter) {
        response.setHeader('Retry-After', result.retryAfter);
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: result.retryAfter,
          limit: result.limit,
          resetTime: new Date(result.resetTime).toISOString(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
