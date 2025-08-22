import { ValidationPipe as NestValidationPipe } from '@nestjs/common';

export const ValidationPipe = new NestValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  disableErrorMessages: false,
});
