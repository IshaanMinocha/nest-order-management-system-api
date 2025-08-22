import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly logger = new Logger('SecurityMiddleware');
  private readonly suspiciousPatterns = [
    // SQL Injection patterns
    /(\b(union|select|insert|update|delete|drop|exec|execute)\b)/i,
    /(--|\/\*|\*\/|;|'|")/,
    /(\b(or|and)\s+\d+\s*=\s*\d+)/i,

    // XSS patterns
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=\s*['"]/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /eval\s*\(/gi,

    // Path traversal
    /(\.\.[/\\]){2,}/,
    /([/\\])\.\.[/\\]/,

    // Command injection
    /(\||&|;|`|\$\(|\${)/,
    /(nc|netcat|wget|curl|python|perl|ruby|php)\s/i,
  ];

  use(req: Request, res: Response, next: NextFunction) {
    const requestId = (req as any).requestId;
    const ip = this.getClientIp(req);

    // Check for suspicious content in URL and query parameters
    if (this.containsSuspiciousContent(req.originalUrl)) {
      this.logger.error({
        type: 'security_violation',
        requestId,
        ip,
        violation: 'suspicious_url',
        url: req.originalUrl,
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString(),
      });

      return res.status(400).json({
        statusCode: 400,
        message: 'Bad Request',
        timestamp: new Date().toISOString(),
        path: req.url,
      });
    }

    // Check request headers for suspicious content
    const suspiciousHeaders = this.checkSuspiciousHeaders(req.headers);
    if (suspiciousHeaders.length > 0) {
      this.logger.warn({
        type: 'security_warning',
        requestId,
        ip,
        violation: 'suspicious_headers',
        headers: suspiciousHeaders,
        timestamp: new Date().toISOString(),
      });
    }

    // Add security headers
    this.addSecurityHeaders(res);

    next();
  }

  private containsSuspiciousContent(content: string): boolean {
    if (!content) return false;

    const decodedContent = decodeURIComponent(content).toLowerCase();
    return this.suspiciousPatterns.some((pattern) =>
      pattern.test(decodedContent),
    );
  }

  private checkSuspiciousHeaders(headers: Record<string, any>): string[] {
    const suspicious: string[] = [];

    // Check for suspicious user agents
    const userAgent = (headers['user-agent'] || '').toLowerCase();
    if (
      userAgent.includes('sqlmap') ||
      userAgent.includes('nmap') ||
      userAgent.includes('burp') ||
      userAgent.includes('nikto')
    ) {
      suspicious.push('user-agent');
    }

    // Check for suspicious referers
    const referer = (headers['referer'] || '').toLowerCase();
    if (this.containsSuspiciousContent(referer)) {
      suspicious.push('referer');
    }

    return suspicious;
  }

  private addSecurityHeaders(res: Response): void {
    // Additional security headers
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=()',
    );

    // Remove sensitive headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
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
