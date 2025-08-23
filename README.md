# Order Management System API

## Description

Mini Order Management System (OMS) API — a modular, secure, and testable backend for a fictional B2B marketplace where buyers place multi-item orders from suppliers. The system models realistic order lifecycles, enforces stock rules with units of measure and conversion factors, and provides role-based APIs for Buyers, Suppliers, and Admins.

## Architecture & Tech Stack

- **Runtime**: Node.js 20
- **Framework**: NestJS 11
- **Language**: TypeScript
- **Database**: PostgreSQL 16
- **ORM**: Prisma with migrations
- **Authentication**: JWT with Passport
- **Authorization**: Role-based access control (RBAC)
- **Validation**: class-validator, class-transformer
- **Documentation**: Swagger
- **Real-time**: WebSocket Gateway (Socket.IO)
- **Testing**: Jest (unit), Supertest (e2e)
- **Containerization**: Docker + docker-compose
- **Tooling**: ESLint, Prettier, dotenv/config module, Prisma CLI
- **Security**: Helmet, CORS, Rate limiting, Circuit breaker

## Core Features

- Multi-role authentication and authorization system
- Product catalog management with inventory tracking
- Multi-item order processing with UOM conversions
- Order lifecycle management with status tracking
- Real-time WebSocket updates for order changes
- Comprehensive analytics and reporting
- Health monitoring and performance metrics
- Production-ready security and observability

## User Roles

- **Admin**: Full system access, order lifecycle management, analytics
- **Supplier**: Product and inventory management, view incoming orders
- **Buyer**: Browse products, place orders, track order status

## Getting Started

### Prerequisites

- Node.js 20 LTS
- PostgreSQL 16 (for local development)
- Docker & Docker Compose (for containerized deployment)

### Local Development Setup

1. **Clone and Install Dependencies**

```bash
git clone https://github.com/IshaanMinocha/nest-order-management-system-api.git
cd nest-order-management-system-api
npm install
```

2. **Environment Configuration**
(create .env file)

```bash
NODE_ENV=development
PORT=3000
DATABASE_URL="postgresql://username:password@localhost:5432/oms_db?schema=public"
JWT_SECRET=your-super-secret-jwt-key
LOG_LEVEL=info
ADMIN_EMAIL=admin@oms.com
ADMIN_PASSWORD=password123
```

3. **Database Setup**

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

4. **Start Development Server**

```bash
npm run start:dev
```

### Postman Integration

To quickly access all API endpoints in Postman:

1. Go to the `/postman/oms-api-collections.json` file in this repository.
2. Copy the entire contents of the JSON file.
3. In Postman, click on **Import**.
4. Select the **Raw Text** tab and paste the copied JSON.
5. Click **Continue** and then **Import**.

This will add the complete set of API endpoints to your Postman workspace for easy testing and exploration.

### Docker Deployment

#### Quick Start

```bash
# start all services(docker desktop should be running)
npm run docker:up
# check status
docker-compose ps
# Stop services
docker-compose down
```

#### Database Operations

```bash
# Run migrations
docker-compose exec app npx prisma migrate deploy
# Seed database
docker-compose exec app npx prisma db seed
# Access PostgreSQL shell
docker-compose exec postgres psql -U oms_user -d oms_db
```

## API Endpoints

### Authentication

- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User authentication

### Products (Public & Supplier)

- `GET /api/v1/products` - List all products
- `GET /api/v1/products/my-products` - Supplier's products
- `POST /api/v1/products` - Create product (Supplier)
- `PUT /api/v1/products/{id}` - Update product (Supplier)
- `PATCH /api/v1/products/{id}/stock` - Update inventory (Supplier)
- `GET /api/v1/products/{id}/stock-availability` - Check stock

### Orders (Authenticated)

- `POST /api/v1/orders` - Place new order (Buyer)
- `GET /api/v1/orders` - List user's orders (Buyer)
- `GET /api/v1/orders/supplier-orders` - List incoming orders (Supplier)
- `GET /api/v1/orders/{id}` - Get order details

### Admin Operations

- `PATCH /api/v1/admin/orders/{id}/status` - Update order status
- `GET /api/v1/admin/analytics` - System analytics

### User Profile

- `GET /api/v1/profile` - Get current user profile

### Health & Monitoring

- `GET /api/health` - Basic health check
- `GET /api/health/detailed` - Detailed health information
- `GET /api/health/performance` - Performance metrics
- `GET /api/health/circuits` - Circuit breaker status

## Data Model

### Core Entities

- **users**: User accounts with roles and authentication
- **products**: Product catalog with UOM and pricing
- **inventory**: Stock levels per product in base units
- **orders**: Order headers with buyer and status
- **order_items**: Individual line items with quantities and UOM
- **order_status_history**: Complete audit trail of status changes
- **audit_log**: System-wide audit logging

## Test Credentials

After seeding the database, use these credentials:

**Admin User**

- Email: admin@oms.com
- Password: password123

**Supplier User**

- Email: supplier1@oms.com
- Password: password123

**Buyer User**

- Email: buyer1@oms.com
- Password: password123

## API Documentation

Interactive Swagger documentation is available at:

- Local: http://localhost:3000/
- Production: https://oms-api.onrender.com/

## WebSocket Integration

Real-time order updates via WebSocket:

- Endpoint: `/orders`
- Test page: `/websocket-test.html`
- Events: Order status changes, new orders

## Testing

### Unit Tests

```bash
npm run test
```

### End-to-End Tests

```bash
npm run test:e2e
```

### Test All

```bash
npm run test:all
```

## Architecture Highlights

### Security Features

- JWT-based authentication with refresh capability
- Role-based authorization guards
- Request rate limiting with memory store
- Security headers via Helmet middleware
- CORS configuration for cross-origin requests
- Input validation and sanitization

### Performance Features

- Circuit breaker pattern for external dependencies
- Performance monitoring with metrics collection
- Request/response compression
- Database connection pooling
- Efficient query optimization with Prisma

### Observability Features

- Structured logging with correlation IDs
- Health check endpoints with dependency validation
- Performance metrics and monitoring
- Error tracking and audit logging
- Graceful shutdown procedures

## Project Structure

```
src/
├── app.module.ts              # Root application module
├── main.ts                    # Application bootstrap
├── config/                    # Configuration management
├── common/                    # Shared utilities and middleware
│   ├── filters/              # Exception filters
│   ├── guards/               # Authentication guards
│   ├── interceptors/         # Request/response interceptors
│   ├── middleware/           # Custom middleware
│   ├── pipes/                # Validation pipes
│   └── services/             # Shared services
├── auth/                     # Authentication module
├── products/                 # Product management
├── orders/                   # Order processing
├── admin/                    # Administrative operations
├── health/                   # Health monitoring
├── websockets/               # Real-time communication
└── prisma/                   # Database service
```


## Thank You!