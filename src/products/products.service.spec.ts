import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { UomConversionService } from '../common/services/uom-conversion.service';
import { BaseUom, RequestedUom, UserRole } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

describe('ProductsService', () => {
  let service: ProductsService;

  const mockProduct = {
    id: 1,
    supplierId: 1,
    name: 'Test Product',
    description: 'A test product',
    baseUom: BaseUom.GRAM,
    conversionFactorToBase: new Decimal(1),
    pricePerBaseUom: new Decimal(0.05),
    sku: 'TEST-001',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    inventory: {
      id: 1,
      productId: 1,
      quantityInBaseUom: new Decimal(5000),
      reservedQuantity: new Decimal(0),
      lastRestockedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    supplier: {
      id: 1,
      email: 'supplier@oms.com',
      firstName: 'Test',
      lastName: 'Supplier',
    },
  };

  const mockPrismaService = {
    product: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    inventory: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockUomConversionService = {
    isCompatible: jest.fn(),
    convertToBaseUom: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: UomConversionService,
          useValue: mockUomConversionService,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createProductDto = {
      name: 'New Product',
      description: 'A new product',
      baseUom: BaseUom.GRAM,
      conversionFactorToBase: 1,
      pricePerBaseUom: 0.05,
      sku: 'NEW-001',
    };

    it('should create a product successfully', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(null); // SKU not exists
      mockPrismaService.product.create.mockResolvedValue(mockProduct);
      mockPrismaService.inventory.create.mockResolvedValue(
        mockProduct.inventory,
      );

      const result = await service.create(1, createProductDto);

      expect(result).toEqual(mockProduct);
      expect(mockPrismaService.product.findUnique).toHaveBeenCalledWith({
        where: { sku: 'NEW-001' },
      });
      expect(mockPrismaService.inventory.create).toHaveBeenCalledWith({
        data: {
          productId: mockProduct.id,
          quantityInBaseUom: 0,
          reservedQuantity: 0,
        },
      });
    });

    it('should throw ConflictException when SKU already exists', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);

      await expect(service.create(1, createProductDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should create product without SKU', async () => {
      const createDtoWithoutSku = { ...createProductDto, sku: undefined };
      mockPrismaService.product.create.mockResolvedValue(mockProduct);
      mockPrismaService.inventory.create.mockResolvedValue(
        mockProduct.inventory,
      );

      const result = await service.create(1, createDtoWithoutSku);

      expect(result).toEqual(mockProduct);
      expect(mockPrismaService.product.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all active products by default', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([mockProduct]);

      const result = await service.findAll();

      expect(result).toEqual([
        {
          ...mockProduct,
          availableStock: 5000,
        },
      ]);
      expect(mockPrismaService.product.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
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
    });

    it('should return all products including inactive when requested', async () => {
      await service.findAll(true);

      expect(mockPrismaService.product.findMany).toHaveBeenCalledWith({
        where: {},
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a product with available stock', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);

      const result = await service.findOne(1);

      expect(result).toEqual({
        ...mockProduct,
        availableStock: 5000,
      });
    });

    it('should throw NotFoundException when product does not exist', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStock', () => {
    const updateStockDto = {
      quantity: 2,
      uom: RequestedUom.KILOGRAM,
    };

    it('should update stock successfully for supplier', async () => {
      const updatedInventory = {
        ...mockProduct.inventory,
        quantityInBaseUom: new Decimal(7000), // 5000 + 2000
      };

      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);
      mockUomConversionService.isCompatible.mockReturnValue(true);
      mockUomConversionService.convertToBaseUom.mockReturnValue(2000);
      mockPrismaService.inventory.update.mockResolvedValue(updatedInventory);

      const result = await service.updateStock(
        1,
        updateStockDto,
        1,
        UserRole.SUPPLIER,
      );

      expect(result).toEqual({
        ...mockProduct,
        availableStock: 7000,
        inventory: updatedInventory,
      });
      expect(mockUomConversionService.isCompatible).toHaveBeenCalledWith(
        RequestedUom.KILOGRAM,
        BaseUom.GRAM,
      );
      expect(mockUomConversionService.convertToBaseUom).toHaveBeenCalledWith(
        2,
        RequestedUom.KILOGRAM,
        BaseUom.GRAM,
      );
      expect(mockPrismaService.inventory.update).toHaveBeenCalledWith({
        where: { productId: 1 },
        data: {
          quantityInBaseUom: { increment: 2000 },
          lastRestockedAt: expect.any(Date),
        },
      });
    });

    it('should throw ForbiddenException when supplier tries to update other supplier product', async () => {
      const otherSupplierProduct = { ...mockProduct, supplierId: 2 };
      mockPrismaService.product.findUnique.mockResolvedValue(
        otherSupplierProduct,
      );

      await expect(
        service.updateStock(1, updateStockDto, 1, UserRole.SUPPLIER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException for incompatible UOM', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);
      mockUomConversionService.isCompatible.mockReturnValue(false);

      await expect(
        service.updateStock(1, updateStockDto, 1, UserRole.SUPPLIER),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when stock would go negative', async () => {
      const negativeStockUpdate = {
        quantity: -10,
        uom: RequestedUom.KILOGRAM,
      };

      const insufficientInventory = {
        ...mockProduct.inventory,
        quantityInBaseUom: new Decimal(-5000), // Would be negative
      };

      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);
      mockUomConversionService.isCompatible.mockReturnValue(true);
      mockUomConversionService.convertToBaseUom.mockReturnValue(-10000);
      mockPrismaService.inventory.update.mockResolvedValue(
        insufficientInventory,
      );

      await expect(
        service.updateStock(1, negativeStockUpdate, 1, UserRole.SUPPLIER),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow admin to update any product stock', async () => {
      const otherSupplierProduct = { ...mockProduct, supplierId: 2 };
      const updatedInventory = {
        ...mockProduct.inventory,
        quantityInBaseUom: new Decimal(7000),
      };

      mockPrismaService.product.findUnique.mockResolvedValue(
        otherSupplierProduct,
      );
      mockUomConversionService.isCompatible.mockReturnValue(true);
      mockUomConversionService.convertToBaseUom.mockReturnValue(2000);
      mockPrismaService.inventory.update.mockResolvedValue(updatedInventory);

      const result = await service.updateStock(
        1,
        updateStockDto,
        1,
        UserRole.ADMIN,
      );

      expect(result.availableStock).toBe(7000);
    });

    it('should not set lastRestockedAt when decrementing stock', async () => {
      const decrementDto = {
        quantity: -1,
        uom: RequestedUom.KILOGRAM,
      };

      const updatedInventory = {
        ...mockProduct.inventory,
        quantityInBaseUom: new Decimal(4000),
      };

      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);
      mockUomConversionService.isCompatible.mockReturnValue(true);
      mockUomConversionService.convertToBaseUom.mockReturnValue(-1000);
      mockPrismaService.inventory.update.mockResolvedValue(updatedInventory);

      await service.updateStock(1, decrementDto, 1, UserRole.SUPPLIER);

      expect(mockPrismaService.inventory.update).toHaveBeenCalledWith({
        where: { productId: 1 },
        data: {
          quantityInBaseUom: { increment: -1000 },
          lastRestockedAt: undefined,
        },
      });
    });
  });

  describe('checkStockAvailability', () => {
    it('should return availability information', async () => {
      mockPrismaService.inventory.findUnique.mockResolvedValue(
        mockProduct.inventory,
      );

      const result = await service.checkStockAvailability(1, 2000);

      expect(result).toEqual({
        available: true,
        availableQuantity: 5000,
        totalStock: 5000,
        reservedQuantity: 0,
      });
    });

    it('should return false when not enough stock', async () => {
      mockPrismaService.inventory.findUnique.mockResolvedValue(
        mockProduct.inventory,
      );

      const result = await service.checkStockAvailability(1, 6000);

      expect(result).toEqual({
        available: false,
        availableQuantity: 5000,
        totalStock: 5000,
        reservedQuantity: 0,
      });
    });

    it('should handle reserved quantity correctly', async () => {
      const inventoryWithReserved = {
        ...mockProduct.inventory,
        reservedQuantity: new Decimal(2000),
      };
      mockPrismaService.inventory.findUnique.mockResolvedValue(
        inventoryWithReserved,
      );

      const result = await service.checkStockAvailability(1, 3500);

      expect(result).toEqual({
        available: false, // 5000 - 2000 = 3000 available, need 3500
        availableQuantity: 3000,
        totalStock: 5000,
        reservedQuantity: 2000,
      });
    });

    it('should return false when inventory does not exist', async () => {
      mockPrismaService.inventory.findUnique.mockResolvedValue(null);

      const result = await service.checkStockAvailability(1, 100);

      expect(result).toEqual({
        available: false,
        availableQuantity: 0,
      });
    });
  });

  describe('remove', () => {
    it('should soft delete product for supplier', async () => {
      const deletedProduct = { ...mockProduct, isActive: false };
      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);
      mockPrismaService.product.update.mockResolvedValue(deletedProduct);

      const result = await service.remove(1, 1, UserRole.SUPPLIER);

      expect(result).toEqual({ message: 'Product deleted successfully' });
      expect(mockPrismaService.product.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isActive: false },
      });
    });

    it('should throw ForbiddenException when supplier tries to delete other supplier product', async () => {
      const otherSupplierProduct = { ...mockProduct, supplierId: 2 };
      mockPrismaService.product.findUnique.mockResolvedValue(
        otherSupplierProduct,
      );

      await expect(service.remove(1, 1, UserRole.SUPPLIER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow admin to delete any product', async () => {
      const otherSupplierProduct = { ...mockProduct, supplierId: 2 };
      const deletedProduct = { ...otherSupplierProduct, isActive: false };
      mockPrismaService.product.findUnique.mockResolvedValue(
        otherSupplierProduct,
      );
      mockPrismaService.product.update.mockResolvedValue(deletedProduct);

      const result = await service.remove(1, 1, UserRole.ADMIN);

      expect(result).toEqual({ message: 'Product deleted successfully' });
    });
  });
});
