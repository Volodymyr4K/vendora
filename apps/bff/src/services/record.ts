import fs from "node:fs";
import path from "node:path";

export type RecorderCfg = {
  enabled: boolean;
  dir: string;
  maxBytes: number;
};

export type UpstreamRecord = {
  time: string;
  op: string;
  status: number;
  url: string;
  sample: unknown;
};

    // Dynamic data structure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeJson(obj: any, maxBytes: number) {
  const s = JSON.stringify(obj);
  if (Buffer.byteLength(s, "utf8") <= maxBytes) return obj;
  // truncate by keeping first part of string (best-effort)
  const cut = s.slice(0, Math.max(0, maxBytes - 50));
  return { truncated: true, bytes: Buffer.byteLength(s, "utf8"), preview: cut };
}

export function createRecorder(cfg: RecorderCfg) {
  const last = new Map<string, UpstreamRecord>();

  function writeFile(rec: UpstreamRecord) {
    try {
      fs.mkdirSync(cfg.dir, { recursive: true });
      const fp = path.join(cfg.dir, `${rec.op}.json`);
      fs.writeFileSync(fp, JSON.stringify(rec, null, 2), "utf8");
    } catch {
      // ignore
    }
  }

  return {
    // Dynamic data structure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    record(op: string, status: number, url: string, json: any) {
      if (!cfg.enabled) return;
      const rec: UpstreamRecord = {
        time: new Date().toISOString(),
        op,
        status,
        url,
        sample: safeJson(json, cfg.maxBytes),
      };
      last.set(op, rec);
      writeFile(rec);
    },
    getLast(op?: string) {
      if (op) return last.get(op);
      return Array.from(last.values());
    },
  };
}
