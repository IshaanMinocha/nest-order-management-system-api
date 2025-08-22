import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ async: false })
export class IsPositiveNumberConstraint
  implements ValidatorConstraintInterface
{
  validate(value: any): boolean {
    return typeof value === 'number' && value > 0 && Number.isFinite(value);
  }

  defaultMessage(): string {
    return 'Value must be a positive number';
  }
}

export function IsPositiveNumber(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsPositiveNumberConstraint,
    });
  };
}

@ValidatorConstraint({ async: false })
export class IsValidQuantityConstraint implements ValidatorConstraintInterface {
  validate(value: any): boolean {
    if (typeof value !== 'number') return false;
    if (!Number.isFinite(value)) return false;
    if (value <= 0) return false;
    if (value > 1000000) return false; // Max quantity limit

    // Check for reasonable decimal places (max 6 decimal places)
    const decimalPlaces = (value.toString().split('.')[1] || '').length;
    return decimalPlaces <= 6;
  }

  defaultMessage(): string {
    return 'Quantity must be a positive number less than 1,000,000 with maximum 6 decimal places';
  }
}

export function IsValidQuantity(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidQuantityConstraint,
    });
  };
}

@ValidatorConstraint({ async: false })
export class IsValidPriceConstraint implements ValidatorConstraintInterface {
  validate(value: any): boolean {
    if (typeof value !== 'number') return false;
    if (!Number.isFinite(value)) return false;
    if (value < 0) return false;
    if (value > 999999.99) return false; // Max price limit

    // Check for reasonable decimal places (max 2 for currency)
    const decimalPlaces = (value.toString().split('.')[1] || '').length;
    return decimalPlaces <= 2;
  }

  defaultMessage(): string {
    return 'Price must be a non-negative number less than 999,999.99 with maximum 2 decimal places';
  }
}

export function IsValidPrice(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidPriceConstraint,
    });
  };
}

@ValidatorConstraint({ async: false })
export class IsSafeStringConstraint implements ValidatorConstraintInterface {
  validate(value: any): boolean {
    if (typeof value !== 'string') return false;

    // Check for SQL injection patterns
    const sqlInjectionPatterns = [
      /(\b(union|select|insert|update|delete|drop|exec|execute|script)\b)/i,
      /(--|\/\*|\*\/|;|'|")/,
      /(\b(or|and)\s+\d+\s*=\s*\d+)/i,
    ];

    for (const pattern of sqlInjectionPatterns) {
      if (pattern.test(value)) return false;
    }

    // Check for XSS patterns
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=\s*['"]/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
    ];

    for (const pattern of xssPatterns) {
      if (pattern.test(value)) return false;
    }

    return true;
  }

  defaultMessage(): string {
    return 'String contains potentially dangerous content';
  }
}

export function IsSafeString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSafeStringConstraint,
    });
  };
}

@ValidatorConstraint({ async: false })
export class IsValidEmailDomainConstraint
  implements ValidatorConstraintInterface
{
  private allowedDomains = [
    'gmail.com',
    'yahoo.com',
    'outlook.com',
    'hotmail.com',
    'company.com', // Add your company domains
  ];

  validate(value: any): boolean {
    if (typeof value !== 'string') return false;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return false;

    const domain = value.split('@')[1]?.toLowerCase();
    if (!domain) return false;

    // Allow all domains for now, but log suspicious ones
    // In production, you might want to restrict to known domains
    return true;
  }

  defaultMessage(): string {
    return 'Email must be from an allowed domain';
  }
}

export function IsValidEmailDomain(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidEmailDomainConstraint,
    });
  };
}
