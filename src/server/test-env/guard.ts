export class TestEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestEnvError";
  }
}

export type MysqlTarget = {
  host: string;
  port: number;
  database: string;
};

const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "mysql", "::1"]);

/** Only this schema may be wiped. Production and Azure acceptance are both named veiligstallen. */
export const ACC_DOCKER_DATABASE = "acc_docker";

export function parseMysqlUrl(raw: string | undefined, label: string): MysqlTarget {
  if (!raw?.trim()) throw new TestEnvError(`${label} is niet gezet`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new TestEnvError(`${label} is geen geldige URL`);
  }
  if (url.protocol !== "mysql:") throw new TestEnvError(`${label} moet een mysql:// URL zijn`);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new TestEnvError(`${label} heeft geen databasenaam`);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    database,
  };
}

export function assertBootstrapEnabled(): void {
  if (process.env.TEST_ENV_BOOTSTRAP !== "1") {
    throw new TestEnvError("Testomgeving-bootstrap staat uit (TEST_ENV_BOOTSTRAP=1)");
  }
  if (process.env.NEXT_PUBLIC_APP_ENV === "production") {
    throw new TestEnvError("Bootstrap mag niet aanstaan als NEXT_PUBLIC_APP_ENV=production");
  }
}

export function assertTargetDatabase(databaseUrl = process.env.DATABASE_URL, prodUrl = process.env.PROD_DATABASE_URL): MysqlTarget {
  assertBootstrapEnabled();
  const target = parseMysqlUrl(databaseUrl, "DATABASE_URL");
  if (target.database !== ACC_DOCKER_DATABASE) {
    throw new TestEnvError(
      `DATABASE_URL database moet ${ACC_DOCKER_DATABASE} zijn. De naam veiligstallen is productie en Azure-acceptatie, en wordt niet gewist`,
    );
  }
  const host = target.host.toLowerCase();
  if (host.endsWith(".database.azure.com") || host.endsWith(".mysql.database.azure.com")) {
    throw new TestEnvError("DATABASE_URL wijst naar Azure MySQL");
  }
  if (!ALLOWED_HOSTS.has(host)) {
    throw new TestEnvError(`DATABASE_URL host '${target.host}' is niet toegestaan voor de testomgeving`);
  }
  if (prodUrl?.trim()) {
    const prod = parseMysqlUrl(prodUrl, "PROD_DATABASE_URL");
    if (prod.host.toLowerCase() === host && prod.port === target.port) {
      throw new TestEnvError("DATABASE_URL en PROD_DATABASE_URL wijzen naar dezelfde server");
    }
  }
  return target;
}

export function prodDatabaseConfigured(): boolean {
  return Boolean(process.env.PROD_DATABASE_URL?.trim());
}
