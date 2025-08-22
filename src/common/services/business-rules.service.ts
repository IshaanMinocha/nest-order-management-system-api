import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus, UserRole } from '@prisma/client';

export interface OrderLimits {
  maxOrderValue: number;
  maxItemsPerOrder: number;
  maxQuantityPerItem: number;
  maxOrdersPerDay: number;
}

export interface StockValidation {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
}

@Injectable()
export class BusinessRulesService {
  private readonly logger = new Logger(BusinessRulesService.name);

  // Business rule configurations
  private readonly ORDER_LIMITS: Record<UserRole, OrderLimits> = {
    [UserRole.BUYER]: {
      maxOrderValue: 50000, // $50K per order
      maxItemsPerOrder: 50,
      maxQuantityPerItem: 10000,
      maxOrdersPerDay: 20,
    },
    [UserRole.SUPPLIER]: {
      maxOrderValue: 100000, // Suppliers can place larger orders
      maxItemsPerOrder: 100,
      maxQuantityPerItem: 50000,
      maxOrdersPerDay: 50,
    },
    [UserRole.ADMIN]: {
      maxOrderValue: 1000000, // No practical limit for admins
      maxItemsPerOrder: 1000,
      maxQuantityPerItem: 1000000,
      maxOrdersPerDay: 1000,
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  async validateOrderCreation(
    buyerId: number,
    orderItems: any[],
    estimatedTotal: number,
    userRole: UserRole,
  ): Promise<void> {
    const limits = this.ORDER_LIMITS[userRole];
    const issues: string[] = [];

    // Check order value limit
    if (estimatedTotal > limits.maxOrderValue) {
      issues.push(
        `Order value ${estimatedTotal} exceeds maximum allowed ${limits.maxOrderValue}`,
      );
    }

    // Check number of items
    if (orderItems.length > limits.maxItemsPerOrder) {
      issues.push(
        `Order contains ${orderItems.length} items, maximum allowed is ${limits.maxItemsPerOrder}`,
      );
    }

    // Check individual item quantities
    for (const item of orderItems) {
      if (item.quantityRequested > limits.maxQuantityPerItem) {
        issues.push(
          `Item ${item.productId} quantity ${item.quantityRequested} exceeds maximum ${limits.maxQuantityPerItem}`,
        );
      }
    }

    // Check daily order limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayOrderCount = await this.prisma.order.count({
      where: {
        buyerId,
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    });

    if (todayOrderCount >= limits.maxOrdersPerDay) {
      issues.push(
        `Daily order limit reached (${todayOrderCount}/${limits.maxOrdersPerDay})`,
      );
    }

    if (issues.length > 0) {
      this.logger.warn(
        `Order validation failed for user ${buyerId}: ${issues.join(', ')}`,
      );
      throw new BadRequestException({
        message: 'Order validation failed',
        issues,
        limits: limits,
      });
    }
  }

  async validateStockLevels(orderItems: any[]): Promise<StockValidation> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    for (const item of orderItems) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        include: { inventory: true },
      });

      if (!product) {
        issues.push(`Product ${item.productId} not found`);
        continue;
      }

      if (!product.isActive) {
        issues.push(`Product ${product.name} is not available`);
        continue;
      }

      const inventory = product.inventory;
      if (!inventory) {
        issues.push(`No inventory found for product ${product.name}`);
        continue;
      }

      const availableStock = inventory.quantityInBaseUom
        .sub(inventory.reservedQuantity)
        .toNumber();

      const requiredStock = item.quantityInBaseUom;

      if (availableStock < requiredStock) {
        issues.push(
          `Insufficient stock for ${product.name}. Required: ${requiredStock}, Available: ${availableStock}`,
        );

        if (availableStock > 0) {
          suggestions.push(
            `Consider reducing quantity for ${product.name} to ${availableStock} or less`,
          );
        }
      }

      // Warning for low stock (less than 10% of requested)
      if (
        availableStock < requiredStock * 1.1 &&
        availableStock >= requiredStock
      ) {
        suggestions.push(
          `Low stock warning for ${product.name}. Consider ordering soon to avoid stockouts`,
        );
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      suggestions,
    };
  }

  async validateStatusTransition(
    orderId: number,
    currentStatus: OrderStatus,
    newStatus: OrderStatus,
    userId: number,
  ): Promise<void> {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.APPROVED, OrderStatus.CANCELLED],
      [OrderStatus.APPROVED]: [OrderStatus.FULFILLED, OrderStatus.CANCELLED],
      [OrderStatus.FULFILLED]: [], // Terminal state
      [OrderStatus.CANCELLED]: [], // Terminal state
    };

    if (!validTransitions[currentStatus].includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
      );
    }

    // Additional business rules
    if (newStatus === OrderStatus.APPROVED) {
      await this.validateApprovalConditions(orderId);
    }

    this.logger.log(
      `Status transition validated: Order ${orderId} from ${currentStatus} to ${newStatus} by user ${userId}`,
    );
  }

  private async validateApprovalConditions(orderId: number): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              include: { inventory: true },
            },
          },
        },
        buyer: true,
      },
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    // Check if buyer account is still active
    if (!order.buyer.isActive) {
      throw new BadRequestException('Cannot approve order for inactive buyer');
    }

    // Validate stock availability at approval time
    const stockValidation = await this.validateStockLevels(order.items);
    if (!stockValidation.isValid) {
      throw new BadRequestException({
        message: 'Cannot approve order due to stock issues',
        issues: stockValidation.issues,
      });
    }

    // Check for suspicious order patterns (large orders, unusual patterns)
    const recentOrderCount = await this.prisma.order.count({
      where: {
        buyerId: order.buyerId,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    });

    if (recentOrderCount > 10) {
      this.logger.warn(
        `High order frequency detected for buyer ${order.buyerId}: ${recentOrderCount} orders in 24h`,
      );
    }

    // Check order value against historical patterns
    const avgOrderValue = await this.prisma.order.aggregate({
      where: {
        buyerId: order.buyerId,
        status: OrderStatus.FULFILLED,
      },
      _avg: {
        totalAmount: true,
      },
    });

    if (avgOrderValue._avg.totalAmount) {
      const currentValue = order.totalAmount.toNumber();
      const avgValue = avgOrderValue._avg.totalAmount.toNumber();

      if (currentValue > avgValue * 5) {
        this.logger.warn(
          `Unusually large order detected: Order ${orderId} value ${currentValue} is ${Math.round(currentValue / avgValue)}x the average`,
        );
      }
    }
  }

  async getOrderStatistics(buyerId: number): Promise<any> {
    const stats = await this.prisma.order.groupBy({
      by: ['status'],
      where: { buyerId },
      _count: {
        status: true,
      },
      _sum: {
        totalAmount: true,
      },
    });

    const totalSpent = await this.prisma.order.aggregate({
      where: {
        buyerId,
        status: OrderStatus.FULFILLED,
      },
      _sum: {
        totalAmount: true,
      },
    });

    return {
      ordersByStatus: stats,
      totalLifetimeSpend: totalSpent._sum.totalAmount?.toNumber() || 0,
    };
  }

  async checkRateLimitViolation(
    userId: number,
    action: string,
    windowMinutes: number = 60,
    maxAttempts: number = 10,
  ): Promise<boolean> {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    // This would typically use Redis in production
    // For now, we'll use database audit logs
    const recentAttempts = await this.prisma.auditLog.count({
      where: {
        changedById: userId,
        action: action as any,
        createdAt: {
          gte: windowStart,
        },
      },
    });

    return recentAttempts >= maxAttempts;
  }
}
