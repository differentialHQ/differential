import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

const NextJobSchema = z.object({
  id: z.string(),
  targetFn: z.string(),
  targetArgs: z.string(),
});

export const contract = c.router({
  getNextJobs: {
    method: "GET",
    path: "/jobs",
    headers: z.object({
      authorization: z.string(),
      "x-machine-id": z.string(),
    }),
    query: z.object({
      pools: z.string().optional(),
      limit: z.coerce.number().default(1),
      functions: z.string(),
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
      service: z.string().default("unknown"),
    }),
  },
  getJobStatus: {
    method: "GET",
    path: "/jobs/:jobId",
    pathParams: z.object({
      jobId: z.string(),
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
      cacheTTL: z.number().optional(),
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
  getClusters: {
    method: "GET",
    path: "/organizations/:organizationId/clusters",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.array(
        z.object({
          id: z.string(),
          apiSecret: z.string(),
          organizationId: z.string(),
          createdAt: z.date(),
          machineCount: z.number(),
          lastPingAt: z.date().nullable(),
        })
      ),
      401: z.undefined(),
    },
    pathParams: z.object({
      organizationId: z.string(),
    }),
  },
  getClusterDetails: {
    method: "GET",
    path: "/organizations/:organizationId/clusters/:clusterId",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.object({
        id: z.string(),
        apiSecret: z.string(),
        organizationId: z.string(),
        createdAt: z.date(),
        machines: z.array(
          z.object({
            id: z.string(),
            description: z.string().nullable(),
            pool: z.string().nullable(),
            lastPingAt: z.date().nullable(),
            ip: z.string().nullable(),
            organizationId: z.string(),
          })
        ),
        jobs: z.array(
          z.object({
            id: z.string(),
            targetFn: z.string(),
            status: z.string(),
            createdAt: z.date(),
          })
        ),
      }),
      401: z.undefined(),
    },
    pathParams: z.object({
      organizationId: z.string(),
      clusterId: z.string(),
    }),
  },
  getTemporaryToken: {
    method: "GET",
    path: "/demo/token",
    responses: {
      201: z.string(),
    },
  },
  putServiceDefinition: {
    method: "PUT",
    path: "/organizations/:organizationId/clusters/:clusterId/service-definition",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      204: z.undefined(),
      401: z.undefined(),
    },
    pathParams: z.object({
      organizationId: z.string(),
      clusterId: z.string(),
    }),
    body: z.object({
      serviceDefinition: z.object({
        name: z.string(),
        functions: z.record(
          z.string(),
          z.object({
            name: z.string(),
            description: z.string().nullable(),
          })
        ),
      }),
    }),
  },
  getServiceDefinition: {
    method: "GET",
    path: "/organizations/:organizationId/clusters/:clusterId/service-definition",
    headers: z.object({
      authorization: z.string(),
    }),
    responses: {
      200: z.object({
        name: z.string(),
        functions: z.record(
          z.string(),
          z.object({
            name: z.string(),
            description: z.string().nullable(),
          })
        ),
      }),
      401: z.undefined(),
    },
    pathParams: z.object({
      organizationId: z.string(),
      clusterId: z.string(),
    }),
  },
});
