import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Extend test timeout for E2E tests
jest.setTimeout(30000);

// Global test setup
beforeAll(() => {
  // Set test environment
  process.env.NODE_ENV = 'test';

  // Use test database URL if not set
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      'postgresql://oms:oms@localhost:5432/oms_test?schema=public';
  }

  // Set test JWT secret
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret-for-e2e';
  }
});

// Global test cleanup
afterAll(async () => {
  // Clean up any global resources if needed
});
