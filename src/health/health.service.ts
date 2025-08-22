import { Injectable, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkMemory(),
      this.checkDisk(),
    ]);

    const results = checks.map((check, index) => ({
      service: ['database', 'memory', 'disk'][index],
      status: check.status === 'fulfilled' ? 'healthy' : 'unhealthy',
      error: check.status === 'rejected' ? check.reason?.message : undefined,
    }));

    const isHealthy = results.every((result) => result.status === 'healthy');

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: results,
      statusCode: isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    };
  }

  async getDetailedHealth() {
    const basic = await this.check();

    return {
      ...basic,
      details: {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        memory: {
          used: process.memoryUsage().heapUsed / 1024 / 1024,
          total: process.memoryUsage().heapTotal / 1024 / 1024,
          rss: process.memoryUsage().rss / 1024 / 1024,
          external: process.memoryUsage().external / 1024 / 1024,
        },
        cpu: process.cpuUsage(),
        environment: process.env.NODE_ENV,
      },
    };
  }

  private async checkDatabase(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      throw new Error(`Database check failed: ${error.message}`);
    }
  }

  private checkMemory(): void {
    const memory = process.memoryUsage();
    const maxMemory = 512 * 1024 * 1024; // 512 MB limit

    if (memory.heapUsed > maxMemory) {
      throw new Error(
        `Memory usage too high: ${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
      );
    }
  }

  private async checkDisk(): Promise<void> {
    // Basic disk check - in production you'd use a proper disk usage library
    const fs = await import('fs/promises');
    try {
      await fs.access('./');
    } catch (error) {
      throw new Error(`Disk access failed: ${error.message}`);
    }
  }
}
