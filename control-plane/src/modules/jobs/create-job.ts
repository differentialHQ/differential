import { and, desc, eq, gte } from "drizzle-orm";
import { ulid } from "ulid";
import * as clusters from "../cluster";
import * as data from "../data";
import * as events from "../observability/events";
import { jobDurations } from "./job-metrics";
import * as clusterActivity from "../cluster-activity";

type CreateJobParams = {
  service: string;
  targetFn: string;
  targetArgs: string;
  owner: { clusterId: string };
  deploymentId?: string;
  pool?: string;
  timeoutIntervalSeconds?: number;
  maxAttempts?: number;
  predictiveRetriesEnabled?: boolean;
};

type CallConfig = {
  cache?: {
    key: string;
    ttlSeconds: number;
  };
  retryCountOnStall?: number;
  predictiveRetriesOnRejection?: boolean;
  timeoutSeconds?: number;
  executionId?: string;
};

const DEFAULT_RETRY_COUNT_ON_STALL = 1;

export const createJob = async (params: {
  service: string;
  targetFn: string;
  targetArgs: string;
  owner: { clusterId: string };
  deploymentId?: string;
  callConfig?: CallConfig;
}) => {
  const end = jobDurations.startTimer({ operation: "createJob" });

  clusterActivity.setClusterActivityToHigh(params.owner.clusterId);

  const cluster = await clusters.operationalCluster(params.owner.clusterId);

  const callConfigParams = {
    timeoutIntervalSeconds: params.callConfig?.timeoutSeconds,
    maxAttempts:
      (params.callConfig?.retryCountOnStall ?? DEFAULT_RETRY_COUNT_ON_STALL) +
      1,
    predictiveRetriesEnabled: params.callConfig?.predictiveRetriesOnRejection,
    id: params.callConfig?.executionId,
  };

  if (params.callConfig?.cache?.key && params.callConfig?.cache?.ttlSeconds) {
    const { id } = await createJobStrategies.cached({
      ...params,
      ...callConfigParams,
      cacheKey: params.callConfig.cache.key,
      cacheTTLSeconds: params.callConfig.cache.ttlSeconds,
      cluster,
    });

    onAfterJobCreated({
      ...params,
      callConfig: params.callConfig,
      jobId: id,
    });

    end();
    return { id };
  } else {
    const { id } = await createJobStrategies.default({
      ...params,
      ...callConfigParams,
      cluster,
    });

    onAfterJobCreated({
      ...params,
      callConfig: params.callConfig,
      jobId: id,
    });

    end();
    return { id };
  }
};

const createJobStrategies = {
  cached: async ({
    service,
    targetFn,
    targetArgs,
    owner,
    deploymentId,
    cacheTTLSeconds,
    cacheKey,
    timeoutIntervalSeconds,
    maxAttempts,
    cluster,
    predictiveRetriesEnabled,
  }: CreateJobParams & {
    cacheKey: string;
    cacheTTLSeconds: number;
    cluster: clusters.OperationalCluster;
  }) => {
    // has a job been completed within the TTL?
    // if so, return the jobId
    const [job] = await data.db
      .select({
        id: data.jobs.id,
      })
      .from(data.jobs)
      .where(
        and(
          eq(data.jobs.cache_key, cacheKey),
          eq(data.jobs.owner_hash, owner.clusterId),
          eq(data.jobs.service, service),
          eq(data.jobs.target_fn, targetFn),
          eq(data.jobs.status, "success"),
          eq(data.jobs.result_type, "resolution"),
          gte(
            data.jobs.resulted_at,
            new Date(Date.now() - cacheTTLSeconds * 1000),
          ),
        ),
      )
      .orderBy(desc(data.jobs.resulted_at))
      .limit(1);

    if (job) {
      return { id: job.id };
    }

    // if not, create a job
    const jobId = ulid();

    await data.db.insert(data.jobs).values({
      id: jobId,
      target_fn: targetFn,
      target_args: targetArgs,
      status: "pending",
      owner_hash: owner.clusterId,
      deployment_id: deploymentId,
      service,
      cache_key: cacheKey,
      remaining_attempts: maxAttempts ?? 1,
      timeout_interval_seconds: timeoutIntervalSeconds,
      predictive_retry_enabled: predictiveRetriesEnabled,
    });

    return { id: jobId };
  },
  default: async ({
    service,
    targetFn,
    targetArgs,
    owner,
    deploymentId,
    pool,
    timeoutIntervalSeconds,
    maxAttempts,
    cluster,
    predictiveRetriesEnabled,
  }: CreateJobParams & { cluster: clusters.OperationalCluster }) => {
    const jobId = ulid();

    await data.db.insert(data.jobs).values({
      id: jobId,
      target_fn: targetFn,
      target_args: targetArgs,
      status: "pending",
      owner_hash: owner.clusterId,
      deployment_id: deploymentId,
      service,
      remaining_attempts: maxAttempts ?? 1,
      timeout_interval_seconds: timeoutIntervalSeconds,
      predictive_retry_enabled: predictiveRetriesEnabled,
    });

    return { id: jobId };
  },
};

const onAfterJobCreated = async ({
  service,
  targetFn,
  targetArgs,
  owner,
  jobId,
  callConfig,
}: CreateJobParams & { jobId: string; callConfig?: CallConfig }) => {
  events.write({
    type: "jobCreated",
    clusterId: owner.clusterId,
    jobId,
    meta: {
      targetFn,
      service,
      targetArgs,
      callConfig,
    },
  });
};
