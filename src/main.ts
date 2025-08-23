import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as helmet from 'helmet';
import { AppModule } from './app.module';
import { ValidationPipe } from './common/pipes/validation.pipe';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
// import { ErrorLoggingInterceptor } from './common/interceptors/error-logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  app.use(
    helmet.default({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.useStaticAssets(join(__dirname, '..', 'public'));

  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production'
        ? process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
        : true,
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(ValidationPipe);

  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger Configuration - Production Ready
  const config = new DocumentBuilder()
    .setTitle('Order Management System API')
    .setDescription(
      `A comprehensive B2B order management platform API built on NestJS.

      This API provides a robust set of endpoints for managing orders, products, users, and admin operations.
      It includes features like authentication, authorization, product catalog management, order processing, and real-time analytics.

**Roles:**(test credentials available after db seeding)
- **Admin**: Full system access, order lifecycle management, analytics

      Test Admin Creds: admin@oms.com, password: password123

- **Supplier**: Product & inventory management, view incoming orders

      Test Supplier Creds: supplier1@oms.com, password: password123

- **Buyer**: Browse products, place orders, track order status

      Test Buyer Creds: buyer1@oms.com, password: password123

**Environment:** ${process.env.NODE_ENV || 'development'}`,
    )
    .setVersion('1.0')
    .addServer(
      process.env.NODE_ENV === 'production'
        ? 'https://oms-api.onrender.com'
        : 'http://localhost:3000',
      process.env.NODE_ENV === 'production'
        ? 'Production Server'
        : 'Development Server',
    )
    .addTag('Authentication', 'User authentication and authorization')
    .addTag('Products', 'Product catalog and inventory management')
    .addTag('Orders', 'Order lifecycle and management')
    .addTag('Users', 'User profile and management')
    .addTag('Admin', 'Administrative operations and analytics')
    .addTag('Health', 'System health and monitoring')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
    deepScanRoutes: true,
  });

  const swaggerOptions = {
    explorer: true,
    swaggerOptions: {
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
      tryItOutEnabled: true,
      persistAuthorization: true,
      displayRequestDuration: true,
      defaultModelsExpandDepth: 2,
      defaultModelExpandDepth: 2,
      displayOperationId: false,
      showExtensions: false,
      showCommonExtensions: false,
    },
    customCss: `
      .swagger-ui .topbar { display: none; }
      .swagger-ui .info .title { color: #3b82f6; font-size: 2rem; }
      .swagger-ui .info .description { font-size: 1rem; line-height: 1.6; }
      .swagger-ui .info .version { background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; }
      .swagger-ui .scheme-container { background: #f8fafc; padding: 10px; border-radius: 8px; margin: 10px 0; }
    `,
    customSiteTitle: 'OMS API Documentation',
    customfavIcon: '/favicon.ico',
  };

  SwaggerModule.setup('', app, document, swaggerOptions);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(
    `Application is running on: ${process.env.NODE_ENV === 'production' ? 'https://oms-api.onrender.com' : 'http://localhost:3000'}`,
  );
  console.log(
    `Swagger documentation available at: ${process.env.NODE_ENV === 'production' ? 'https://oms-api.onrender.com' : 'http://localhost:3000'}`,
  );
  console.log(
    `Health endpoint: ${process.env.NODE_ENV === 'production' ? 'https://oms-api.onrender.com' : 'http://localhost:3000'}/api/health`,
  );
  console.log(
    `WebSocket test page available at: ${process.env.NODE_ENV === 'production' ? 'https://oms-api.onrender.com' : 'http://localhost:3000'}/websocket-test.html`,
  );
  console.log(
    `WebSocket endpoint: ${process.env.NODE_ENV === 'production' ? 'https://oms-api.onrender.com' : 'http://localhost:3000'}/orders`,
  );
}
void bootstrap();
