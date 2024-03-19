import { CommandModule } from "yargs";
import { selectCluster } from "../utils";
import * as fs from "fs";
import * as os from "os";
import { buildClientPackage, buildProject } from "../lib/package";
import { uploadAsset } from "../lib/upload";
import debug from "debug";
import { client } from "../lib/client";
import { select } from "@inquirer/prompts";
import { CLIENT_PACKAGE_SCOPE } from "../constants";
import { cloudEnabledCheck } from "../lib/auth";

const log = debug("differential:cli:client-lib:publish");

interface ClientLibraryPublishArgs {
  entrypoint?: string;
  cluster?: string;
  increment?: string;
}
export const ClientLibraryPublish: CommandModule<{}, ClientLibraryPublishArgs> =
  {
    command: "publish",
    describe: "Publish a client library to Differential",
    builder: (yargs) =>
      yargs
        .option("cluster", {
          describe: "Cluster ID",
          demandOption: false,
          type: "string",
        })
        .option("entrypoint", {
          describe:
            "Path to service entrypoint file (default: package.json#main)",
          demandOption: false,
          type: "string",
        })
        .option("increment", {
          describe: "Version increment (major, minor, patch)",
          demandOption: false,
          choices: ["major", "minor", "patch"],
          type: "string",
        }),
    handler: async ({ cluster, entrypoint, increment }) => {
      if (!cluster) {
        cluster = await selectCluster();
        if (!cluster) {
          console.log("No cluster selected");
          return;
        }
      }

      if (!(await cloudEnabledCheck(cluster))) {
        return;
      }

      if (!increment) {
        increment = await select({
          message: "Select version increment",
          choices: [
            { name: "Major", value: "major" },
            { name: "Minor", value: "minor" },
            { name: "Patch", value: "patch" },
          ],
        });
      }

      const tmpDir = fs.mkdtempSync(os.tmpdir());
      try {
        const outDir = `${tmpDir}/out`;

        console.log("⚙️   Building project");

        const project = await buildProject(outDir, entrypoint);

        console.log("🔍   Finding service registrations");
        if (project.serviceRegistrations.size === 0) {
          throw new Error("No service registrations found in project");
        }
        console.log("🔍   Found the following service registrations:");
        for (const [name] of project.serviceRegistrations.entries()) {
          console.log(`     - ${name}`);
        }

        console.log(`📦  Packaging client library`);
        const libraryResponse = await client.createClientLibraryVersion({
          params: {
            clusterId: cluster,
          },
          body: {
            increment: increment as "major" | "minor" | "patch",
          },
        });

        if (libraryResponse.status !== 201) {
          log("Failed to create library version", { libraryResponse });
          throw new Error(
            `Failed to create client library: ${libraryResponse.status}`,
          );
        }

        const library = libraryResponse.body;
        const fullPackageName = `${CLIENT_PACKAGE_SCOPE}/${cluster}@${library.version}`;

        const clientPath = await buildClientPackage({
          project,
          cluster,
          scope: CLIENT_PACKAGE_SCOPE,
          version: library.version,
          outDir,
        });

        console.log(`📦  Publishing client library to Differential`);

        await uploadAsset({
          path: clientPath,
          contentType: "application/gzip",
          target: library.id,
          type: "client_library",
          cluster,
        });

        console.log(`✅  Published ${fullPackageName} to Differential`);
      } finally {
        log("Cleaning up temporary directory", { tmpDir });
        fs.rmSync(tmpDir, { recursive: true });
      }
    },
  };
