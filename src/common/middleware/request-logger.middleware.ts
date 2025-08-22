import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('RequestLogger');

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const { method, originalUrl, headers } = req;
    const requestId = (req as any).requestId;
    const correlationId = (req as any).correlationId;
    const userAgent = headers['user-agent'] || 'Unknown';
    const logger = this.logger; // Capture logger reference
    const getClientIp = this.getClientIp.bind(this); // Capture method reference

    // Log incoming request with sanitized data
    logger.log({
      type: 'request_start',
      requestId,
      correlationId,
      method,
      url: originalUrl,
      ip: getClientIp(req),
      userAgent,
      contentLength: headers['content-length'] || 0,
      timestamp: new Date().toISOString(),
    });

    // Override res.end to log response
    const originalEnd = res.end.bind(res);
    (res as any).end = function (
      chunk?: any,
      encoding?: any,
      cb?: () => void,
    ): any {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;
      const contentLength = res.getHeader('content-length') || 0;

      // Log response details
      const responseData = {
        type: 'request_complete',
        requestId,
        correlationId,
        method,
        url: originalUrl,
        statusCode,
        duration,
        contentLength,
        ip: getClientIp(req),
        timestamp: new Date().toISOString(),
      };

      try {
        // Use proper logger methods with captured reference
        if (statusCode >= 500) {
          logger.error(responseData);
        } else if (statusCode >= 400) {
          logger.warn(responseData);
        } else if (statusCode >= 300) {
          logger.warn(responseData);
        } else {
          logger.log(responseData);
        }
      } catch (error) {
        // Fallback logging in case of logger issues
        console.error('Logger error:', error);
        console.log('Response data:', responseData);
      }

      // Call original end method with proper arguments
      if (typeof chunk === 'function') {
        return originalEnd(chunk);
      } else if (typeof encoding === 'function') {
        return originalEnd(chunk, encoding);
      } else {
        return originalEnd(chunk, encoding, cb);
      }
    };

    next();
  }

  private getClientIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }
}
