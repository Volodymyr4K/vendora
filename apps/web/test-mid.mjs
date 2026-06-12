import { NextRequest, NextResponse } from 'next/server';

const host = 'tenant-a.localhost:3000';
const tenantSlug = host.split(':')[0].replace('.localhost', '');

const req = new NextRequest('http://tenant-a.localhost:3000/menu', {
  headers: { host }
});

const requestHeaders = new Headers(req.headers);
requestHeaders.set('x-tenant-slug', tenantSlug);

const response = NextResponse.next({
  request: {
    headers: requestHeaders,
  },
});

console.log('Tenant slug:', tenantSlug);
console.log('Response type:', typeof response);
console.log('Response keys:', Object.keys(response));
console.log('Has request prop?:', 'request' in response);

// Try different ways to access
console.log('\nAttempt 1 - response.request:', response.request);
console.log('Attempt 2 - response[Symbol.for("request")]:', response[Symbol.for('request')]);

// Check internal structure
for (const key of Object.getOwnPropertyNames(response)) {
  console.log(`Property: ${key} =`, response[key]);
}
