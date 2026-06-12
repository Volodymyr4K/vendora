import {
    zAdminProductCreate,
    zAdminProductUpdate,
    AdminProductCreate,
    AdminProductUpdate
} from "@vendora/contracts";

export const ProductCreateSchema = zAdminProductCreate;
export const ProductUpdateSchema = zAdminProductUpdate;

// Infer types for strict typing in controllers
export type ProductCreateInput = AdminProductCreate;
export type ProductUpdateInput = AdminProductUpdate;
