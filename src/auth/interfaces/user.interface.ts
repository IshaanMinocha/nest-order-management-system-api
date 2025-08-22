import { User as PrismaUser } from '@prisma/client';

export type JwtUser = Omit<PrismaUser, 'passwordHash'>;

export interface AuthenticatedUser {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
}
