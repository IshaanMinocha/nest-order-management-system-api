import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, UserRole } from '@prisma/client';

interface AuditContext {
  userId: number;
  userRole: UserRole;
  userEmail: string;
  requestId: string;
  correlationId: string;
  clientIp: string;
  userAgent: string;
  sessionId?: string;
}

interface AuditEvent {
  action: AuditAction;
  entityType: string;
  entityId?: number;
  previousValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  businessImpact?: string;
}

@Injectable()
export class AuditLoggerService {
  private readonly logger = new Logger(AuditLoggerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logEvent(context: AuditContext, event: AuditEvent): Promise<void> {
    try {
      // Create audit log entry in database
      await this.prisma.auditLog.create({
        data: {
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId || 0,
          oldValues: event.previousValues
            ? JSON.stringify(event.previousValues)
            : undefined,
          newValues: event.newValues
            ? JSON.stringify(event.newValues)
            : undefined,
          changedById: context.userId,
          ipAddress: context.clientIp,
          userAgent: context.userAgent,
        },
      });

      // Also log to application logger for immediate monitoring
      const logLevel = this.getLogLevel(event.riskLevel);
      this.logger[logLevel]('Audit Event', {
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        userId: context.userId,
        userEmail: context.userEmail,
        requestId: context.requestId,
        riskLevel: event.riskLevel,
        businessImpact: event.businessImpact,
        timestamp: new Date().toISOString(),
      });

      // Alert for critical events
      if (event.riskLevel === 'CRITICAL') {
        this.handleCriticalEvent(context, event);
      }
    } catch (error) {
      this.logger.error('Failed to log audit event', {
        error: error.message,
        context,
        event,
      });
    }
  }

  // Convenience methods for common audit events
  async logUserAction(
    context: AuditContext,
    action: AuditAction,
    details?: Partial<AuditEvent>,
  ): Promise<void> {
    await this.logEvent(context, {
      action,
      entityType: 'User',
      entityId: context.userId,
      riskLevel: this.determineUserActionRisk(action),
      ...details,
    });
  }

  async logOrderEvent(
    context: AuditContext,
    action: AuditAction,
    orderId: number,
    previousValues?: any,
    newValues?: any,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.logEvent(context, {
      action,
      entityType: 'Order',
      entityId: orderId,
      previousValues,
      newValues,
      metadata,
      riskLevel: this.determineOrderRisk(action, newValues),
      businessImpact: this.calculateOrderBusinessImpact(action, newValues),
    });
  }

  async logProductEvent(
    context: AuditContext,
    action: AuditAction,
    productId: number,
    previousValues?: any,
    newValues?: any,
  ): Promise<void> {
    await this.logEvent(context, {
      action,
      entityType: 'Product',
      entityId: productId,
      previousValues,
      newValues,
      riskLevel: this.determineProductRisk(action, newValues),
    });
  }

  async logStockEvent(
    context: AuditContext,
    action: AuditAction,
    productId: number,
    previousStock: number,
    newStock: number,
    reason?: string,
  ): Promise<void> {
    const stockChange = newStock - previousStock;
    const riskLevel =
      Math.abs(stockChange) > 10000
        ? 'HIGH'
        : Math.abs(stockChange) > 1000
          ? 'MEDIUM'
          : 'LOW';

    await this.logEvent(context, {
      action,
      entityType: 'Inventory',
      entityId: productId,
      previousValues: { stock: previousStock },
      newValues: { stock: newStock },
      metadata: {
        stockChange,
        reason,
        changePercentage:
          previousStock > 0 ? (stockChange / previousStock) * 100 : 0,
      },
      riskLevel: riskLevel as any,
      businessImpact: `Stock ${stockChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(stockChange)} units`,
    });
  }

  async logSecurityEvent(
    context: AuditContext,
    securityEventType: string,
    details: Record<string, any>,
  ): Promise<void> {
    await this.logEvent(context, {
      action: 'SECURITY_EVENT' as AuditAction,
      entityType: 'Security',
      metadata: {
        eventType: securityEventType,
        ...details,
      },
      riskLevel: 'CRITICAL',
      businessImpact: `Security event: ${securityEventType}`,
    });
  }

  async getAuditTrail(
    entityType: string,
    entityId: number,
    limit: number = 50,
  ): Promise<any[]> {
    return this.prisma.auditLog.findMany({
      where: {
        entityType,
        entityId,
      },
      include: {
        changedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  async getUserActivitySummary(
    userId: number,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<{
    totalActions: number;
    actionsByType: Record<string, number>;
    riskDistribution: Record<string, number>;
    suspiciousActivity: boolean;
  }> {
    const whereClause: any = { changedByUserId: userId };

    if (fromDate || toDate) {
      whereClause.createdAt = {};
      if (fromDate) whereClause.createdAt.gte = fromDate;
      if (toDate) whereClause.createdAt.lte = toDate;
    }

    const logs = await this.prisma.auditLog.findMany({
      where: whereClause,
      select: {
        action: true,
        createdAt: true,
      },
    });

    const actionsByType: Record<string, number> = {};
    const riskDistribution: Record<string, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };
    let suspiciousActivity = false;

    logs.forEach((log) => {
      // Count actions by type
      actionsByType[log.action] = (actionsByType[log.action] || 0) + 1;

      // Since we removed metadata from select, use LOW as default
      const riskLevel = 'LOW';
      riskDistribution[riskLevel]++;
    });

    // Check for unusual activity patterns
    const recentLogs = logs.filter(
      (log) => log.createdAt >= new Date(Date.now() - 24 * 60 * 60 * 1000),
    );

    if (recentLogs.length > 100) {
      // More than 100 actions in 24 hours
      suspiciousActivity = true;
    }

    return {
      totalActions: logs.length,
      actionsByType,
      riskDistribution,
      suspiciousActivity,
    };
  }

  private determineUserActionRisk(
    action: AuditAction,
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const riskMap: Record<string, 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> = {
      LOGIN: 'LOW',
      LOGOUT: 'LOW',
      CREATE: 'MEDIUM',
      UPDATE: 'MEDIUM',
      DELETE: 'HIGH',
      ADMIN_ACTION: 'HIGH',
      SECURITY_EVENT: 'CRITICAL',
    };

    return riskMap[action] || 'MEDIUM';
  }

  private determineOrderRisk(
    action: AuditAction,
    newValues?: any,
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (action === 'DELETE') return 'CRITICAL';

    if (newValues?.totalAmount) {
      const amount = parseFloat(newValues.totalAmount);
      if (amount > 100000) return 'CRITICAL';
      if (amount > 10000) return 'HIGH';
      if (amount > 1000) return 'MEDIUM';
    }

    return 'LOW';
  }

  private determineProductRisk(
    action: AuditAction,
    newValues?: any,
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (action === 'DELETE') return 'HIGH';
    if (newValues?.isActive === false) return 'MEDIUM';
    return 'LOW';
  }

  private calculateOrderBusinessImpact(
    action: AuditAction,
    newValues?: any,
  ): string {
    if (action === 'CREATE' && newValues?.totalAmount) {
      return `New order created with value $${newValues.totalAmount}`;
    }
    if (action === 'UPDATE' && newValues?.status) {
      return `Order status changed to ${newValues.status}`;
    }
    if (action === 'DELETE') {
      return 'Order deleted - potential revenue loss';
    }
    return `Order ${action.toLowerCase()}`;
  }

  private getLogLevel(riskLevel: string): 'log' | 'warn' | 'error' {
    switch (riskLevel) {
      case 'CRITICAL':
        return 'error';
      case 'HIGH':
        return 'error';
      case 'MEDIUM':
        return 'warn';
      default:
        return 'log';
    }
  }

  private handleCriticalEvent(context: AuditContext, event: AuditEvent): void {
    // In a real application, you might:
    // - Send notifications to administrators
    // - Trigger automated security responses
    // - Update monitoring dashboards
    // - Send to security information and event management (SIEM) systems

    this.logger.error('CRITICAL AUDIT EVENT DETECTED', {
      userId: context.userId,
      userEmail: context.userEmail,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      businessImpact: event.businessImpact,
      timestamp: new Date().toISOString(),
    });
  }
}
