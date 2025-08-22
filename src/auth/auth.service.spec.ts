import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './services/password.service';
import { UserRole } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: UserRole.BUYER,
    passwordHash: 'hashedPassword123',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockPasswordService = {
    verifyPassword: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: PasswordService,
          useValue: mockPasswordService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Mock the logger to suppress error messages during testing
    jest.spyOn(service['logger'], 'error').mockImplementation();
    jest.spyOn(service['logger'], 'warn').mockImplementation();
    jest.spyOn(service['logger'], 'log').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return user data without password when credentials are valid', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPasswordService.verifyPassword.mockResolvedValue(true);

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toEqual({
        id: 1,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: UserRole.BUYER,
        isActive: true,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
      });
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com', isActive: true },
      });
      expect(mockPasswordService.verifyPassword).toHaveBeenCalledWith(
        'hashedPassword123',
        'password',
      );
    });

    it('should return null when user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser(
        'nonexistent@example.com',
        'password',
      );

      expect(result).toBeNull();
      expect(mockPasswordService.verifyPassword).not.toHaveBeenCalled();
    });

    it('should return null when user is inactive', async () => {
      // Inactive users won't be found due to isActive: true filter
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toBeNull();
      expect(mockPasswordService.verifyPassword).not.toHaveBeenCalled();
    });

    it('should return null when password is incorrect', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPasswordService.verifyPassword.mockResolvedValue(false);

      const result = await service.validateUser(
        'test@example.com',
        'wrongpassword',
      );

      expect(result).toBeNull();
      expect(mockPasswordService.verifyPassword).toHaveBeenCalledWith(
        'hashedPassword123',
        'wrongpassword',
      );
    });

    it('should handle password verification errors gracefully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPasswordService.verifyPassword.mockRejectedValue(
        new Error('Verification failed'),
      );

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      mockPrismaService.user.findUnique.mockRejectedValue(
        new Error('Database error'),
      );

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    const userWithoutPassword = {
      id: 1,
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: UserRole.BUYER,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return access token and user data', () => {
      const mockToken = 'jwt.token.here';
      mockJwtService.sign.mockReturnValue(mockToken);

      const result = service.login(userWithoutPassword);

      expect(result).toEqual({
        access_token: mockToken,
        token_type: 'Bearer',
        expires_in: undefined,
        user: {
          id: userWithoutPassword.id,
          email: userWithoutPassword.email,
          firstName: userWithoutPassword.firstName,
          lastName: userWithoutPassword.lastName,
          role: userWithoutPassword.role,
        },
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        email: 'test@example.com',
        sub: 1,
        role: UserRole.BUYER,
      });
    });

    it('should create token with correct payload for different user roles', () => {
      const adminUser = { ...userWithoutPassword, role: UserRole.ADMIN };
      const supplierUser = { ...userWithoutPassword, role: UserRole.SUPPLIER };
      const mockToken = 'jwt.token.here';
      mockJwtService.sign.mockReturnValue(mockToken);

      // Test admin user
      service.login(adminUser);
      expect(mockJwtService.sign).toHaveBeenLastCalledWith({
        email: 'test@example.com',
        sub: 1,
        role: UserRole.ADMIN,
      });

      // Test supplier user
      service.login(supplierUser);
      expect(mockJwtService.sign).toHaveBeenLastCalledWith({
        email: 'test@example.com',
        sub: 1,
        role: UserRole.SUPPLIER,
      });
    });
  });

  describe('findUserById', () => {
    it('should return user without password when user exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findUserById(1);

      expect(result).toEqual({
        id: 1,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: UserRole.BUYER,
        isActive: true,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
      });
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1, isActive: true },
      });
    });

    it('should return null when user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.findUserById(999);

      expect(result).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      mockPrismaService.user.findUnique.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.findUserById(1)).rejects.toThrow('Database error');
    });
  });
});
