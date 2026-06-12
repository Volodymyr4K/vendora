/**
 * @vendora/tenant-resolver
 * 
 * Edge-compatible entry point
 * Safe to import in Next.js Middleware (Edge Runtime)
 */

export * from './normalize.js';
export * from './validate.js';

// NOTE: dns.ts is NOT exported here (Node.js only)
// Import DNS functions via: import { ... } from '@vendora/tenant-resolver/dns'
