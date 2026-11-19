import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  SETUP_CODE: z.string().default(''),
});

export const env = schema.parse(process.env);
