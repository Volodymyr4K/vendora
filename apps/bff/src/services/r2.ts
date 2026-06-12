import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

type R2Config = {
    endpoint: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
};

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}

export function getR2ConfigFromEnv(): R2Config {
    return {
        endpoint: requireEnv("R2_ENDPOINT"),
        bucket: requireEnv("R2_BUCKET"),
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
        region: process.env.R2_REGION || "auto",
    };
}

let cachedClient: S3Client | null = null;

export function getR2Client(config: R2Config = getR2ConfigFromEnv()): S3Client {
    if (!cachedClient) {
        cachedClient = new S3Client({
            region: config.region,
            endpoint: config.endpoint,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
            forcePathStyle: true,
        });
    }
    return cachedClient;
}

export type PutObjectArgs = {
    key: string;
    body: Readable | Buffer | Uint8Array;
    contentType?: string;
    cacheControl?: string;
    metadata?: Record<string, string>;
    ifNoneMatch?: string;
};

export async function r2PutObject(args: PutObjectArgs): Promise<{ etag?: string }> {
    const cfg = getR2ConfigFromEnv();
    const client = getR2Client(cfg);

    const res = await client.send(new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: args.key,
        Body: args.body,
        ContentType: args.contentType,
        CacheControl: args.cacheControl,
        Metadata: args.metadata,
        IfNoneMatch: args.ifNoneMatch,
    }));

    return { etag: res.ETag };
}

export type HeadObjectResult = {
    contentType?: string;
    cacheControl?: string;
    etag?: string;
    contentLength?: number;
    lastModified?: Date;
};

export async function r2HeadObject(key: string): Promise<HeadObjectResult> {
    const cfg = getR2ConfigFromEnv();
    const client = getR2Client(cfg);

    const res = await client.send(new HeadObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
    }));

    return {
        contentType: res.ContentType,
        cacheControl: res.CacheControl,
        etag: res.ETag,
        contentLength: res.ContentLength,
        lastModified: res.LastModified,
    };
}

export type GetObjectResult = HeadObjectResult & {
    body: Readable;
};

export async function r2GetObject(key: string): Promise<GetObjectResult> {
    const cfg = getR2ConfigFromEnv();
    const client = getR2Client(cfg);

    const res = await client.send(new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
    }));

    const body = res.Body as Readable | undefined;
    if (!body) {
        throw new Error("R2 object body is empty");
    }

    return {
        body,
        contentType: res.ContentType,
        cacheControl: res.CacheControl,
        etag: res.ETag,
        contentLength: res.ContentLength,
        lastModified: res.LastModified,
    };
}

export async function r2DeleteObject(key: string): Promise<void> {
    const cfg = getR2ConfigFromEnv();
    const client = getR2Client(cfg);

    await client.send(new DeleteObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
    }));
}
