import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { ValidationPipe } from './common/pipes/validation.pipe';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  // Serve static files for WebSocket test page
  app.useStaticAssets(join(__dirname, '..', 'public'));

  app.enableCors();

  app.setGlobalPrefix('api');

  app.useGlobalPipes(ValidationPipe);

  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Order Management System API')
    .setDescription('A comprehensive B2B order management platform API')
    .setVersion('1.0')
    .addTag('orders', 'Order management operations')
    .addTag('products', 'Product catalog operations')
    .addTag('users', 'User management operations')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}/api/v1`);
  console.log(
    `Swagger documentation available at: http://localhost:${port}/docs`,
  );
  console.log(
    `WebSocket test page available at: http://localhost:${port}/websocket-test.html`,
  );
  console.log(`WebSocket endpoint: ws://localhost:${port}/orders`);
}
void bootstrap();
