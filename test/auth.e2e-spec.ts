import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordService } from '../src/auth/services/password.service';
import { UserRole } from '@prisma/client';

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;

  const testUsers = {
    admin: {
      id: 1,
      email: 'admin@oms.com',
      firstName: 'Admin',
      lastName: 'User',
      role: UserRole.ADMIN,
      password: 'admin123',
    },
    buyer: {
      id: 2,
      email: 'buyer@oms.com',
      firstName: 'Buyer',
      lastName: 'User',
      role: UserRole.BUYER,
      password: 'buyer123',
    },
    supplier: {
      id: 3,
      email: 'supplier@oms.com',
      firstName: 'Supplier',
      lastName: 'User',
      role: UserRole.SUPPLIER,
      password: 'supplier123',
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply same configuration as main.ts
    app.enableCors();
    app.setGlobalPrefix('api');

    // Import and apply the validation pipe
    const { ValidationPipe } = await import(
      '../src/common/pipes/validation.pipe'
    );
    app.useGlobalPipes(ValidationPipe);

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    passwordService = app.get<PasswordService>(PasswordService);

    // Clean up and seed test data
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
    await app.close();
  });

  const setupTestData = async () => {
    // Clean existing data
    await prisma.user.deleteMany();

    // Create test users
    for (const userData of Object.values(testUsers)) {
      const hashedPassword = await passwordService.hashPassword(
        userData.password,
      );
      await prisma.user.create({
        data: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          passwordHash: hashedPassword,
          isActive: true,
        },
      });
    }
  };

  const cleanupTestData = async () => {
    await prisma.user.deleteMany();
  };

  describe('/api/v1/auth/login (POST)', () => {
    it('should login admin user successfully', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUsers.admin.email,
          password: testUsers.admin.password,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('access_token');
          expect(res.body).toHaveProperty('user');
          expect(res.body.user).toMatchObject({
            email: testUsers.admin.email,
            firstName: testUsers.admin.firstName,
            lastName: testUsers.admin.lastName,
            role: testUsers.admin.role,
          });
          expect(res.body.user).not.toHaveProperty('passwordHash');
        });
    });

    it('should login buyer user successfully', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUsers.buyer.email,
          password: testUsers.buyer.password,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.user.role).toBe(UserRole.BUYER);
        });
    });

    it('should login supplier user successfully', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUsers.supplier.email,
          password: testUsers.supplier.password,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.user.role).toBe(UserRole.SUPPLIER);
        });
    });

    it('should reject login with invalid email', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@oms.com',
          password: 'anypassword',
        })
        .expect(401)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
        });
    });

    it('should reject login with invalid password', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUsers.admin.email,
          password: 'wrongpassword',
        })
        .expect(401);
    });

    it('should reject login with invalid email format', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'invalid-email',
          password: 'password123',
        })
        .expect(400);
    });

    it('should reject login with missing email', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          password: 'password123',
        })
        .expect(400);
    });

    it('should reject login with missing password', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUsers.admin.email,
        })
        .expect(400);
    });
  });

  describe('JWT Token Authentication', () => {
    let adminToken: string;
    let buyerToken: string;
    let supplierToken: string;

    beforeAll(async () => {
      // Get tokens for all user types
      const adminLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUsers.admin.email,
          password: testUsers.admin.password,
        });
      adminToken = adminLogin.body.access_token;

      const buyerLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUsers.buyer.email,
          password: testUsers.buyer.password,
        });
      buyerToken = buyerLogin.body.access_token;

      const supplierLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUsers.supplier.email,
          password: testUsers.supplier.password,
        });
      supplierToken = supplierLogin.body.access_token;
    });

    describe('/api/v1/profile (GET)', () => {
      it('should get admin profile with valid token', () => {
        return request(app.getHttpServer())
          .get('/api/v1/profile')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200)
          .expect((res) => {
            expect(res.body.user).toMatchObject({
              email: testUsers.admin.email,
              role: UserRole.ADMIN,
            });
          });
      });

      it('should get buyer profile with valid token', () => {
        return request(app.getHttpServer())
          .get('/api/v1/profile')
          .set('Authorization', `Bearer ${buyerToken}`)
          .expect(200)
          .expect((res) => {
            expect(res.body.user.role).toBe(UserRole.BUYER);
          });
      });

      it('should get supplier profile with valid token', () => {
        return request(app.getHttpServer())
          .get('/api/v1/profile')
          .set('Authorization', `Bearer ${supplierToken}`)
          .expect(200)
          .expect((res) => {
            expect(res.body.user.role).toBe(UserRole.SUPPLIER);
          });
      });

      it('should reject access without token', () => {
        return request(app.getHttpServer()).get('/api/v1/profile').expect(401);
      });

      it('should reject access with invalid token', () => {
        return request(app.getHttpServer())
          .get('/api/v1/profile')
          .set('Authorization', 'Bearer invalid.token.here')
          .expect(401);
      });

      it('should reject access with malformed Authorization header', () => {
        return request(app.getHttpServer())
          .get('/api/v1/profile')
          .set('Authorization', 'InvalidFormat token')
          .expect(401);
      });
    });

    describe('/api/v1/admin (GET)', () => {
      it('should allow admin access', () => {
        return request(app.getHttpServer())
          .get('/api/v1/admin')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200)
          .expect((res) => {
            expect(res.body.message).toBe('Admin access granted');
          });
      });

      it('should reject buyer access to admin endpoint', () => {
        return request(app.getHttpServer())
          .get('/api/v1/admin')
          .set('Authorization', `Bearer ${buyerToken}`)
          .expect(403);
      });

      it('should reject supplier access to admin endpoint', () => {
        return request(app.getHttpServer())
          .get('/api/v1/admin')
          .set('Authorization', `Bearer ${supplierToken}`)
          .expect(403);
      });

      it('should reject access without token', () => {
        return request(app.getHttpServer()).get('/api/v1/admin').expect(401);
      });
    });
  });

  describe('Token Payload Validation', () => {
    it('should include correct user information in token', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUsers.admin.email,
          password: testUsers.admin.password,
        });

      const token = loginResponse.body.access_token;

      // Decode token payload (without verification for testing)
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString(),
      );

      expect(payload).toMatchObject({
        email: testUsers.admin.email,
        role: UserRole.ADMIN,
        sub: expect.any(Number),
      });
      expect(payload).toHaveProperty('iat');
      expect(payload).toHaveProperty('exp');
    });
  });
});
