import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
// import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { UomConversionService } from '../common/services/uom-conversion.service';
import { CreateProductDto, UpdateProductDto, UpdateStockDto } from './dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uomConversion: UomConversionService,
  ) {}

  async create(supplierId: number, createProductDto: CreateProductDto) {
    // Check if SKU already exists
    if (createProductDto.sku) {
      const existingSku = await this.prisma.product.findUnique({
        where: { sku: createProductDto.sku },
      });
      if (existingSku) {
        throw new ConflictException('SKU already exists');
      }
    }

    const product = await this.prisma.product.create({
      data: {
        ...createProductDto,
        supplierId,
      },
      include: {
        inventory: true,
        supplier: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Create initial inventory entry
    await this.prisma.inventory.create({
      data: {
        productId: product.id,
        quantityInBaseUom: 0,
        reservedQuantity: 0,
      },
    });

    this.logger.log(
      `Product created: ${product.name} by supplier ${supplierId}`,
    );
    return product;
  }

  async findAll(includeInactive = false) {
    const products = await this.prisma.product.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        inventory: true,
        supplier: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return products.map((product) => ({
      ...product,
      availableStock: product.inventory?.quantityInBaseUom?.toNumber() || 0,
    }));
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        inventory: true,
        supplier: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return {
      ...product,
      availableStock: product.inventory?.quantityInBaseUom?.toNumber() || 0,
    };
  }

  async findBySupplier(supplierId: number, includeInactive = false) {
    const products = await this.prisma.product.findMany({
      where: {
        supplierId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        inventory: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return products.map((product) => ({
      ...product,
      availableStock: product.inventory?.quantityInBaseUom?.toNumber() || 0,
    }));
  }

  async update(
    id: number,
    updateProductDto: UpdateProductDto,
    userId: number,
    userRole: UserRole,
  ) {
    const product = await this.findOne(id);

    // Check ownership for suppliers
    if (userRole === UserRole.SUPPLIER && product.supplierId !== userId) {
      throw new ForbiddenException('You can only update your own products');
    }

    // Check SKU uniqueness if being updated
    if (updateProductDto.sku && updateProductDto.sku !== product.sku) {
      const existingSku = await this.prisma.product.findUnique({
        where: { sku: updateProductDto.sku },
      });
      if (existingSku) {
        throw new ConflictException('SKU already exists');
      }
    }

    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: updateProductDto,
      include: {
        inventory: true,
        supplier: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    this.logger.log(
      `Product updated: ${updatedProduct.name} by user ${userId}`,
    );
    return {
      ...updatedProduct,
      availableStock:
        updatedProduct.inventory?.quantityInBaseUom?.toNumber() || 0,
    };
  }

  async updateStock(
    id: number,
    updateStockDto: UpdateStockDto,
    userId: number,
    userRole: UserRole,
  ) {
    const product = await this.findOne(id);

    // Check ownership for suppliers
    if (userRole === UserRole.SUPPLIER && product.supplierId !== userId) {
      throw new ForbiddenException(
        'You can only update stock for your own products',
      );
    }

    // Validate UOM compatibility
    if (!this.uomConversion.isCompatible(updateStockDto.uom, product.baseUom)) {
      throw new ConflictException(
        `Cannot convert ${updateStockDto.uom} to ${product.baseUom}`,
      );
    }

    // Convert quantity to base UOM
    const quantityInBaseUom = this.uomConversion.convertToBaseUom(
      updateStockDto.quantity,
      updateStockDto.uom,
      product.baseUom,
    );

    // Update inventory atomically
    const updatedInventory = await this.prisma.inventory.update({
      where: { productId: id },
      data: {
        quantityInBaseUom: {
          increment: quantityInBaseUom,
        },
        lastRestockedAt: quantityInBaseUom > 0 ? new Date() : undefined,
      },
    });

    // Prevent negative stock
    if (updatedInventory.quantityInBaseUom.lt(0)) {
      throw new ConflictException('Insufficient stock for this operation');
    }

    this.logger.log(
      `Stock updated for product ${id}: ${updateStockDto.quantity} ${updateStockDto.uom} (${quantityInBaseUom} base units)`,
    );

    return {
      ...product,
      availableStock: updatedInventory.quantityInBaseUom.toNumber(),
      inventory: updatedInventory,
    };
  }

  async remove(id: number, userId: number, userRole: UserRole) {
    const product = await this.findOne(id);

    // Check ownership for suppliers
    if (userRole === UserRole.SUPPLIER && product.supplierId !== userId) {
      throw new ForbiddenException('You can only delete your own products');
    }

    // Soft delete by setting isActive to false
    const deletedProduct = await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });

    this.logger.log(
      `Product soft deleted: ${deletedProduct.name} by user ${userId}`,
    );
    return { message: 'Product deleted successfully' };
  }

  async checkStockAvailability(
    productId: number,
    requiredQuantityInBase: number,
  ) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { productId },
    });

    if (!inventory) {
      return { available: false, availableQuantity: 0 };
    }

    const availableQuantity = inventory.quantityInBaseUom
      .sub(inventory.reservedQuantity)
      .toNumber();

    return {
      available: availableQuantity >= requiredQuantityInBase,
      availableQuantity,
      totalStock: inventory.quantityInBaseUom.toNumber(),
      reservedQuantity: inventory.reservedQuantity.toNumber(),
    };
  }
}
