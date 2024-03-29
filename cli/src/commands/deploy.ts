import { CommandModule } from "yargs";
import { DeployCreate } from "./deploy-create";
import { DeployInfo } from "./deploy-info";
import { DeployList } from "./deploy-list";
import { DeployLogs } from "./deploy-logs";

export const Deploy: CommandModule = {
  command: "deployments",
  aliases: ["deploy", "d"],
  describe: "Manage Differential cloud deployments",
  builder: (yargs) =>
    yargs
      .command(DeployCreate)
      .command(DeployList)
      .command(DeployInfo)
      .command(DeployLogs),
  handler: DeployCreate.handler,
};
