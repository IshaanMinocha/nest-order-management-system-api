import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from './create-order-item.dto';

export class CreateOrderDto {
  @ApiProperty({
    description: 'Order items',
    type: [CreateOrderItemDto],
    example: [
      {
        productId: 1,
        quantityRequested: 5,
        requestedUom: 'KILOGRAM',
      },
      {
        productId: 2,
        quantityRequested: 2,
        requestedUom: 'LITER',
      },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiProperty({
    description: 'Additional notes or instructions',
    example: 'Urgent delivery required',
    required: false,
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
