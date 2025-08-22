import { Test, TestingModule } from '@nestjs/testing';
import { UomConversionService } from './uom-conversion.service';
import { BaseUom, RequestedUom } from '@prisma/client';

describe('UomConversionService', () => {
  let service: UomConversionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UomConversionService],
    }).compile();

    service = module.get<UomConversionService>(UomConversionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isCompatible', () => {
    it('should return true for compatible weight units', () => {
      expect(service.isCompatible(RequestedUom.KILOGRAM, BaseUom.GRAM)).toBe(
        true,
      );
      expect(service.isCompatible(RequestedUom.GRAM, BaseUom.GRAM)).toBe(true);
      expect(service.isCompatible(RequestedUom.TON, BaseUom.GRAM)).toBe(true);
    });

    it('should return true for compatible volume units', () => {
      expect(service.isCompatible(RequestedUom.LITER, BaseUom.MILLILITER)).toBe(
        true,
      );
      expect(
        service.isCompatible(RequestedUom.MILLILITER, BaseUom.MILLILITER),
      ).toBe(true);
    });

    it('should return true for same units', () => {
      expect(service.isCompatible(RequestedUom.PIECE, BaseUom.PIECE)).toBe(
        true,
      );
      expect(service.isCompatible(RequestedUom.METER, BaseUom.METER)).toBe(
        true,
      );
    });

    it('should return false for incompatible units', () => {
      expect(
        service.isCompatible(RequestedUom.KILOGRAM, BaseUom.MILLILITER),
      ).toBe(false);
      expect(service.isCompatible(RequestedUom.LITER, BaseUom.GRAM)).toBe(
        false,
      );
      expect(service.isCompatible(RequestedUom.METER, BaseUom.PIECE)).toBe(
        false,
      );
    });
  });

  describe('convertToBaseUom', () => {
    describe('weight conversions to grams', () => {
      it('should convert kilograms to grams', () => {
        expect(
          service.convertToBaseUom(2, RequestedUom.KILOGRAM, BaseUom.GRAM),
        ).toBe(2000);
        expect(
          service.convertToBaseUom(0.5, RequestedUom.KILOGRAM, BaseUom.GRAM),
        ).toBe(500);
      });

      it('should convert grams to grams (no conversion)', () => {
        expect(
          service.convertToBaseUom(1000, RequestedUom.GRAM, BaseUom.GRAM),
        ).toBe(1000);
      });

      it('should convert tons to grams', () => {
        expect(
          service.convertToBaseUom(1, RequestedUom.TON, BaseUom.GRAM),
        ).toBe(1000000);
      });
    });

    describe('volume conversions to milliliters', () => {
      it('should convert liters to milliliters', () => {
        expect(
          service.convertToBaseUom(2, RequestedUom.LITER, BaseUom.MILLILITER),
        ).toBe(2000);
        expect(
          service.convertToBaseUom(0.5, RequestedUom.LITER, BaseUom.MILLILITER),
        ).toBe(500);
      });

      it('should convert milliliters to milliliters (no conversion)', () => {
        expect(
          service.convertToBaseUom(
            1000,
            RequestedUom.MILLILITER,
            BaseUom.MILLILITER,
          ),
        ).toBe(1000);
      });
    });

    describe('same unit conversions', () => {
      it('should return same value for identical units', () => {
        expect(
          service.convertToBaseUom(100, RequestedUom.PIECE, BaseUom.PIECE),
        ).toBe(100);
        expect(
          service.convertToBaseUom(50, RequestedUom.METER, BaseUom.METER),
        ).toBe(50);
      });
    });

    it('should throw error for incompatible units', () => {
      expect(() =>
        service.convertToBaseUom(1, RequestedUom.KILOGRAM, BaseUom.MILLILITER),
      ).toThrow('No conversion rule found from KILOGRAM to MILLILITER');
    });

    it('should handle decimal quantities correctly', () => {
      expect(
        service.convertToBaseUom(1.5, RequestedUom.KILOGRAM, BaseUom.GRAM),
      ).toBe(1500);
      expect(
        service.convertToBaseUom(2.5, RequestedUom.LITER, BaseUom.MILLILITER),
      ).toBe(2500);
    });

    it('should handle zero quantities', () => {
      expect(
        service.convertToBaseUom(0, RequestedUom.KILOGRAM, BaseUom.GRAM),
      ).toBe(0);
    });

    it('should handle large quantities', () => {
      expect(
        service.convertToBaseUom(1000, RequestedUom.KILOGRAM, BaseUom.GRAM),
      ).toBe(1000000);
    });
  });

  describe('edge cases', () => {
    it('should handle very small decimal quantities', () => {
      expect(
        service.convertToBaseUom(0.001, RequestedUom.KILOGRAM, BaseUom.GRAM),
      ).toBe(1);
    });

    it('should handle negative quantities (if business logic allows)', () => {
      expect(
        service.convertToBaseUom(-1, RequestedUom.KILOGRAM, BaseUom.GRAM),
      ).toBe(-1000);
    });
  });
});
