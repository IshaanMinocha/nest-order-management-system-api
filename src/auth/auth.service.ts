import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './services/password.service';
import { AuthResponseDto, RegisterDto } from './dto';
import { User, UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(
    email: string,
    password: string,
  ): Promise<Omit<User, 'passwordHash'> | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: {
          email,
          isActive: true,
        },
      });

      if (!user) {
        this.logger.warn(`Login attempt for non-existent user: ${email}`);
        return null;
      }

      const isPasswordValid = await this.passwordService.verifyPassword(
        user.passwordHash,
        password,
      );

      if (!isPasswordValid) {
        this.logger.warn(`Invalid password for user: ${email}`);
        return null;
      }

      this.logger.log(`Successful authentication for user: ${email}`);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, ...result } = user;
      return result;
    } catch (error) {
      this.logger.error(`Authentication error for user ${email}:`, error);
      return null;
    }
  }

  login(user: Omit<User, 'passwordHash'>): AuthResponseDto {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);
    const expiresIn = this.configService.get<number>('JWT_EXPIRES_IN', 3600);

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async findUserById(id: number): Promise<Omit<User, 'passwordHash'> | null> {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
        isActive: true,
      },
    });

    if (!user) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...result } = user;
    return result;
  }

  async hasRole(userId: number, roles: UserRole[]): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    return user ? roles.includes(user.role) : false;
  }

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const passwordHash = await this.passwordService.hashPassword(
      registerDto.password,
    );

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        passwordHash,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        role: registerDto.role,
        isActive: true,
      },
    });

    this.logger.log(`New user registered: ${user.email} as ${user.role}`);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...userWithoutPassword } = user;

    // Return login response
    return this.login(userWithoutPassword);
  }
}
