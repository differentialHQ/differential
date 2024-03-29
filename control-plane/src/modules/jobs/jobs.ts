import { type InferModel, and, eq, inArray, sql } from "drizzle-orm";
import * as cron from "../cron";
import * as data from "../data";
import * as events from "../observability/events";
import {
  ServiceDefinition,
  storeServiceDefinition,
} from "../service-definitions";
import { jobDurations } from "./job-metrics";
import { selfHealJobs } from "./persist-result";

export { createJob } from "./create-job";
export { persistJobResult } from "./persist-result";

export const nextJobs = async ({
  service,
  owner,
  limit,
  machineId,
  deploymentId,
  ip,
  definition,
}: {
  service: string;
  owner: { clusterId: string };
  limit: number;
  machineId: string;
  deploymentId?: string;
  ip: string;
  definition?: ServiceDefinition;
}) => {
  const end = jobDurations.startTimer({ operation: "nextJobs" });

  const results = await data.db.execute(
    sql`UPDATE
      jobs SET status = 'running',
      remaining_attempts = remaining_attempts - 1,
      last_retrieved_at=${new Date().toISOString()},
      executing_machine_id=${machineId}
    WHERE
      id IN (SELECT id FROM jobs WHERE (status = 'pending' OR (status = 'failure' AND remaining_attempts > 0))
      AND owner_hash = ${owner.clusterId}
      AND service = ${service}
    LIMIT ${limit})
    RETURNING id, target_fn, target_args`,
  );

  await Promise.all([
    storeMachineInfo(machineId, ip, owner, deploymentId),
    definition ? storeServiceDefinition(service, definition, owner) : undefined,
  ]);

  if (results.rowCount === 0) {
    end();
    return [];
  }

  const jobs: {
    id: string;
    targetFn: string;
    targetArgs: string;
  }[] = results.rows.map((row) => ({
    id: row.id as string,
    targetFn: row.target_fn as string,
    targetArgs: row.target_args as string,
  }));

  jobs.forEach((job) => {
    events.write({
      service,
      clusterId: owner.clusterId,
      jobId: job.id,
      type: "jobReceived",
      machineId,
      deploymentId,
      meta: {
        targetFn: job.targetFn,
        targetArgs: job.targetArgs,
      },
    });
  });

  end();
  return jobs;
};

export const getJobStatus = async ({
  jobId,
  owner,
}: {
  jobId: string;
  owner: { clusterId: string };
}) => {
  const end = jobDurations.startTimer({ operation: "getJobStatus" });

  const [job] = await data.db
    .select({
      service: data.jobs.service,
      status: data.jobs.status,
      result: data.jobs.result,
      resultType: data.jobs.result_type,
    })
    .from(data.jobs)
    .where(
      and(eq(data.jobs.id, jobId), eq(data.jobs.owner_hash, owner.clusterId)),
    );

  if (job) {
    events.write({
      service: job.service,
      clusterId: owner.clusterId,
      jobId,
      type: "jobStatusRequest",
      meta: {
        status: job.status,
        resultType: job.resultType ?? undefined,
      },
    });
  }

  end();
  return job;
};

export const getJobStatuses = async ({
  jobIds,
  owner,
  longPollTimeout = 20000,
}: {
  jobIds: string[];
  owner: { clusterId: string };
  longPollTimeout?: number;
}) => {
  const end = jobDurations.startTimer({ operation: "getJobStatuses" });

  if (jobIds.length === 0) {
    end();
    return [];
  }

  const start = Date.now();
  let hasResolved = false;

  let jobs: Array<{
    id: string;
    service: string;
    status: InferModel<typeof data.jobs>["status"];
    result: string | null;
    resultType: InferModel<typeof data.jobs>["result_type"];
  }>;

  do {
    jobs = await data.db
      .select({
        id: data.jobs.id,
        service: data.jobs.service,
        status: data.jobs.status,
        result: data.jobs.result,
        resultType: data.jobs.result_type,
      })
      .from(data.jobs)
      .where(
        and(
          eq(data.jobs.owner_hash, owner.clusterId),
          inArray(data.jobs.id, jobIds),
        ),
      );

    hasResolved = jobs.some(
      (job) => job.status === "success" || job.status === "failure",
    );

    if (!hasResolved) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } while (!hasResolved && Date.now() - start < longPollTimeout);

  jobs.forEach((job) => {
    events.write({
      service: job.service,
      clusterId: owner.clusterId,
      jobId: job.id,
      type: "jobStatusRequest",
      meta: {
        status: job.status,
        resultType: job.resultType ?? undefined,
      },
    });
  });

  end();
  return jobs;
};

export async function storeMachineInfo(
  machineId: string,
  ip: string,
  owner: { clusterId: string },
  deploymentId?: string,
) {
  const end = jobDurations.startTimer({ operation: "storeMachineInfo" });

  await data.db
    .insert(data.machines)
    .values({
      id: machineId,
      last_ping_at: new Date(),
      ip,
      cluster_id: owner.clusterId,
      deployment_id: deploymentId,
    })
    .onConflictDoUpdate({
      target: [data.machines.id, data.machines.cluster_id],
      set: {
        last_ping_at: new Date(),
        ip,
        status: "active",
      },
      where: and(
        eq(data.machines.cluster_id, owner.clusterId),
        eq(data.machines.id, machineId),
      ),
    });

  end();
}

export const start = () =>
  cron.registerCron(selfHealJobs, { interval: 1000 * 5 }); // 10 seconds
