// Test environment defaults. DB-backed suites use TEST_DATABASE_URL.
process.env.TEST_DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/dropship_test";
process.env.ENCRYPTION_KEY ??= "0".repeat(64);
