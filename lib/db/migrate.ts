import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

config({
  path: '.env.local',
});

const runMigrate = async () => {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL is not defined');
  }

  const connection = postgres(process.env.POSTGRES_URL, { 
    max: 1,
    ssl: {
      rejectUnauthorized: true,
    },
    connection: {
      timeout: 5000 // 5 seconds
    },
    idle_timeout: 20, // max idle time for connections
    max_lifetime: 60 * 30 // 30 minutes
  });
  
  const db = drizzle(connection);

  console.log('Running migrations...');

  const start = Date.now();
  await migrate(db, { migrationsFolder: './lib/db/migrations' });
  const end = Date.now();

  console.log('Migrations completed in', end - start, 'ms');
  
  await connection.end();
  process.exit(0);
};

runMigrate().catch((err) => {
  console.error('Migration failed');
  console.error(err);
  process.exit(1);
});
