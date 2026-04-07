#!/usr/bin/env ts-node

/**
 * Migration name formatter script
 * Accepts a migration name and prefixes it with date in YYYYMMDD format
 * Usage: npm run <env>:migrate:create -- <migration-name>
 * Example: npm run dev:migrate:create -- add_user_table
 */

import { execSync } from 'child_process';

const migrationName = process.argv[2];
const environment = process.env.NODE_ENV || 'development';

if (!migrationName) {
    console.error('Error: Migration name is required');
    console.error('Usage: npm run <env>:migrate:create -- <migration-name>');
    console.error('Example: npm run dev:migrate:create -- add_user_table');
    process.exit(1);
}

// Generate date in YYYYMMDD format
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const datePrefix = `${year}${month}${day}`;

// Combine date prefix with migration name, separated by underscores
const formattedName = `${datePrefix}_${migrationName}`;

// NODE_ENV is set by the npm script
// All environments use the same command to create migrations
const prismaCommand = `npx prisma migrate dev --create-only --name ${formattedName}`;

console.log(`Creating migration: ${formattedName}`);
console.log(`Environment: ${environment}`);
console.log(`Running: ${prismaCommand}`);

// Execute the Prisma command
try {
    execSync(prismaCommand, { stdio: 'inherit', env: process.env });
    console.log(`\n✓ Migration ${formattedName} created successfully`);
} catch (error) {
    console.error(`\n✗ Failed to create migration: ${formattedName}`);
    console.error(error);
    process.exit(1);
}

