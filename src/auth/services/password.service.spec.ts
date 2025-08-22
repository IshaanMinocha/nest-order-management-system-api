import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from './password.service';
import * as argon2 from 'argon2';

// Mock argon2 module
jest.mock('argon2');
const mockedArgon2 = argon2 as jest.Mocked<typeof argon2>;

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PasswordService],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('hashPassword', () => {
    it('should hash password successfully', async () => {
      const password = 'testPassword123';
      const hashedPassword = '$argon2id$v=19$m=65536,t=3,p=4$hashedPassword';

      mockedArgon2.hash.mockResolvedValue(hashedPassword);

      const result = await service.hashPassword(password);

      expect(result).toBe(hashedPassword);
      expect(argon2.hash).toHaveBeenCalledWith(password, {
        type: 2, // argon2id
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      });
    });

    it('should handle empty password', async () => {
      const password = '';
      const hashedPassword = '$argon2id$v=19$m=65536,t=3,p=4$empty';

      mockedArgon2.hash.mockResolvedValue(hashedPassword);

      const result = await service.hashPassword(password);

      expect(result).toBe(hashedPassword);
      expect(argon2.hash).toHaveBeenCalledWith(password, {
        type: 2,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      });
    });

    it('should handle special characters in password', async () => {
      const password = 'test@Pass#123!$%';
      const hashedPassword = '$argon2id$v=19$m=65536,t=3,p=4$special';

      mockedArgon2.hash.mockResolvedValue(hashedPassword);

      const result = await service.hashPassword(password);

      expect(result).toBe(hashedPassword);
      expect(argon2.hash).toHaveBeenCalledWith(password, {
        type: 2,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      });
    });

    it('should handle argon2 hash error', async () => {
      const password = 'testPassword123';
      const error = new Error('Hashing failed');

      mockedArgon2.hash.mockRejectedValue(error);

      await expect(service.hashPassword(password)).rejects.toThrow(
        'Failed to hash password',
      );
    });

    it('should handle long passwords', async () => {
      const password = 'a'.repeat(1000); // Very long password
      const hashedPassword = '$argon2id$v=19$m=65536,t=3,p=4$longpassword';

      mockedArgon2.hash.mockResolvedValue(hashedPassword);

      const result = await service.hashPassword(password);

      expect(result).toBe(hashedPassword);
      expect(argon2.hash).toHaveBeenCalledWith(password, {
        type: 2,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      });
    });
  });

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      const password = 'testPassword123';
      const hashedPassword = '$argon2id$v=19$m=65536,t=3,p=4$hashedPassword';

      mockedArgon2.verify.mockResolvedValue(true);

      const result = await service.verifyPassword(hashedPassword, password);

      expect(result).toBe(true);
      expect(argon2.verify).toHaveBeenCalledWith(hashedPassword, password);
    });

    it('should return false for incorrect password', async () => {
      const password = 'wrongPassword';
      const hashedPassword = '$argon2id$v=19$m=65536,t=3,p=4$hashedPassword';

      mockedArgon2.verify.mockResolvedValue(false);

      const result = await service.verifyPassword(hashedPassword, password);

      expect(result).toBe(false);
      expect(argon2.verify).toHaveBeenCalledWith(hashedPassword, password);
    });

    it('should handle empty password verification', async () => {
      const password = '';
      const hashedPassword = '$argon2id$v=19$m=65536,t=3,p=4$empty';

      mockedArgon2.verify.mockResolvedValue(true);

      const result = await service.verifyPassword(hashedPassword, password);

      expect(result).toBe(true);
      expect(argon2.verify).toHaveBeenCalledWith(hashedPassword, password);
    });

    it('should handle special characters in password verification', async () => {
      const password = 'test@Pass#123!$%';
      const hashedPassword = '$argon2id$v=19$m=65536,t=3,p=4$special';

      mockedArgon2.verify.mockResolvedValue(true);

      const result = await service.verifyPassword(hashedPassword, password);

      expect(result).toBe(true);
      expect(argon2.verify).toHaveBeenCalledWith(hashedPassword, password);
    });

    it('should handle argon2 verify error', async () => {
      const password = 'testPassword123';
      const hashedPassword = '$argon2id$v=19$m=65536,t=3,p=4$hashedPassword';
      const error = new Error('Verification failed');

      mockedArgon2.verify.mockRejectedValue(error);

      const result = await service.verifyPassword(hashedPassword, password);

      expect(result).toBe(false);
    });

    it('should handle malformed hash', async () => {
      const password = 'testPassword123';
      const malformedHash = 'not-a-valid-hash';

      mockedArgon2.verify.mockRejectedValue(new Error('Invalid hash'));

      const result = await service.verifyPassword(password, malformedHash);

      expect(result).toBe(false);
    });
  });

  describe('password workflow integration', () => {
    it('should hash and verify password correctly', async () => {
      const password = 'integrationTestPassword123';
      const hashedPassword = '$argon2id$v=19$m=65536,t=3,p=4$integration';

      // Mock hash
      mockedArgon2.hash.mockResolvedValue(hashedPassword);
      const hash = await service.hashPassword(password);

      // Mock verify with correct password
      mockedArgon2.verify.mockResolvedValue(true);
      const isValid = await service.verifyPassword(password, hash);

      expect(hash).toBe(hashedPassword);
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong password after hashing', async () => {
      const correctPassword = 'correctPassword123';
      const wrongPassword = 'wrongPassword123';
      const hashedPassword = '$argon2id$v=19$m=65536,t=3,p=4$correct';

      // Mock hash
      mockedArgon2.hash.mockResolvedValue(hashedPassword);
      const hash = await service.hashPassword(correctPassword);

      // Mock verify with wrong password
      mockedArgon2.verify.mockResolvedValue(false);
      const isValid = await service.verifyPassword(wrongPassword, hash);

      expect(hash).toBe(hashedPassword);
      expect(isValid).toBe(false);
    });
  });
});
