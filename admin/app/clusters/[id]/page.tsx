import { client } from "@/client/client";
import { auth } from "@clerk/nextjs";
import { SecretKeyReveal } from "./SecretKeyReveal";
import { Table } from "flowbite-react";
import { DataTable } from "./DataTable";
import { LiveTables } from "./LiveTables";

export default async function Page({ params }: { params: { id: string } }) {
  const { getToken } = await auth();

  const token = await getToken();

  if (!token) {
    return null;
  }

  const clusterResult = await client.getClusterDetailsForUser({
    headers: {
      authorization: `Bearer ${token}`,
    },
    params: {
      clusterId: params.id,
    },
  });

  if (clusterResult.status !== 200) {
    return null;
  }

  return (
    <section className="flex w-full h-full px-8 mt-8 mb-2 flex-col">
      <div className="flex flex-col">
        <p className="text-gray-400">Differential Cluster</p>
        <h1 className="text-2xl font-mono">{params.id}</h1>
      </div>
      <div className="mt-12">
        <h2 className="text-xl">Secret Keys</h2>
        <p className="text-gray-400 mt-2">
          These keys are used to authenticate with the cluster. They should be
          kept secret.
        </p>
        <SecretKeyReveal secretKey={clusterResult.body.apiSecret} />
      </div>

      <LiveTables token={token} clusterId={params.id} />
    </section>
  );
}
