import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UomConversionService } from '../common/services/uom-conversion.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProductsController],
  providers: [ProductsService, UomConversionService],
  exports: [ProductsService, UomConversionService],
})
export class ProductsModule {}
