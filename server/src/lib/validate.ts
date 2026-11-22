import net from 'node:net';
import { z } from 'zod';
import { badRequest } from './errors';

const HOSTNAME_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

export const hostSchema = z
  .string()
  .trim()
  .min(1, 'Host is required')
  .max(253, 'Host is too long')
  .refine(
    (value) => {
      if (net.isIP(value)) return true;
      if (value.endsWith('.') || value.includes('..')) return false;
      return value.split('.').every((label) => HOSTNAME_LABEL.test(label));
    },
    'Enter a valid hostname or IP address',
  );

export const portSchema = z
  .union([z.number().int(), z.string().regex(/^\d{1,5}$/)])
  .transform(Number)
  .refine((value) => value >= 1 && value <= 65535, 'Port must be between 1 and 65535');

export const httpUrlSchema = z
  .string()
  .trim()
  .url('Enter a valid absolute URL')
  .refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Only http and https URLs without credentials are allowed');

export const countSchema = z.number().int().min(1).max(20);
export const timeoutSchema = z.number().int().min(100).max(15000);
export const hopsSchema = z.number().int().min(1).max(30);
export const dnsTypeSchema = z.enum(['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA']);
export const bytesSchema = z.number().int().min(1024 * 1024).max(100 * 1024 * 1024);

export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    throw badRequest('Invalid request input', details);
  }
  return result.data;
}

export function strictObject<T extends z.ZodRawShape>(shape: T) {
  return z.strictObject(shape);
}
