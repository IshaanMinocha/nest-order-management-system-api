import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordService } from '../src/auth/services/password.service';
import { UserRole, BaseUom, RequestedUom, OrderStatus } from '@prisma/client';

describe('Orders Workflow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;

  let adminToken: string;
  let buyerToken: string;
  let supplierToken: string;
  let buyerId: number;
  let supplierId: number;
  let productId: number;
  let orderId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableCors();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    passwordService = app.get<PasswordService>(PasswordService);

    await setupTestData();
    await authenticateUsers();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  const setupTestData = async () => {
    // Clean existing data
    await prisma.orderStatusHistory.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();

    // Create admin user
    const adminPassword = await passwordService.hashPassword('admin123');
    await prisma.user.create({
      data: {
        email: 'admin@oms.com',
        firstName: 'Admin',
        lastName: 'User',
        role: UserRole.ADMIN,
        passwordHash: adminPassword,
        isActive: true,
      },
    });

    // Create buyer user
    const buyerPassword = await passwordService.hashPassword('buyer123');
    const buyer = await prisma.user.create({
      data: {
        email: 'buyer@oms.com',
        firstName: 'Buyer',
        lastName: 'User',
        role: UserRole.BUYER,
        passwordHash: buyerPassword,
        isActive: true,
      },
    });
    buyerId = buyer.id;

    // Create supplier user
    const supplierPassword = await passwordService.hashPassword('supplier123');
    const supplier = await prisma.user.create({
      data: {
        email: 'supplier@oms.com',
        firstName: 'Supplier',
        lastName: 'User',
        role: UserRole.SUPPLIER,
        passwordHash: supplierPassword,
        isActive: true,
      },
    });
    supplierId = supplier.id;

    // Create test product
    const product = await prisma.product.create({
      data: {
        supplierId: supplier.id,
        name: 'Test Rice',
        description: 'Premium test rice for e2e testing',
        baseUom: BaseUom.GRAM,
        conversionFactorToBase: 1,
        pricePerBaseUom: 0.01, // $0.01 per gram
        sku: 'RICE-E2E-001',
        isActive: true,
      },
    });
    productId = product.id;

    // Create inventory
    await prisma.inventory.create({
      data: {
        productId: product.id,
        quantityInBaseUom: 10000, // 10kg in grams
        reservedQuantity: 0,
      },
    });
  };

  const authenticateUsers = async () => {
    // Get admin token
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@oms.com', password: 'admin123' });
    adminToken = adminLogin.body.access_token;

    // Get buyer token
    const buyerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'buyer@oms.com', password: 'buyer123' });
    buyerToken = buyerLogin.body.access_token;

    // Get supplier token
    const supplierLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'supplier@oms.com', password: 'supplier123' });
    supplierToken = supplierLogin.body.access_token;
  };

  const cleanupTestData = async () => {
    await prisma.orderStatusHistory.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();
  };

  describe('Complete Order Workflow', () => {
    it('1. Buyer should be able to list products', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        id: productId,
        name: 'Test Rice',
        baseUom: BaseUom.GRAM,
        availableStock: 10000,
      });
    });

    it('2. Buyer should be able to create an order', async () => {
      const orderData = {
        items: [
          {
            productId: productId,
            quantityRequested: 2,
            requestedUom: RequestedUom.KILOGRAM,
          },
        ],
        notes: 'E2E test order',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(orderData)
        .expect(201);

      expect(response.body).toMatchObject({
        buyerId: buyerId,
        status: OrderStatus.PENDING,
        totalAmount: 20, // 2000 grams * $0.01 = $20
        notes: 'E2E test order',
      });

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0]).toMatchObject({
        productId: productId,
        quantityRequested: 2,
        requestedUom: RequestedUom.KILOGRAM,
        quantityInBaseUom: 2000, // 2kg = 2000g
        unitPriceInBaseUom: 0.01,
        lineTotal: 20,
      });

      orderId = response.body.id;
    });

    it('3. Buyer should be able to view their orders', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        id: orderId,
        buyerId: buyerId,
        status: OrderStatus.PENDING,
      });
    });

    it('4. Supplier should be able to view orders for their products', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${supplierToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].items[0]).toMatchObject({
        productId: productId,
      });
    });

    it('5. Admin should be able to approve the order', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: OrderStatus.APPROVED,
          reason: 'E2E test approval',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        id: orderId,
        status: OrderStatus.APPROVED,
      });

      // Verify status history
      expect(response.body.statusHistory).toHaveLength(2); // PENDING and APPROVED
      expect(response.body.statusHistory[0]).toMatchObject({
        fromStatus: OrderStatus.PENDING,
        toStatus: OrderStatus.APPROVED,
        reason: 'E2E test approval',
      });
    });

    it('6. Stock should be deducted after approval', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      expect(response.body.availableStock).toBe(8000); // 10000 - 2000 = 8000
    });

    it('7. Admin should be able to fulfill the order', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: OrderStatus.FULFILLED,
          reason: 'E2E test fulfillment',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        id: orderId,
        status: OrderStatus.FULFILLED,
      });

      // Verify status history now has 3 entries
      expect(response.body.statusHistory).toHaveLength(3);
    });

    it('8. Admin should be able to view analytics', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        totalRevenue: 20,
        totalOrders: 1,
        averageOrderValue: 20,
      });

      expect(response.body.ordersByStatus).toContainEqual({
        status: OrderStatus.FULFILLED,
        count: 1,
      });

      expect(response.body.revenueBySupplier).toHaveLength(1);
      expect(response.body.revenueBySupplier[0]).toMatchObject({
        supplierId: supplierId,
        totalRevenue: 20,
        orderCount: 1,
      });

      expect(response.body.topProducts).toHaveLength(1);
      expect(response.body.topProducts[0]).toMatchObject({
        productId: productId,
        productName: 'Test Rice',
        totalQuantitySold: 2000,
        totalRevenue: 20,
        orderCount: 1,
      });
    });
  });

  describe('Order Cancellation Workflow', () => {
    let cancelOrderId: number;

    it('should create another order for cancellation test', async () => {
      const orderData = {
        items: [
          {
            productId: productId,
            quantityRequested: 1,
            requestedUom: RequestedUom.KILOGRAM,
          },
        ],
        notes: 'Order to be cancelled',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(orderData)
        .expect(201);

      cancelOrderId = response.body.id;
    });

    it('should approve the order first', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/orders/${cancelOrderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: OrderStatus.APPROVED,
          reason: 'Approved for cancellation test',
        })
        .expect(200);

      // Verify stock is deducted
      const productResponse = await request(app.getHttpServer())
        .get(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(productResponse.body.availableStock).toBe(7000); // 8000 - 1000 = 7000
    });

    it('should cancel approved order and restore stock', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/orders/${cancelOrderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: OrderStatus.CANCELLED,
          reason: 'Customer requested cancellation',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        id: cancelOrderId,
        status: OrderStatus.CANCELLED,
      });

      // Verify stock is restored
      const productResponse = await request(app.getHttpServer())
        .get(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(productResponse.body.availableStock).toBe(8000); // 7000 + 1000 = 8000 (restored)
    });
  });

  describe('Stock Management Workflow', () => {
    it('supplier should be able to update product stock', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}/stock`)
        .set('Authorization', `Bearer ${supplierToken}`)
        .send({
          quantity: 5,
          uom: RequestedUom.KILOGRAM,
        })
        .expect(200);

      expect(response.body.availableStock).toBe(13000); // 8000 + 5000 = 13000
    });

    it('should prevent order creation when insufficient stock', async () => {
      const orderData = {
        items: [
          {
            productId: productId,
            quantityRequested: 15, // 15kg > 13kg available
            requestedUom: RequestedUom.KILOGRAM,
          },
        ],
        notes: 'Order with insufficient stock',
      };

      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(orderData)
        .expect(400);
    });
  });

  describe('Error Handling', () => {
    it('should prevent invalid status transitions', async () => {
      // Try to fulfill a pending order (should go through approved first)
      const orderData = {
        items: [
          {
            productId: productId,
            quantityRequested: 1,
            requestedUom: RequestedUom.KILOGRAM,
          },
        ],
        notes: 'Order for invalid transition test',
      };

      const orderResponse = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(orderData);

      const newOrderId = orderResponse.body.id;

      // Try invalid transition PENDING -> FULFILLED
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/orders/${newOrderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: OrderStatus.FULFILLED,
          reason: 'Invalid transition',
        })
        .expect(400);
    });

    it('should prevent non-admin users from changing order status', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          status: OrderStatus.CANCELLED,
          reason: 'Unauthorized attempt',
        })
        .expect(403);
    });

    it('should prevent suppliers from updating other suppliers products', async () => {
      // Create another supplier
      const supplierPassword =
        await passwordService.hashPassword('supplier2123');
      await prisma.user.create({
        data: {
          email: 'supplier2@oms.com',
          firstName: 'Supplier2',
          lastName: 'User',
          role: UserRole.SUPPLIER,
          passwordHash: supplierPassword,
          isActive: true,
        },
      });

      // Login as supplier2
      const supplier2Login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'supplier2@oms.com', password: 'supplier2123' });
      const supplier2Token = supplier2Login.body.access_token;

      // Try to update original supplier's product
      await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}/stock`)
        .set('Authorization', `Bearer ${supplier2Token}`)
        .send({
          quantity: 1,
          uom: RequestedUom.KILOGRAM,
        })
        .expect(403);
    });
  });
});
