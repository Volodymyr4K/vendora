/**
 * Auth Domain Types
 * 
 * Authentication and session management
 */

import type { PrismaClient } from "@vendora/database";
import type { AppConfig } from "../../config.js";

/**
 * Standard dependencies for Auth routes
 * 
 * @property prisma - Database client for user/session management
 * @property config - Application configuration (JWT secrets)
 */
export type AuthDeps = {
    prisma: PrismaClient;
    config: AppConfig;
};
