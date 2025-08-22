import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Request } from 'express';
import { PerformanceMonitorService } from '../services/performance-monitor.service';

@Injectable()
export class ErrorLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ErrorLoggingInterceptor.name);

  constructor(
    private readonly performanceMonitor?: PerformanceMonitorService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();
    const { method, url, body, query, params } = request;
    const userInfo = (request as any).user;
    const requestId = (request as any).requestId;
    const startTime = Date.now();

    // Log incoming request
    this.logger.log(
      `${method} ${url} - User: ${userInfo?.email || 'Anonymous'} - RequestID: ${requestId}`,
    );

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode;

        // Record performance metrics
        if (this.performanceMonitor) {
          this.performanceMonitor.recordMetric(
            `${method} ${url}`,
            duration,
            statusCode,
            requestId,
          );
        }

        // Log successful requests
        this.logger.log(
          `✓ ${method} ${url} - Success (${duration}ms) - RequestID: ${requestId}`,
        );
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        const statusCode = error.status || HttpStatus.INTERNAL_SERVER_ERROR;

        // Record performance metrics for errors too
        if (this.performanceMonitor) {
          this.performanceMonitor.recordMetric(
            `${method} ${url}`,
            duration,
            statusCode,
            requestId,
          );
        }

        // Enhanced error logging with context
        const errorDetails = {
          method,
          url,
          user: userInfo?.email || 'Anonymous',
          userId: userInfo?.id,
          requestId,
          duration,
          body: this.sanitizeBody(body),
          query,
          params,
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
            status: statusCode,
          },
        };

        // Different log levels based on error type
        if (error instanceof HttpException) {
          const status = error.getStatus();
          if (status >= 400 && status < 500) {
            this.logger.warn(`✗ Client Error: ${JSON.stringify(errorDetails)}`);
          } else {
            this.logger.error(
              `✗ Server Error: ${JSON.stringify(errorDetails)}`,
            );
          }
        } else {
          this.logger.error(
            `✗ Unhandled Error: ${JSON.stringify(errorDetails)}`,
          );
        }

        // Enhanced error response for better debugging (remove in production)
        if (process.env.NODE_ENV === 'development') {
          if (error instanceof HttpException) {
            const response = error.getResponse();
            if (typeof response === 'object') {
              (response as any).timestamp = new Date().toISOString();
              (response as any).path = url;
              (response as any).method = method;
            }
          }
        }

        return throwError(() => error);
      }),
    );
  }

  private sanitizeBody(body: any): any {
    if (!body) return body;

    const sensitiveFields = ['password', 'passwordHash', 'token', 'secret'];
    const sanitized = { ...body };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}
