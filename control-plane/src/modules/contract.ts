import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

const NextJobSchema = z.object({
  id: z.string(),
  targetFn: z.string(),
  targetArgs: z.string(),
});

export const definition = {
  createJobsRequest: {
    method: "POST",
    path: "/jobs-request",
    headers: z.object({
      authorization: z.string(),
      "x-machine-id": z.string(),
    }),
    body: z.object({
      limit: z.coerce.number().default(1),
      service: z.string(),
      ttl: z.coerce.number().min(5000).max(20000).default(20000),
      functions: z
        .array(
          z.object({
            name: z.string(),
            idempotent: z.boolean().optional(),
            rate: z
              .object({
                per: z.enum(["minute", "hour"]),
                limit: z.number(),
              })
              .optional(),
            cacheTTL: z.number().optional(),
            retryConfig: z
              .object({
                maxAttempts: z.number(),
                timeoutIntervalSeconds: z.number(),
              })
              .optional(),
          }),
        )
        .optional(),
    }),
    responses: {
      200: z.array(NextJobSchema),
      204: z.undefined(),
    },
  },
  createJob: {
    method: "POST",
    path: "/jobs",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      201: z.object({
        id: z.string(),
      }),
      401: z.undefined(),
    },
    body: z.object({
      targetFn: z.string(),
      targetArgs: z.string(),
      pool: z.string().optional(),
      service: z.string().default("unknown"),
      idempotencyKey: z.string().optional(),
      cacheKey: z.string().optional(),
    }),
  },
  getJobStatus: {
    method: "GET",
    path: "/jobs/:jobId",
    pathParams: z.object({
      jobId: z.string(),
    }),
    query: z.object({
      ttl: z.coerce.number().min(5000).max(20000).default(20000),
    }),
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.object({
        status: z.enum(["pending", "running", "success", "failure"]),
        result: z.string().nullable(),
        resultType: z.enum(["resolution", "rejection"]).nullable(),
      }),
      404: z.undefined(),
      401: z.undefined(),
    },
  },
  persistJobResult: {
    method: "POST",
    path: "/jobs/:jobId/result",
    headers: z.object({
      authorization: z.string(),
    }),
    pathParams: z.object({
      jobId: z.string(),
    }),
    responses: {
      204: z.undefined(),
      401: z.undefined(),
    },
    body: z.object({
      result: z.string(),
      resultType: z.enum(["resolution", "rejection"]),
      functionExecutionTime: z.number().optional(),
    }),
  },
  live: {
    method: "GET",
    path: "/live",
    responses: {
      200: z.object({
        status: z.string(),
      }),
    },
  },
  getContract: {
    method: "GET",
    path: "/contract",
    responses: {
      200: z.object({
        contract: z.string(),
      }),
    },
  },
  createCredential: {
    method: "POST",
    path: "/organizations/:organizationId/clusters",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      201: z.object({
        apiSecret: z.string(),
      }),
      401: z.undefined(),
    },
    pathParams: z.object({
      organizationId: z.string(),
    }),
    body: z.object({}),
  },
  getTemporaryToken: {
    method: "GET",
    path: "/demo/token",
    responses: {
      201: z.string(),
    },
  },
  // management routes
  getClustersForUser: {
    method: "GET",
    path: "/clusters",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.array(
        z.object({
          id: z.string(),
          apiSecret: z.string(),
          createdAt: z.date(),
          description: z.string().nullable(),
        }),
      ),
      401: z.undefined(),
    },
  },
  createClusterForUser: {
    method: "POST",
    path: "/clusters",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      204: z.undefined(),
    },
    body: z.object({
      description: z.string(),
    }),
  },
  getClusterDetailsForUser: {
    method: "GET",
    path: "/clusters/:clusterId",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.object({
        id: z.string(),
        apiSecret: z.string(),
        createdAt: z.date(),
        machines: z.array(
          z.object({
            id: z.string(),
            description: z.string().nullable(),
            pool: z.string().nullable(),
            lastPingAt: z.date().nullable(),
            ip: z.string().nullable(),
          }),
        ),
        jobs: z.array(
          z.object({
            id: z.string(),
            targetFn: z.string(),
            service: z.string().nullable(),
            status: z.string(),
            resultType: z.string().nullable(),
            createdAt: z.date(),
            functionExecutionTime: z.number().nullable(),
          }),
        ),
        definitions: z.array(
          z.object({
            name: z.string(),
            functions: z
              .array(
                z.object({
                  name: z.string(),
                  idempotent: z.boolean().optional(),
                  rate: z
                    .object({
                      per: z.enum(["minute", "hour"]),
                      limit: z.number(),
                    })
                    .optional(),
                  cacheTTL: z.number().optional(),
                }),
              )
              .optional(),
          }),
        ),
      }),
      401: z.undefined(),
      404: z.undefined(),
    },
    pathParams: z.object({
      clusterId: z.string(),
    }),
  },
  getClusterServiceDetailsForUser: {
    method: "GET",
    path: "/clusters/:clusterId/service/:serviceName",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.object({
        jobs: z.array(
          z.object({
            id: z.string(),
            targetFn: z.string(),
            service: z.string().nullable(),
            status: z.string(),
            resultType: z.string().nullable(),
            createdAt: z.date(),
            functionExecutionTime: z.number().nullable(),
          }),
        ),
        definition: z
          .object({
            name: z.string(),
            functions: z
              .array(
                z.object({
                  name: z.string(),
                  idempotent: z.boolean().optional(),
                  rate: z
                    .object({
                      per: z.enum(["minute", "hour"]),
                      limit: z.number(),
                    })
                    .optional(),
                  cacheTTL: z.number().optional(),
                }),
              )
              .optional(),
          })
          .nullable(),
      }),
      401: z.undefined(),
      404: z.undefined(),
    },
    pathParams: z.object({
      clusterId: z.string(),
      serviceName: z.string(),
    }),
    query: z.object({
      limit: z.coerce.number().min(100).max(5000).default(2000),
    }),
  },
  getMetrics: {
    method: "GET",
    path: "/clusters/:clusterId/metrics",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.object({
        summary: z.array(
          z.object({
            targetFn: z.string(),
            resultType: z.string(),
            count: z.number(),
            avgExecutionTime: z.number(),
            minExecutionTime: z.number(),
            maxExecutionTime: z.number(),
          }),
        ),
        timeseries: z.array(
          z.object({
            timeBin: z.string(),
            serviceName: z.string(),
            avgExecutionTime: z.number(),
            totalJobResulted: z.number(),
            totalJobStalled: z.number(),
            rejectionCount: z.number(),
          }),
        ),
      }),
      401: z.undefined(),
      404: z.undefined(),
    },
    pathParams: z.object({
      clusterId: z.string(),
    }),
    query: z.object({
      serviceName: z.string(),
    }),
  },
  ingestClientEvents: {
    method: "POST",
    path: "/metrics",
    headers: z.object({
      authorization: z.string(),
      "x-machine-id": z.string(),
    }),
    responses: {
      204: z.undefined(),
      401: z.undefined(),
    },
    body: z.object({
      events: z.array(
        z.object({
          timestamp: z.coerce.date(),
          type: z.enum(["machineResourceProbe", "functionInvocation"]),
          tags: z.record(z.string()).optional(),
          intFields: z.record(z.number()).optional(),
        }),
      ),
    }),
  },
  getActivity: {
    method: "GET",
    path: "/clusters/:clusterId/activity",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.array(
        z.object({
          type: z.string(),
          meta: z.unknown(),
          machineId: z.string().nullable(),
          timestamp: z.date(),
          service: z.string().nullable(),
        }),
      ),
      401: z.undefined(),
      404: z.undefined(),
    },
    query: z.object({
      jobId: z.string(),
    }),
  },
  createDeployment: {
    method: "POST",
    path: "/clusters/:clusterId/service/:serviceName/deployments",
    headers: z.object({
      authorization: z.string(),
    }),
    body: z.undefined(),
    responses: {
      501: z.undefined(),
      401: z.undefined(),
      200: z.object({
        id: z.string(),
        packageUploadUrl: z.string(),
        definitionUploadUrl: z.string(),
        status: z.string(),
      }),
    },
  },
  getDeployment: {
    method: "GET",
    path: "/clusters/:clusterId/service/:serviceName/deployments/:deploymentId",
    headers: z.object({
      authorization: z.string(),
    }),
    body: z.undefined(),
    responses: {
      401: z.undefined(),
      404: z.undefined(),
      200: z.object({
        id: z.string(),
        packageUploadUrl: z.string(),
        definitionUploadUrl: z.string(),
        status: z.string(),
      }),
    },
  },
  releaseDeployment: {
    method: "POST",
    path: "/clusters/:clusterId/service/:serviceName/deployments/:deploymentId/release",
    headers: z.object({
      authorization: z.string(),
    }),
    body: z.undefined(),
    responses: {
      400: z.undefined(),
      401: z.undefined(),
      404: z.undefined(),
      200: z.object({
        id: z.string(),
        packageUploadUrl: z.string(),
        definitionUploadUrl: z.string(),
        status: z.string(),
      }),
    },
  },
  setClusterSettings: {
    method: "PUT",
    path: "/clusters/:clusterId/settings",
    headers: z.object({
      authorization: z.string(),
    }),
    body: z.object({
      predictiveRetriesEnabled: z.boolean(),
    }),
    responses: {
      204: z.undefined(),
      401: z.undefined(),
    },
    pathParams: z.object({
      clusterId: z.string(),
    }),
  },
  getClusterSettings: {
    method: "GET",
    path: "/clusters/:clusterId/settings",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.object({
        predictiveRetriesEnabled: z.boolean(),
      }),
      401: z.undefined(),
    },
    pathParams: z.object({
      clusterId: z.string(),
    }),
  },
} as const;

export const contract = c.router(definition);
