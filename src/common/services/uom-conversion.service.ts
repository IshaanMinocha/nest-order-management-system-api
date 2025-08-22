import { Injectable } from '@nestjs/common';
import { BaseUom, RequestedUom } from '@prisma/client';

export interface ConversionRule {
  from: RequestedUom;
  to: BaseUom;
  factor: number;
}

@Injectable()
export class UomConversionService {
  private readonly conversionRules: ConversionRule[] = [
    // Weight conversions to GRAM
    { from: RequestedUom.GRAM, to: BaseUom.GRAM, factor: 1 },
    { from: RequestedUom.KILOGRAM, to: BaseUom.GRAM, factor: 1000 },
    { from: RequestedUom.TON, to: BaseUom.GRAM, factor: 1000000 },

    // Volume conversions to MILLILITER
    { from: RequestedUom.MILLILITER, to: BaseUom.MILLILITER, factor: 1 },
    { from: RequestedUom.LITER, to: BaseUom.MILLILITER, factor: 1000 },

    // Length conversions to METER
    { from: RequestedUom.METER, to: BaseUom.METER, factor: 1 },
    { from: RequestedUom.CENTIMETER, to: BaseUom.METER, factor: 0.01 },
    { from: RequestedUom.KILOMETER, to: BaseUom.METER, factor: 1000 },

    // Count conversions
    { from: RequestedUom.PIECE, to: BaseUom.PIECE, factor: 1 },

    // Cross conversions for weight
    { from: RequestedUom.KILOGRAM, to: BaseUom.KILOGRAM, factor: 1 },
    { from: RequestedUom.GRAM, to: BaseUom.KILOGRAM, factor: 0.001 },

    // Cross conversions for volume
    { from: RequestedUom.LITER, to: BaseUom.LITER, factor: 1 },
    { from: RequestedUom.MILLILITER, to: BaseUom.LITER, factor: 0.001 },
  ];

  convertToBaseUom(
    quantity: number,
    requestedUom: RequestedUom,
    baseUom: BaseUom,
  ): number {
    const rule = this.conversionRules.find(
      (r) => r.from === requestedUom && r.to === baseUom,
    );

    if (!rule) {
      throw new Error(
        `No conversion rule found from ${requestedUom} to ${baseUom}`,
      );
    }

    return quantity * rule.factor;
  }

  isCompatible(requestedUom: RequestedUom, baseUom: BaseUom): boolean {
    return this.conversionRules.some(
      (rule) => rule.from === requestedUom && rule.to === baseUom,
    );
  }

  getCompatibleUoms(baseUom: BaseUom): RequestedUom[] {
    return this.conversionRules
      .filter((rule) => rule.to === baseUom)
      .map((rule) => rule.from);
  }

  formatQuantity(
    quantityInBase: number,
    baseUom: BaseUom,
    displayUom?: RequestedUom,
  ): { quantity: number; uom: string } {
    if (!displayUom) {
      return { quantity: quantityInBase, uom: baseUom };
    }

    const rule = this.conversionRules.find(
      (r) => r.from === displayUom && r.to === baseUom,
    );

    if (!rule) {
      return { quantity: quantityInBase, uom: baseUom };
    }

    return {
      quantity: quantityInBase / rule.factor,
      uom: displayUom,
    };
  }
}
