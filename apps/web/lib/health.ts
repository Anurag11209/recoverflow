export interface HealthStatus {
  status: 'ok';
  service: string;
  version: string;
  timestamp: string;
}

export function buildHealth(): HealthStatus {
  return {
    status: 'ok',
    service: 'recoverflow-web',
    version: process.env.npm_package_version ?? '0.1.0',
    timestamp: new Date().toISOString(),
  };
}
