import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto, UpdateStockDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { UserRole, User } from '@prisma/client';

@ApiTags('Products')
@Controller('v1/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPPLIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new product (Supplier only)' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Supplier role required',
  })
  create(
    @Body() createProductDto: CreateProductDto,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
  ) {
    return this.productsService.create(user.id, createProductDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all active products (Public endpoint)' })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    description: 'Include inactive products',
    type: Boolean,
  })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.productsService.findAll(includeInactive === 'true');
  }

  @Get('my-products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPPLIER)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get supplier's own products" })
  @ApiResponse({
    status: 200,
    description: 'Supplier products retrieved successfully',
  })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    description: 'Include inactive products',
    type: Boolean,
  })
  findMyProducts(
    @CurrentUser() user: Omit<User, 'passwordHash'>,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.productsService.findBySupplier(
      user.id,
      includeInactive === 'true',
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPPLIER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product (Supplier owns or Admin)' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not product owner' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
  ) {
    return this.productsService.update(
      id,
      updateProductDto,
      user.id,
      user.role,
    );
  }

  @Patch(':id/stock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPPLIER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product stock (Supplier owns or Admin)' })
  @ApiResponse({ status: 200, description: 'Stock updated successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid UOM conversion or insufficient stock',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Not product owner' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  updateStock(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateStockDto: UpdateStockDto,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
  ) {
    return this.productsService.updateStock(
      id,
      updateStockDto,
      user.id,
      user.role,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPPLIER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete product (Supplier owns or Admin)' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not product owner' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: Omit<User, 'passwordHash'>,
  ) {
    return this.productsService.remove(id, user.id, user.role);
  }

  @Get(':id/stock-availability')
  @ApiOperation({ summary: 'Check stock availability for a product' })
  @ApiResponse({ status: 200, description: 'Stock availability retrieved' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiQuery({
    name: 'quantity',
    required: true,
    description: 'Required quantity in base UOM',
    type: Number,
  })
  checkStockAvailability(
    @Param('id', ParseIntPipe) id: number,
    @Query('quantity', ParseIntPipe) quantity: number,
  ) {
    return this.productsService.checkStockAvailability(id, quantity);
  }
}
