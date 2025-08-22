import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { UomConversionService } from '../common/services/uom-conversion.service';
import { CreateOrderDto } from './dto';
import { UserRole, OrderStatus } from '@prisma/client';
import { OrdersGateway } from '../websockets/orders.gateway';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uomConversion: UomConversionService,
    @Inject(forwardRef(() => OrdersGateway))
    private readonly ordersGateway: OrdersGateway,
  ) {}

  async create(buyerId: number, createOrderDto: CreateOrderDto) {
    // Validate all products exist and get their details
    const productIds = createOrderDto.items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      include: { inventory: true },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException(
        'One or more products not found or inactive',
      );
    }

    // Validate UOM compatibility and calculate quantities and prices
    const orderItems: Array<{
      productId: number;
      quantityRequested: number;
      requestedUom: any;
      quantityInBaseUom: number;
      unitPriceInBaseUom: number;
      lineTotal: number;
    }> = [];
    let totalAmount = 0;

    for (const item of createOrderDto.items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        throw new BadRequestException(`Product ${item.productId} not found`);
      }

      // Check UOM compatibility
      if (
        !this.uomConversion.isCompatible(item.requestedUom, product.baseUom)
      ) {
        throw new BadRequestException(
          `Cannot convert ${item.requestedUom} to ${product.baseUom} for product ${product.name}`,
        );
      }

      // Convert to base UOM
      const quantityInBaseUom = this.uomConversion.convertToBaseUom(
        item.quantityRequested,
        item.requestedUom,
        product.baseUom,
      );

      // Check stock availability (soft check at creation)
      const quantityInStock =
        product.inventory?.quantityInBaseUom || new Decimal(0);
      const reservedQuantity =
        product.inventory?.reservedQuantity || new Decimal(0);
      const availableStock = quantityInStock.sub(reservedQuantity).toNumber();

      if (availableStock < quantityInBaseUom) {
        throw new BadRequestException(
          `Insufficient stock for ${product.name}. Available: ${availableStock} ${product.baseUom}, Requested: ${quantityInBaseUom} ${product.baseUom}`,
        );
      }

      // Calculate pricing
      const unitPriceInBaseUom = product.pricePerBaseUom.toNumber();
      const lineTotal = quantityInBaseUom * unitPriceInBaseUom;
      totalAmount += lineTotal;

      orderItems.push({
        productId: item.productId,
        quantityRequested: item.quantityRequested,
        requestedUom: item.requestedUom,
        quantityInBaseUom,
        unitPriceInBaseUom,
        lineTotal,
      });
    }

    // Generate order number
    const orderCount = await this.prisma.order.count();
    const orderNumber = `ORD-${new Date().getFullYear()}-${String(orderCount + 1).padStart(3, '0')}`;

    // Create order with items in a transaction
    const order = await this.prisma.$transaction(async (tx) => {
      // Create order
      const newOrder = await tx.order.create({
        data: {
          buyerId,
          orderNumber,
          status: OrderStatus.PENDING,
          totalAmount,
          notes: createOrderDto.notes,
        },
      });

      // Create order items
      await tx.orderItem.createMany({
        data: orderItems.map((item) => ({
          orderId: newOrder.id,
          ...item,
        })),
      });

      // Create initial status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: newOrder.id,
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          changedById: buyerId,
          reason: 'Order created',
        },
      });

      return newOrder;
    });

    this.logger.log(`Order created: ${orderNumber} by buyer ${buyerId}`);

    // Extract supplier IDs from order items for WebSocket broadcast
    const supplierIds = [
      ...new Set(
        orderItems
          .map((item) => {
            const product = products.find((p) => p.id === item.productId);
            return product?.supplierId;
          })
          .filter(Boolean) as number[],
      ),
    ];

    // Broadcast new order creation via WebSocket
    if (this.ordersGateway) {
      this.ordersGateway.broadcastNewOrder({
        orderId: order.id,
        buyerId,
        supplierIds,
        orderNumber,
        totalAmount,
        itemCount: orderItems.length,
        createdAt: new Date().toISOString(),
      });
    }

    return this.findOne(order.id);
  }

  async findAll(
    userId: number,
    userRole: UserRole,
    supplierId?: number,
    status?: OrderStatus,
  ) {
    const whereClause: any = {};

    if (userRole === UserRole.BUYER) {
      whereClause.buyerId = userId;
    } else if (userRole === UserRole.SUPPLIER) {
      // Supplier can see orders that contain their products
      whereClause.items = {
        some: {
          product: {
            supplierId: userId,
          },
        },
      };
    }

    // Admin can see all orders (no additional filtering)

    // Apply additional filters
    if (supplierId && userRole === UserRole.ADMIN) {
      whereClause.items = {
        some: {
          product: {
            supplierId,
          },
        },
      };
    }

    if (status) {
      whereClause.status = status;
    }

    const orders = await this.prisma.order.findMany({
      where: whereClause,
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
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((order) => this.formatOrderResponse(order));
  }

  async findOne(id: number, userId?: number, userRole?: UserRole) {
    const order = await this.prisma.order.findUnique({
      where: { id },
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

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check access permissions
    if (userId && userRole) {
      if (userRole === UserRole.BUYER && order.buyerId !== userId) {
        throw new ForbiddenException('You can only view your own orders');
      }

      if (userRole === UserRole.SUPPLIER) {
        const hasSupplierProduct = order.items.some(
          (item) => item.product.supplier.id === userId,
        );
        if (!hasSupplierProduct) {
          throw new ForbiddenException(
            'You can only view orders containing your products',
          );
        }
      }
    }

    return this.formatOrderResponse(order);
  }

  async findBySupplier(supplierId: number, status?: OrderStatus) {
    const whereClause: any = {
      items: {
        some: {
          product: {
            supplierId,
          },
        },
      },
    };

    if (status) {
      whereClause.status = status;
    }

    const orders = await this.prisma.order.findMany({
      where: whereClause,
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
          where: {
            product: {
              supplierId,
            },
          },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                baseUom: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((order) => this.formatOrderResponse(order));
  }

  private formatOrderResponse(order: any) {
    return {
      id: order.id,
      buyerId: order.buyerId,
      buyerEmail: order.buyer?.email,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount:
        typeof order.totalAmount === 'object' && order.totalAmount.toNumber
          ? order.totalAmount.toNumber()
          : Number(order.totalAmount),
      notes: order.notes,
      items: order.items.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        quantityRequested:
          typeof item.quantityRequested === 'object' &&
          item.quantityRequested.toNumber
            ? item.quantityRequested.toNumber()
            : Number(item.quantityRequested),
        requestedUom: item.requestedUom,
        quantityInBaseUom:
          typeof item.quantityInBaseUom === 'object' &&
          item.quantityInBaseUom.toNumber
            ? item.quantityInBaseUom.toNumber()
            : Number(item.quantityInBaseUom),
        unitPriceInBaseUom:
          typeof item.unitPriceInBaseUom === 'object' &&
          item.unitPriceInBaseUom.toNumber
            ? item.unitPriceInBaseUom.toNumber()
            : Number(item.unitPriceInBaseUom),
        lineTotal:
          typeof item.lineTotal === 'object' && item.lineTotal.toNumber
            ? item.lineTotal.toNumber()
            : Number(item.lineTotal),
        supplier: item.product.supplier,
      })),
      statusHistory: order.statusHistory || [],
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
