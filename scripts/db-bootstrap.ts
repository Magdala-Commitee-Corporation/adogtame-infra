/**
 * Creates one database per service inside the Aurora cluster (ADO-14).
 * Safe to run more than once: existing databases are skipped.
 *
 *   npm run db:bootstrap -- dev
 *
 * Each service then creates its own tables with its migrations
 * (`npm run db:migrate` in its repository).
 */
import { ExecuteStatementCommand, type ExecuteStatementCommandOutput, RDSDataClient } from "@aws-sdk/client-rds-data";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

const SERVICE_DATABASES = ["auth", "dogs"];
const DEFAULT_DATABASE = "adogtame";

const stage = process.argv[2];
if (!stage) {
  console.error("Usage: npm run db:bootstrap -- <stage>");
  process.exit(1);
}

const config = { region: "us-east-1" };
const ssm = new SSMClient(config);
const rds = new RDSDataClient(config);

const param = async (name: string) => {
  const res = await ssm.send(new GetParameterCommand({ Name: `/adogtame/${stage}/db/${name}` }));
  return res.Parameter!.Value!;
};

const resourceArn = await param("cluster-arn");
const secretArn = await param("secret-arn");

// A paused cluster answers DatabaseResumingException for about 15 s.
const execute = async (sql: string, attempt = 1): Promise<ExecuteStatementCommandOutput> => {
  try {
    return await rds.send(new ExecuteStatementCommand({ resourceArn, secretArn, database: DEFAULT_DATABASE, sql }));
  } catch (error) {
    if ((error as Error).name === "DatabaseResumingException" && attempt < 10) {
      console.log("Database is resuming, retrying in 5 s...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return execute(sql, attempt + 1);
    }
    throw error;
  }
};

const result = await execute("SELECT datname FROM pg_database");
const names = new Set((result.records ?? []).map((row) => row[0]?.stringValue));

for (const db of SERVICE_DATABASES) {
  if (names.has(db)) {
    console.log(`Database "${db}" already exists`);
    continue;
  }
  await execute(`CREATE DATABASE ${db}`);
  console.log(`Database "${db}" created`);
}
