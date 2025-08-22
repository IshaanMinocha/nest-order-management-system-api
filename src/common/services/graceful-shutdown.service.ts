import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface ShutdownTask {
  name: string;
  priority: number; // Higher priority runs first
  task: () => Promise<void>;
  timeoutMs: number;
}

@Injectable()
export class GracefulShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(GracefulShutdownService.name);
  private shutdownTasks: ShutdownTask[] = [];
  private isShuttingDown = false;

  constructor(private readonly prisma: PrismaService) {
    this.setupSignalHandlers();
    this.registerDefaultTasks();
  }

  registerShutdownTask(
    name: string,
    task: () => Promise<void>,
    priority: number = 0,
    timeoutMs: number = 10000,
  ): void {
    this.shutdownTasks.push({
      name,
      task,
      priority,
      timeoutMs,
    });

    // Sort by priority (highest first)
    this.shutdownTasks.sort((a, b) => b.priority - a.priority);
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    this.logger.log(
      `Application shutdown initiated${signal ? ` by ${signal}` : ''}`,
    );

    const startTime = Date.now();

    try {
      // Execute shutdown tasks in priority order
      for (const shutdownTask of this.shutdownTasks) {
        await this.executeShutdownTask(shutdownTask);
      }

      const duration = Date.now() - startTime;
      this.logger.log(`Graceful shutdown completed in ${duration}ms`);
    } catch (error) {
      this.logger.error('Error during graceful shutdown', error);
    }
  }

  private async executeShutdownTask(shutdownTask: ShutdownTask): Promise<void> {
    const { name, task, timeoutMs } = shutdownTask;

    this.logger.log(`Executing shutdown task: ${name}`);

    try {
      // Execute task with timeout
      await Promise.race([
        task(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
            timeoutMs,
          ),
        ),
      ]);

      this.logger.log(`Shutdown task completed: ${name}`);
    } catch (error) {
      this.logger.error(`Shutdown task failed: ${name}`, error);
    }
  }

  private setupSignalHandlers(): void {
    // Handle different termination signals
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGQUIT'];

    signals.forEach((signal) => {
      process.on(signal, () => {
        this.logger.log(`Received ${signal}, initiating graceful shutdown`);
        this.onApplicationShutdown(signal)
          .then(() => {
            process.exit(0);
          })
          .catch((error) => {
            this.logger.error('Error during shutdown:', error);
            process.exit(1);
          });
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception', error);
      this.emergencyShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.emergencyShutdown('unhandledRejection');
    });
  }

  private async emergencyShutdown(reason: string): Promise<void> {
    this.logger.error(`Emergency shutdown triggered by: ${reason}`);

    try {
      // Try to close database connections quickly
      await Promise.race([
        this.prisma.$disconnect(),
        new Promise((resolve) => setTimeout(resolve, 5000)), // 5 second timeout
      ]);
    } catch (error) {
      this.logger.error('Error during emergency shutdown', error);
    }

    process.exit(1);
  }

  private registerDefaultTasks(): void {
    // Database connections cleanup
    this.registerShutdownTask(
      'database-cleanup',
      async () => {
        this.logger.log('Closing database connections...');
        await this.prisma.$disconnect();
      },
      100, // High priority
      15000, // 15 second timeout
    );

    // Complete pending transactions
    this.registerShutdownTask(
      'pending-transactions',
      async () => {
        this.logger.log('Waiting for pending transactions...');
        // In a real implementation, you might track active transactions
        // and wait for them to complete
        await new Promise((resolve) => setTimeout(resolve, 2000));
      },
      90,
      10000,
    );

    // Log shutdown metrics
    this.registerShutdownTask(
      'shutdown-metrics',
      () => {
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();

        this.logger.log('Final application metrics', {
          uptime: `${Math.round(uptime)}s`,
          memoryUsage: {
            heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
            rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
          },
        });
      },
      10, // Low priority
      5000,
    );
  }

  // Health check for shutdown process
  getShutdownStatus(): {
    isShuttingDown: boolean;
    registeredTasks: number;
    taskNames: string[];
  } {
    return {
      isShuttingDown: this.isShuttingDown,
      registeredTasks: this.shutdownTasks.length,
      taskNames: this.shutdownTasks.map((task) => task.name),
    };
  }
}
