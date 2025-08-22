import {
  PrismaClient,
  UserRole,
  OrderStatus,
  BaseUom,
  RequestedUom,
  AuditAction,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  const adminPassword = process.env.ADMIN_PASSWORD!;
  const hashedPassword = await bcrypt.hash(adminPassword || 'password123', 10);
  const adminEmail = process.env.ADMIN_EMAIL!;

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: hashedPassword,
      firstName: 'System',
      lastName: 'Administrator',
      role: UserRole.ADMIN,
    },
  });

  const supplier1 = await prisma.user.upsert({
    where: { email: 'supplier1@oms.com' },
    update: {},
    create: {
      email: 'supplier1@oms.com',
      passwordHash: hashedPassword,
      firstName: 'John',
      lastName: 'Supplier',
      role: UserRole.SUPPLIER,
    },
  });

  const buyer1 = await prisma.user.upsert({
    where: { email: 'buyer1@oms.com' },
    update: {},
    create: {
      email: 'buyer1@oms.com',
      passwordHash: hashedPassword,
      firstName: 'Alice',
      lastName: 'Buyer',
      role: UserRole.BUYER,
    },
  });

  console.log('Users created');

  const riceProduct = await prisma.product.create({
    data: {
      supplierId: supplier1.id,
      name: 'Premium Basmati Rice',
      description: 'High-quality basmati rice from India',
      baseUom: BaseUom.GRAM,
      conversionFactorToBase: 1,
      pricePerBaseUom: 0.005,
      sku: 'RICE-BASMATI-001',
    },
  });

  const oilProduct = await prisma.product.create({
    data: {
      supplierId: supplier1.id,
      name: 'Olive Oil Extra Virgin',
      description: 'Cold-pressed extra virgin olive oil',
      baseUom: BaseUom.MILLILITER,
      conversionFactorToBase: 1,
      pricePerBaseUom: 0.02,
      sku: 'OIL-OLIVE-001',
    },
  });

  const wheatProduct = await prisma.product.create({
    data: {
      supplierId: supplier1.id,
      name: 'Organic Wheat Flour',
      description: 'Stone-ground organic wheat flour',
      baseUom: BaseUom.GRAM,
      conversionFactorToBase: 1,
      pricePerBaseUom: 0.003,
      sku: 'FLOUR-WHEAT-001',
    },
  });

  const honeyProduct = await prisma.product.create({
    data: {
      supplierId: supplier1.id,
      name: 'Wild Flower Honey',
      description: 'Pure wild flower honey',
      baseUom: BaseUom.GRAM,
      conversionFactorToBase: 1,
      pricePerBaseUom: 0.012,
      sku: 'HONEY-WILD-001',
    },
  });

  console.log('Products created');

  await prisma.inventory.createMany({
    data: [
      {
        productId: riceProduct.id,
        quantityInBaseUom: 50000,
        reorderLevel: 10000,
        maxStockLevel: 100000,
      },
      {
        productId: oilProduct.id,
        quantityInBaseUom: 25000,
        reorderLevel: 5000,
        maxStockLevel: 50000,
      },
      {
        productId: wheatProduct.id,
        quantityInBaseUom: 75000,
        reorderLevel: 15000,
        maxStockLevel: 150000,
      },
      {
        productId: honeyProduct.id,
        quantityInBaseUom: 20000,
        reorderLevel: 3000,
        maxStockLevel: 40000,
      },
    ],
  });

  console.log('Inventory created');

  const order1 = await prisma.order.create({
    data: {
      buyerId: buyer1.id,
      orderNumber: 'ORD-2024-001',
      status: OrderStatus.PENDING,
      totalAmount: 0,
      notes: 'First sample order for testing',
    },
  });

  const order2 = await prisma.order.create({
    data: {
      buyerId: buyer1.id,
      orderNumber: 'ORD-2024-002',
      status: OrderStatus.APPROVED,
      totalAmount: 0,
      notes: 'Rush order - needed by end of week',
    },
  });

  console.log('Orders created');

  await prisma.orderItem.create({
    data: {
      orderId: order1.id,
      productId: riceProduct.id,
      quantityRequested: 5,
      requestedUom: RequestedUom.KILOGRAM,
      quantityInBaseUom: 5000,
      unitPriceInBaseUom: 0.005,
      lineTotal: 25.0,
    },
  });

  await prisma.orderItem.create({
    data: {
      orderId: order1.id,
      productId: oilProduct.id,
      quantityRequested: 2,
      requestedUom: RequestedUom.LITER,
      quantityInBaseUom: 2000,
      unitPriceInBaseUom: 0.02,
      lineTotal: 40.0,
    },
  });

  await prisma.orderItem.create({
    data: {
      orderId: order2.id,
      productId: wheatProduct.id,
      quantityRequested: 10,
      requestedUom: RequestedUom.KILOGRAM,
      quantityInBaseUom: 10000,
      unitPriceInBaseUom: 0.003,
      lineTotal: 30.0,
    },
  });

  await prisma.order.update({
    where: { id: order1.id },
    data: { totalAmount: 65.0 },
  });

  await prisma.order.update({
    where: { id: order2.id },
    data: { totalAmount: 30.0 },
  });

  console.log('Order items created');

  await prisma.orderStatusHistory.createMany({
    data: [
      {
        orderId: order1.id,
        fromStatus: null,
        toStatus: OrderStatus.PENDING,
        changedById: buyer1.id,
        reason: 'Order created',
      },
      {
        orderId: order2.id,
        fromStatus: null,
        toStatus: OrderStatus.PENDING,
        changedById: buyer1.id,
        reason: 'Order created',
      },
      {
        orderId: order2.id,
        fromStatus: OrderStatus.PENDING,
        toStatus: OrderStatus.APPROVED,
        changedById: admin.id,
        reason: 'Stock verified and payment confirmed',
      },
    ],
  });

  console.log('Order status history created');

  await prisma.auditLog.createMany({
    data: [
      {
        entityType: 'User',
        entityId: admin.id,
        action: AuditAction.CREATE,
        newValues: { email: admin.email, role: admin.role },
        changedById: admin.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Seed Script',
      },
      {
        entityType: 'Product',
        entityId: riceProduct.id,
        action: AuditAction.CREATE,
        newValues: { name: riceProduct.name, sku: riceProduct.sku },
        changedById: supplier1.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Seed Script',
      },
      {
        entityType: 'Order',
        entityId: order2.id,
        action: AuditAction.UPDATE,
        oldValues: { status: 'PENDING' },
        newValues: { status: 'APPROVED' },
        changedById: admin.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Seed Script',
      },
    ],
  });

  console.log('Audit logs created');

  console.log('Database seeded successfully!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
