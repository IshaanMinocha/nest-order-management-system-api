import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
// import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrderStatusDto } from './dto';
import { OrderStatus } from '@prisma/client';
import { OrdersGateway } from '../websockets/orders.gateway';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => OrdersGateway))
    private readonly ordersGateway: OrdersGateway,
  ) {}

  async updateOrderStatus(
    orderId: number,
    updateOrderStatusDto: UpdateOrderStatusDto,
    adminId: number,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              include: {
                inventory: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const { status: newStatus, reason } = updateOrderStatusDto;
    const currentStatus = order.status;

    // Validate status transition
    this.validateStatusTransition(currentStatus, newStatus);

    // Handle stock operations based on status changes
    await this.prisma.$transaction(async (tx) => {
      // Update order status
      await tx.order.update({
        where: { id: orderId },
        data: { status: newStatus },
      });

      // Record status history
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: currentStatus,
          toStatus: newStatus,
          changedById: adminId,
          reason: reason || `Status changed to ${newStatus}`,
        },
      });

      // Handle stock deductions/restorations based on status transitions
      if (
        currentStatus === OrderStatus.PENDING &&
        newStatus === OrderStatus.APPROVED
      ) {
        // Deduct stock atomically when approving
        await this.deductStockForOrder(tx, order);
        this.logger.log(
          `Stock deducted for approved order ${order.orderNumber}`,
        );
      } else if (
        currentStatus === OrderStatus.APPROVED &&
        newStatus === OrderStatus.CANCELLED
      ) {
        // Restore stock when cancelling approved orders
        await this.restoreStockForOrder(tx, order);
        this.logger.log(
          `Stock restored for cancelled order ${order.orderNumber}`,
        );
      }
    });

    this.logger.log(
      `Order ${order.orderNumber} status changed from ${currentStatus} to ${newStatus} by admin ${adminId}`,
    );

    // Get admin info for WebSocket broadcast
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { id: true, email: true, role: true },
    });

    // Extract supplier IDs from order items
    const supplierIds = [
      ...new Set(order.items.map((item) => item.product.supplierId)),
    ];

    // Broadcast real-time update via WebSocket
    if (this.ordersGateway) {
      this.ordersGateway.broadcastOrderStatusUpdate({
        orderId: order.id,
        buyerId: order.buyerId,
        supplierIds,
        orderNumber: order.orderNumber,
        oldStatus: currentStatus,
        newStatus,
        updatedBy: {
          id: admin?.id || adminId,
          email: admin?.email || 'unknown',
          role: admin?.role || 'ADMIN',
        },
        updatedAt: new Date().toISOString(),
        reason: reason || `Status changed to ${newStatus}`,
      });
    }

    // Return updated order
    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                baseUom: true,
                supplier: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
        statusHistory: {
          include: {
            changedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { changedAt: 'desc' },
        },
      },
    });
  }

  async getAnalytics() {
    // Get order counts by status
    const ordersByStatus = await this.prisma.order.groupBy({
      by: ['status'],
      _count: {
        status: true,
      },
    });

    // Get revenue by supplier
    const revenueBySupplier = await this.prisma.$queryRaw`
      SELECT 
        p.supplier_id as "supplierId",
        u.email as "supplierEmail",
        CONCAT(u.first_name, ' ', u.last_name) as "supplierName",
        SUM(oi.line_total) as "totalRevenue",
        COUNT(DISTINCT o.id) as "orderCount"
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      JOIN users u ON p.supplier_id = u.id
      WHERE o.status IN ('APPROVED', 'FULFILLED')
      GROUP BY p.supplier_id, u.email, u.first_name, u.last_name
      ORDER BY "totalRevenue" DESC
    `;

    // Get top products
    const topProducts = await this.prisma.$queryRaw`
      SELECT 
        p.id as "productId",
        p.name as "productName",
        p.base_uom as "baseUom",
        SUM(oi.quantity_in_base_uom) as "totalQuantitySold",
        SUM(oi.line_total) as "totalRevenue",
        COUNT(oi.id) as "orderCount"
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status IN ('APPROVED', 'FULFILLED')
      GROUP BY p.id, p.name, p.base_uom
      ORDER BY "totalRevenue" DESC
      LIMIT 10
    `;

    // Get total revenue and order count
    const totalStats = await this.prisma.order.aggregate({
      where: {
        status: {
          in: [OrderStatus.APPROVED, OrderStatus.FULFILLED],
        },
      },
      _sum: {
        totalAmount: true,
      },
      _count: {
        id: true,
      },
    });

    const totalRevenue = totalStats._sum.totalAmount?.toNumber() || 0;
    const totalOrders = totalStats._count.id || 0;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      ordersByStatus: ordersByStatus.map((item) => ({
        status: item.status,
        count: item._count.status,
      })),
      revenueBySupplier: (revenueBySupplier as any[]).map((item: any) => ({
        supplierId: item.supplierId,
        supplierEmail: item.supplierEmail,
        supplierName: item.supplierName || 'Unknown',
        totalRevenue: item.totalRevenue.toNumber(),
        orderCount: Number(item.orderCount),
      })),
      topProducts: (topProducts as any[]).map((item: any) => ({
        productId: item.productId,
        productName: item.productName,
        baseUom: item.baseUom,
        totalQuantitySold: item.totalQuantitySold.toNumber(),
        totalRevenue: item.totalRevenue.toNumber(),
        orderCount: Number(item.orderCount),
      })),
      totalRevenue,
      totalOrders,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
    };
  }

  private validateStatusTransition(
    currentStatus: OrderStatus,
    newStatus: OrderStatus,
  ) {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.APPROVED, OrderStatus.CANCELLED],
      [OrderStatus.APPROVED]: [OrderStatus.FULFILLED, OrderStatus.CANCELLED],
      [OrderStatus.FULFILLED]: [], // No transitions from fulfilled
      [OrderStatus.CANCELLED]: [], // No transitions from cancelled
    };

    const allowedTransitions = validTransitions[currentStatus];
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }

  private async deductStockForOrder(tx: any, order: any) {
    for (const item of order.items) {
      const currentInventory = await tx.inventory.findUnique({
        where: { productId: item.productId },
      });

      if (!currentInventory) {
        throw new BadRequestException(
          `No inventory found for product ${item.productId}`,
        );
      }

      // Check if enough stock is available
      const availableStock = currentInventory.quantityInBaseUom
        .sub(currentInventory.reservedQuantity)
        .toNumber();

      const requiredQuantity =
        typeof item.quantityInBaseUom === 'object' &&
        item.quantityInBaseUom.toNumber
          ? item.quantityInBaseUom.toNumber()
          : Number(item.quantityInBaseUom);

      if (availableStock < requiredQuantity) {
        throw new BadRequestException(
          `Insufficient stock for product ${item.product.name}. Available: ${availableStock}, Required: ${requiredQuantity}`,
        );
      }

      // Deduct stock atomically
      await tx.inventory.update({
        where: { productId: item.productId },
        data: {
          quantityInBaseUom: {
            decrement: requiredQuantity,
          },
        },
      });
    }
  }

  private async restoreStockForOrder(tx: any, order: any) {
    for (const item of order.items) {
      const quantityToRestore =
        typeof item.quantityInBaseUom === 'object' &&
        item.quantityInBaseUom.toNumber
          ? item.quantityInBaseUom.toNumber()
          : Number(item.quantityInBaseUom);

      // Restore stock by adding back the quantity
      await tx.inventory.update({
        where: { productId: item.productId },
        data: {
          quantityInBaseUom: {
            increment: quantityToRestore,
          },
        },
      });
    }
  }
}
