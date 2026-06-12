import type { FastifyInstance } from 'fastify';

/**
 * Standard dependency injection for route handlers
 * Add dependencies as needed when migrating routes
 */
export type RouteDeps = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cache?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upstream?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metrics?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config?: any;
    // Add more as needed during gradual migration
};

/**
 * Standard route handler signature
 * Use this for all new route files going forward
 * 
 * @example
 * export const routesExample: RouteHandler = async (app, deps) => {
 *   app.get('/example', async (req, reply) => {
 *     if (deps?.cache) {
 *       // Use cache
 *     }
 *     return { message: 'Hello' };
 *   });
 * };
 */
export type RouteHandler = (
    app: FastifyInstance,
    deps?: RouteDeps
) => Promise<void>;
