import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersGateway } from '../websockets/orders.gateway';
import { OrderStatus, UserRole } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

describe('AdminService', () => {
  let service: AdminService;

  const mockOrder = {
    id: 1,
    buyerId: 2,
    orderNumber: 'ORD-2024-001',
    status: OrderStatus.PENDING,
    totalAmount: new Decimal(150.75),
    notes: 'Test order',
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 1,
        productId: 1,
        quantityRequested: 2,
        requestedUom: 'KILOGRAM',
        quantityInBaseUom: 2000,
        unitPriceInBaseUom: new Decimal(0.05),
        lineTotal: new Decimal(100),
        product: {
          id: 1,
          name: 'Test Product',
          supplierId: 3,
          inventory: {
            quantityInBaseUom: new Decimal(5000),
            reservedQuantity: new Decimal(0),
          },
        },
      },
    ],
  };

  const mockPrismaService = {
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    orderStatusHistory: {
      create: jest.fn(),
    },
    inventory: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };

  const mockOrdersGateway = {
    broadcastOrderStatusUpdate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: OrdersGateway,
          useValue: mockOrdersGateway,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateOrderStatus', () => {
    const updateDto = {
      status: OrderStatus.APPROVED,
      reason: 'Stock verified and payment confirmed',
    };

    const mockAdmin = {
      id: 1,
      email: 'admin@oms.com',
      role: UserRole.ADMIN,
    };

    it('should throw NotFoundException when order does not exist', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue(null);

      await expect(
        service.updateOrderStatus(999, updateDto, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid status transition', async () => {
      const fulfilledOrder = { ...mockOrder, status: OrderStatus.FULFILLED };
      mockPrismaService.order.findUnique.mockResolvedValue(fulfilledOrder);

      const invalidDto = { status: OrderStatus.PENDING, reason: 'Invalid' };

      await expect(service.updateOrderStatus(1, invalidDto, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should successfully approve a pending order', async () => {
      const pendingOrder = { ...mockOrder, status: OrderStatus.PENDING };
      mockPrismaService.order.findUnique
        .mockResolvedValueOnce(pendingOrder)
        .mockResolvedValueOnce({
          ...pendingOrder,
          status: OrderStatus.APPROVED,
        });

      mockPrismaService.user.findUnique.mockResolvedValue(mockAdmin);

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return await callback({
          order: {
            update: mockPrismaService.order.update,
          },
          orderStatusHistory: {
            create: mockPrismaService.orderStatusHistory.create,
          },
          inventory: {
            findUnique: mockPrismaService.inventory.findUnique,
            update: mockPrismaService.inventory.update,
          },
        });
      });

      // Mock inventory check for stock deduction
      mockPrismaService.inventory.findUnique.mockResolvedValue({
        quantityInBaseUom: new Decimal(5000),
        reservedQuantity: new Decimal(0),
      });

      await service.updateOrderStatus(1, updateDto, 1);

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockOrdersGateway.broadcastOrderStatusUpdate).toHaveBeenCalledWith(
        {
          orderId: 1,
          buyerId: 2,
          supplierIds: [3],
          orderNumber: 'ORD-2024-001',
          oldStatus: OrderStatus.PENDING,
          newStatus: OrderStatus.APPROVED,
          updatedBy: mockAdmin,
          updatedAt: expect.any(String),
          reason: updateDto.reason,
        },
      );
    });

    it('should cancel an approved order and restore stock', async () => {
      const approvedOrder = { ...mockOrder, status: OrderStatus.APPROVED };
      const cancelDto = {
        status: OrderStatus.CANCELLED,
        reason: 'Customer request',
      };

      mockPrismaService.order.findUnique
        .mockResolvedValueOnce(approvedOrder)
        .mockResolvedValueOnce({
          ...approvedOrder,
          status: OrderStatus.CANCELLED,
        });

      mockPrismaService.user.findUnique.mockResolvedValue(mockAdmin);

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return await callback({
          order: {
            update: mockPrismaService.order.update,
          },
          orderStatusHistory: {
            create: mockPrismaService.orderStatusHistory.create,
          },
          inventory: {
            update: mockPrismaService.inventory.update,
          },
        });
      });

      await service.updateOrderStatus(1, cancelDto, 1);

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockOrdersGateway.broadcastOrderStatusUpdate).toHaveBeenCalledWith(
        {
          orderId: 1,
          buyerId: 2,
          supplierIds: [3],
          orderNumber: 'ORD-2024-001',
          oldStatus: OrderStatus.APPROVED,
          newStatus: OrderStatus.CANCELLED,
          updatedBy: mockAdmin,
          updatedAt: expect.any(String),
          reason: cancelDto.reason,
        },
      );
    });

    it('should throw BadRequestException when insufficient stock for approval', async () => {
      const pendingOrder = { ...mockOrder, status: OrderStatus.PENDING };
      mockPrismaService.order.findUnique.mockResolvedValue(pendingOrder);

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          order: { update: jest.fn() },
          orderStatusHistory: { create: jest.fn() },
          inventory: {
            findUnique: jest.fn().mockResolvedValue({
              quantityInBaseUom: new Decimal(1000), // Less than required 2000
              reservedQuantity: new Decimal(0),
            }),
          },
        };

        return await callback(mockTx);
      });

      await expect(service.updateOrderStatus(1, updateDto, 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateStatusTransition', () => {
    it('should allow valid transitions from PENDING', () => {
      expect(() => {
        // Use reflection to access private method for testing
        (service as any).validateStatusTransition(
          OrderStatus.PENDING,
          OrderStatus.APPROVED,
        );
      }).not.toThrow();

      expect(() => {
        (service as any).validateStatusTransition(
          OrderStatus.PENDING,
          OrderStatus.CANCELLED,
        );
      }).not.toThrow();
    });

    it('should allow valid transitions from APPROVED', () => {
      expect(() => {
        (service as any).validateStatusTransition(
          OrderStatus.APPROVED,
          OrderStatus.FULFILLED,
        );
      }).not.toThrow();

      expect(() => {
        (service as any).validateStatusTransition(
          OrderStatus.APPROVED,
          OrderStatus.CANCELLED,
        );
      }).not.toThrow();
    });

    it('should reject invalid transitions', () => {
      expect(() => {
        (service as any).validateStatusTransition(
          OrderStatus.FULFILLED,
          OrderStatus.PENDING,
        );
      }).toThrow(BadRequestException);

      expect(() => {
        (service as any).validateStatusTransition(
          OrderStatus.CANCELLED,
          OrderStatus.APPROVED,
        );
      }).toThrow(BadRequestException);

      expect(() => {
        (service as any).validateStatusTransition(
          OrderStatus.PENDING,
          OrderStatus.FULFILLED,
        );
      }).toThrow(BadRequestException);
    });
  });

  describe('getAnalytics', () => {
    it('should return comprehensive analytics data', async () => {
      const mockOrdersByStatus = [
        { status: OrderStatus.PENDING, _count: { status: 5 } },
        { status: OrderStatus.APPROVED, _count: { status: 3 } },
        { status: OrderStatus.FULFILLED, _count: { status: 8 } },
        { status: OrderStatus.CANCELLED, _count: { status: 2 } },
      ];

      const mockRevenueBySupplier = [
        {
          supplierId: 1,
          supplierEmail: 'supplier1@oms.com',
          supplierName: 'John Supplier',
          totalRevenue: new Decimal(1250.75),
          orderCount: BigInt(6),
        },
      ];

      const mockTopProducts = [
        {
          productId: 1,
          productName: 'Premium Basmati Rice',
          baseUom: 'GRAM',
          totalQuantitySold: new Decimal(15000),
          totalRevenue: new Decimal(750.0),
          orderCount: BigInt(12),
        },
      ];

      const mockTotalStats = {
        _sum: { totalAmount: new Decimal(5425.75) },
        _count: { id: 18 },
      };

      mockPrismaService.order.groupBy.mockResolvedValue(mockOrdersByStatus);
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce(mockRevenueBySupplier)
        .mockResolvedValueOnce(mockTopProducts);
      mockPrismaService.order.aggregate.mockResolvedValue(mockTotalStats);

      const result = await service.getAnalytics();

      expect(result).toEqual({
        ordersByStatus: [
          { status: OrderStatus.PENDING, count: 5 },
          { status: OrderStatus.APPROVED, count: 3 },
          { status: OrderStatus.FULFILLED, count: 8 },
          { status: OrderStatus.CANCELLED, count: 2 },
        ],
        revenueBySupplier: [
          {
            supplierId: 1,
            supplierEmail: 'supplier1@oms.com',
            supplierName: 'John Supplier',
            totalRevenue: 1250.75,
            orderCount: 6,
          },
        ],
        topProducts: [
          {
            productId: 1,
            productName: 'Premium Basmati Rice',
            baseUom: 'GRAM',
            totalQuantitySold: 15000,
            totalRevenue: 750.0,
            orderCount: 12,
          },
        ],
        totalRevenue: 5425.75,
        totalOrders: 18,
        averageOrderValue: 301.43,
      });
    });

    it('should handle empty analytics data', async () => {
      mockPrismaService.order.groupBy.mockResolvedValue([]);
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrismaService.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
        _count: { id: 0 },
      });

      const result = await service.getAnalytics();

      expect(result).toEqual({
        ordersByStatus: [],
        revenueBySupplier: [],
        topProducts: [],
        totalRevenue: 0,
        totalOrders: 0,
        averageOrderValue: 0,
      });
    });
  });
});
