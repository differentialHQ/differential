import { ZodSchema, z } from "zod";
import {
  CreateFunctionCommand,
  CreateFunctionCommandOutput,
  CreateFunctionRequest,
  InvokeCommand,
  LambdaClient,
  UpdateFunctionCodeCommand,
  PutFunctionConcurrencyCommand,
  UpdateFunctionConfigurationCommand,
  PutFunctionEventInvokeConfigCommand,
} from "@aws-sdk/client-lambda";
import { Deployment, s3AssetDetails } from "./deployment";
import { DeploymentProvider, fetchConfig } from "./deployment-provider";
import { getCluster } from "../cluster";

type LambdaProviderConfig = {
  createOptions: Pick<
    CreateFunctionRequest,
    "Role" | "Handler" | "Runtime" | "Timeout"
  >;
  reservedConcurrency?: number;
};

export class LambdaProvider implements DeploymentProvider {
  private lambdaClient = new LambdaClient();

  public name(): string {
    return "lambda";
  }

  public minimumNotificationInterval(): number {
    return 10000;
  }

  public schema(): ZodSchema<LambdaProviderConfig> {
    return z.object({
      createOptions: z.object({
        Role: z.string(),
        Handler: z.string().default("differential-index.handler"),
        Runtime: z.enum(["nodejs20.x"]).default("nodejs20.x"),
        Timeout: z.number().default(60),
      }),
      reservedConcurrency: z.number().default(1),
    });
  }

  public async create(
    deployment: Deployment,
  ): Promise<CreateFunctionCommandOutput> {
    const config = await this.config();
    const functionName = this.buildFunctionName(deployment);

    console.log("Creating new lambda", functionName);

    try {
      const lambda = await this.lambdaClient.send(
        new CreateFunctionCommand({
          ...config.createOptions,
          Tags: {
            clusterId: deployment.clusterId,
            service: deployment.service,
          },
          Publish: true,
          FunctionName: functionName,
          Environment: {
            ...(await this.getEnvironmentVariables(deployment)),
          },
          Code: {
            ...(await s3AssetDetails(deployment)),
          },
        }),
      );

      await this.sendFunctionUpdateCommand(
        functionName,
        deployment,
        new PutFunctionConcurrencyCommand({
          FunctionName: functionName,
          ReservedConcurrentExecutions: config.reservedConcurrency,
        }),
      );

      await this.sendFunctionUpdateCommand(
        functionName,
        deployment,
        new PutFunctionEventInvokeConfigCommand({
          FunctionName: functionName,
          MaximumRetryAttempts: 0,
        }),
      );

      return lambda;
    } catch (error: any) {
      if (error.name === "ResourceConflictException") {
        throw new Error(
          `${functionName} service has already been created. It should be updated instead.`,
        );
      }

      throw error;
    }
  }

  public async update(deployment: Deployment): Promise<any> {
    const functionName = this.buildFunctionName(deployment);

    console.log("Updating existing lambda", functionName, deployment.id);

    try {
      await this.sendFunctionUpdateCommand(
        functionName,
        deployment,
        new UpdateFunctionConfigurationCommand({
          Environment: {
            ...(await this.getEnvironmentVariables(deployment)),
          },
          FunctionName: functionName,
        }),
      );

      await this.sendFunctionUpdateCommand(
        functionName,
        deployment,
        new UpdateFunctionCodeCommand({
          FunctionName: functionName,
          Publish: true,
          ...s3AssetDetails(deployment),
        }),
      );

      console.log("Updated lambda", functionName, deployment.id);
    } catch (error: any) {
      if (error.name === "ResourceNotFoundException") {
        throw new Error(
          `${functionName} is not available. It has likely been deleted.`,
        );
      }

      throw error;
    }
  }

  public async notify(
    deployment: Deployment,
    pendingJobs: number,
    runningMachines: number,
  ): Promise<any> {
    const functionName = this.buildFunctionName(deployment);

    // TODO: This should actually evaluate the number of running instances
    // and determine how many more are needed to handle the pending jobs.
    // For now, we'll just trigger a new instance if none are running.
    if (runningMachines > 0) {
      return;
    }

    try {
      console.log("Triggering lambda", {
        functionName,
        pendingJobs,
        runningMachines,
      });

      await this.lambdaClient.send(
        new InvokeCommand({
          InvocationType: "Event",
          FunctionName: functionName,
        }),
      );
    } catch (error: any) {
      console.error("Failed to trigger lambda", functionName, error);
    }
  }

  // Sends a command to Lambda and retry if the function is still being updated
  private async sendFunctionUpdateCommand(
    functionName: string,
    deployment: Deployment,
    command:
      | PutFunctionConcurrencyCommand
      | PutFunctionEventInvokeConfigCommand
      | UpdateFunctionConfigurationCommand
      | UpdateFunctionCodeCommand,
    attempt = 1,
  ) {
    try {
      return await this.lambdaClient.send(command as any);
    } catch (error: any) {
      if (attempt > 5) {
        console.error(
          "Failed to update function code after 5 attempts",
          functionName,
          error,
        );
        throw error;
      }

      if (error.name === "ResourceConflictException") {
        const waitTime = 1000 * attempt;
        console.log(
          `Function is still being updated. Will retry in ${waitTime} ms.`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        await this.sendFunctionUpdateCommand(
          functionName,
          deployment,
          command,
          attempt + 1,
        );
        return;
      }
      throw error;
    }
  }

  private async getEnvironmentVariables(deployment: Deployment) {
    const cluster = await getCluster(deployment.clusterId);
    return {
      Variables: {
        DIFFERENTIAL_DEPLOYMENT_ID: deployment.id,
        DIFFERENTIAL_DEPLOYMENT_PROVIDER: this.name(),
        DIFFERENTIAL_API_SECRET: cluster.apiSecret,
      },
    };
  }

  private async config(): Promise<LambdaProviderConfig> {
    return await fetchConfig(this);
  }

  private buildFunctionName(deployment: Deployment): string {
    return `${deployment.clusterId}-${deployment.service}`;
  }
}
