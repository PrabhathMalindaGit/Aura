import LoginThrottle from "../models/LoginThrottle";
import { hashBucketKey } from "../utils/sharedSecret";

type LoginThrottleBucket = {
  key: string | null | undefined;
  limit: number;
  scopeSuffix: string;
  windowMs: number;
};

type LoginThrottleResult =
  | {
      allowed: true;
      retryAfterSeconds: 0;
    }
  | {
      allowed: false;
      retryAfterSeconds: number;
    };

function normalizeBucketKey(scope: string, scopeSuffix: string, key: string): string {
  return hashBucketKey(`${scope}:${scopeSuffix}:${key}`);
}

async function consumeBucket(params: {
  bucket: LoginThrottleBucket;
  now: Date;
  scope: string;
}): Promise<LoginThrottleResult> {
  const rawKey = params.bucket.key?.trim();
  if (!rawKey) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const bucketKeyHash = normalizeBucketKey(
    params.scope,
    params.bucket.scopeSuffix,
    rawKey
  );
  const scope = `${params.scope}:${params.bucket.scopeSuffix}`;
  const existing = await LoginThrottle.findOne({
    scope,
    bucketKeyHash,
  });

  const windowEndsAt = new Date(params.now.getTime() + params.bucket.windowMs);
  if (!existing) {
    await LoginThrottle.create({
      scope,
      bucketKeyHash,
      count: 1,
      windowStartedAt: params.now,
      expiresAt: windowEndsAt,
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const currentWindowEndsAt = new Date(
    existing.windowStartedAt.getTime() + params.bucket.windowMs
  );
  if (params.now.getTime() >= currentWindowEndsAt.getTime()) {
    existing.count = 1;
    existing.windowStartedAt = params.now;
    existing.expiresAt = windowEndsAt;
    await existing.save();
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= params.bucket.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((currentWindowEndsAt.getTime() - params.now.getTime()) / 1000)
      ),
    };
  }

  existing.count += 1;
  existing.expiresAt = currentWindowEndsAt;
  await existing.save();
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function consumeLoginThrottle(params: {
  buckets: LoginThrottleBucket[];
  now?: Date;
  scope: string;
}): Promise<LoginThrottleResult> {
  const now = params.now ?? new Date();
  let retryAfterSeconds = 0;

  for (const bucket of params.buckets) {
    const result = await consumeBucket({
      bucket,
      now,
      scope: params.scope,
    });

    if (!result.allowed) {
      retryAfterSeconds = Math.max(retryAfterSeconds, result.retryAfterSeconds);
    }
  }

  if (retryAfterSeconds > 0) {
    return {
      allowed: false,
      retryAfterSeconds,
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}
