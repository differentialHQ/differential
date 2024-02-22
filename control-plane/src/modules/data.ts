import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  boolean,
  foreignKey,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { invariant } from "../utilities/invariant";

const connectionString = invariant(
  process.env.DATABASE_URL,
  "DATABASE_URL must be set",
);

const sslDisabled = process.env.DATABASE_SSL_DISABLED === "true";

console.log("Attempting to connect to database", {
  sslDisabled,
});

export const pool = new Pool({
  connectionString,
  ssl: sslDisabled
    ? false
    : {
        rejectUnauthorized: false,
      },
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

pool.on("connect", (client) => {
  // console.debug("Connected to database");
});

pool.on("release", () => {
  // console.debug("Database connection released");
});

pool.on("remove", () => {
  console.debug("Database connection removed");
});

export const jobs = pgTable(
  "jobs",
  {
    // this column is poorly named, it's actually the job id
    // TODO: (good-first-issue) rename this column to execution_id
    id: varchar("id", { length: 1024 }).notNull().unique(),
    owner_hash: text("owner_hash").notNull(),
    deployment_id: varchar("deployment_id", { length: 1024 }),
    target_fn: varchar("target_fn", { length: 1024 }).notNull(),
    target_args: text("target_args").notNull(),
    idempotency_key: varchar("idempotency_key", { length: 1024 }).notNull(),
    cache_key: varchar("cache_key", { length: 1024 }),
    status: text("status", {
      enum: ["pending", "running", "success", "failure"], // job failure is actually a stalled state. TODO: rename it
    }).notNull(),
    result: text("result"),
    result_type: text("result_type", {
      enum: ["resolution", "rejection"],
    }),
    executing_machine_id: text("executing_machine_id"),
    remaining_attempts: integer("remaining_attempts").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resulted_at: timestamp("resulted_at", { withTimezone: true }),
    last_retrieved_at: timestamp("last_retrieved_at", { withTimezone: true }),
    function_execution_time_ms: integer("function_execution_time_ms"),
    timeout_interval_seconds: integer("timeout_interval_seconds"),
    service: varchar("service", { length: 1024 }).notNull(),
    predicted_to_be_retryable: boolean("predicted_to_be_retryable"), // null = unknown, no = not retryable, yes = retryable
    predicted_to_be_retryable_reason: text("predicted_to_be_retryable_reason"),
    predictive_retry_count: integer("predictive_retry_count").default(0),
  },
  (table) => ({
    pk: primaryKey(table.owner_hash, table.target_fn, table.idempotency_key),
  }),
);

export const machines = pgTable(
  "machines",
  {
    id: varchar("id", { length: 1024 }).notNull(),
    description: varchar("description", { length: 1024 }),
    machine_type: varchar("class", { length: 1024 }),
    last_ping_at: timestamp("last_ping_at", { withTimezone: true }),
    ip: varchar("ip", { length: 1024 }),
    cluster_id: varchar("cluster_id").notNull(),
    deployment_id: varchar("deployment_id"),
    status: text("status", {
      enum: ["active", "inactive"],
    }).default("active"),
  },
  (table) => ({
    pk: primaryKey(table.id, table.cluster_id),
  }),
);

export const clusters = pgTable("clusters", {
  id: varchar("id", { length: 1024 }).primaryKey(),
  api_secret: varchar("api_secret", { length: 1024 }).notNull(),
  description: varchar("description", { length: 1024 }),
  // TODO: deprecate this
  organization_id: varchar("organization_id"),
  created_at: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  wake_up_config: json("wake_up_config"),
  owner_id: varchar("owner_id"),
  cloud_enabled: boolean("cloud_enabled").default(false),
  predictive_retries_enabled: boolean("predictive_retries_enabled").default(
    false,
  ),
  auto_retry_stalled_jobs_enabled: boolean("retry_on_stall_enabled")
    .notNull()
    .default(true),
});

export const services = pgTable(
  "services",
  {
    cluster_id: varchar("cluster_id")
      .references(() => clusters.id)
      .notNull(),
    service: varchar("service", { length: 1024 }).notNull(),
    definition: json("definition").notNull(),
    deployment_provider: text("deployment_provider", {
      enum: ["lambda", "mock"],
    }),
  },
  (table) => ({
    pk: primaryKey(table.cluster_id, table.service),
  }),
);

export const events = pgTable(
  "events",
  {
    id: varchar("id", { length: 1024 }).primaryKey().notNull(),
    cluster_id: varchar("cluster_id")
      .references(() => clusters.id)
      .notNull(),
    type: varchar("type", { length: 1024 }).notNull(),
    job_id: varchar("job_id", { length: 1024 }).references(() => jobs.id),
    machine_id: varchar("machine_id", { length: 1024 }),
    deployment_id: varchar("deployment_id", { length: 1024 }).references(
      () => deployments.id,
    ),
    service: varchar("service", { length: 1024 }),
    created_at: timestamp("created_at", {
      withTimezone: true,
      precision: 6,
    }).notNull(),
    meta: json("meta"),
  },
  (table) => ({
    machineReference: foreignKey({
      columns: [table.machine_id, table.cluster_id],
      foreignColumns: [machines.id, machines.cluster_id],
    }),
  }),
);

export const deployments = pgTable("deployments", {
  id: varchar("id", { length: 1024 }).primaryKey().notNull(),
  cluster_id: varchar("cluster_id")
    .references(() => clusters.id)
    .notNull(),
  service: varchar("service", { length: 1024 }).notNull(),
  created_at: timestamp("created_at", {
    withTimezone: true,
    precision: 6,
  })
    .defaultNow()
    .notNull(),
  asset_upload_id: varchar("asset_upload_id", { length: 1024 })
    .references(() => assetUploads.id)
    .notNull(),
  meta: json("meta"),
  status: text("status", {
    enum: ["uploading", "ready", "active", "inactive"],
  })
    .default("uploading")
    .notNull(),
  provider: text("provider", {
    enum: ["lambda", "mock"],
  }).notNull(),
});

export const assetUploads = pgTable("asset_uploads", {
  id: varchar("id", { length: 1024 }).primaryKey().notNull(),
  type: text("type", {
    enum: ["client_library", "service_bundle"],
  }).notNull(),
  bucket: varchar("bucket", { length: 1024 }).notNull(),
  key: varchar("key", { length: 1024 }).notNull(),
  created_at: timestamp("created_at", {
    withTimezone: true,
    precision: 6,
  })
    .defaultNow()
    .notNull(),
});

export const deploymentNotification = pgTable("deployment_notifications", {
  id: varchar("id", { length: 1024 }).primaryKey().notNull(),
  deployment_id: varchar("deployment_id", { length: 1024 })
    .references(() => deployments.id)
    .notNull(),
  created_at: timestamp("created_at", {
    withTimezone: true,
    precision: 6,
  })
    .defaultNow()
    .notNull(),
});

export const deploymentProvividerConfig = pgTable(
  "deployment_provider_config",
  {
    provider: varchar("provider", { length: 1024 }).primaryKey().notNull(),
    config: json("config"),
  },
);

export const db = drizzle(pool);

export const isAlive = async () => {
  await db.execute(sql`select 1`).catch((e) => {
    console.error("Database is not alive", e);
    throw e;
  });
};
