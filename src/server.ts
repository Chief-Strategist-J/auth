import * as http from 'http';
import { ServiceRegistryManager, HTTP_CONSTANTS } from '@chief-strategist-j/shared-infra';
import { AuthService } from './features/auth/service';
import { AuthRestV1Router } from './api/rest/v1/router';
import { AlloyDBOmniAuthAdapter } from './infra/adapters/postgres/alloydb-omni-auth.adapter';
import { RealPostgresAuthAdapter } from './infra/adapters/postgres/real-postgres-auth.adapter';
import { RedisCacheAdapter } from './infra/adapters/redis/redis-cache.adapter';

import type { AuthRepositoryPort } from './features/auth/repository';
import { AuthEventProducer } from './shared/messaging/producers/auth-event.producer';
import { AuthEventConsumer } from './shared/messaging/consumers/auth-event.consumer';
import { AUTH_CONSTANTS } from './shared/constants/auth.constants';
import { HTTP_METHODS } from './shared/constants/endpoints';
import { initAuthTracing } from './infra/tracing/tracer';
import { runWithHttpTracing } from './infra/tracing/middleware';
import { runMigrations } from '../database/migrate';

initAuthTracing();

const isMockDb = process.env.USE_MOCK_DB === 'true';

if (!isMockDb) {
  runMigrations().catch((err: any) => {
    console.warn('[db-migrate] Auto-migration status:', err?.message || err);
  });
}

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : AUTH_CONSTANTS.DEFAULT_PORT;

const dbUrl = process.env.DATABASE_URL || AUTH_CONSTANTS.DEFAULT_DATABASE_URL;
export const repositoryAdapter: AuthRepositoryPort = isMockDb
  ? new AlloyDBOmniAuthAdapter()
  : new RealPostgresAuthAdapter(dbUrl);

export const authEventProducer = new AuthEventProducer();
export const authEventConsumer = new AuthEventConsumer();

authEventProducer.init().catch((err: any) => {
  console.warn('[kafka-producer] Operating in fallback mode:', err?.message || err);
});

authEventConsumer.init().catch((err: any) => {
  console.warn('[kafka-consumer] Operating in fallback mode:', err?.message || err);
});

export const cacheAdapter = new RedisCacheAdapter();
export const service = new AuthService(repositoryAdapter, authEventProducer, cacheAdapter);
export const router = new AuthRestV1Router(service);

const server = http.createServer((req, res) => {
  const method = req.method ?? HTTP_METHODS.GET;
  const url = req.url ?? AUTH_CONSTANTS.ENDPOINT_ROOT;

  if (method === AUTH_CONSTANTS.METHOD_OPTIONS) {
    res.writeHead(AUTH_CONSTANTS.STATUS_NO_CONTENT, AUTH_CONSTANTS.SECURITY_CONFIG.CORS_HEADERS);
    res.end();
    return;
  }

  let bodyData = '';
  req.on('data', (chunk) => {
    bodyData += chunk.toString();
  });

  req.on('end', async () => {
    await runWithHttpTracing(req, res, async () => {
      let parsedBody: unknown = undefined;
      if (bodyData) {
        try {
          parsedBody = JSON.parse(bodyData);
        } catch {
          parsedBody = bodyData;
        }
      }

      const headersRecord: Record<string, string> = {};
      for (const [key, val] of Object.entries(req.headers)) {
        if (typeof val === 'string') {
          headersRecord[key.toLowerCase()] = val;
        }
      }

      const baseHost = req.headers.host || `${HTTP_CONSTANTS.HOST_LOCALHOST}:${port}`;
      const parsedUrl = new URL(url, `${AUTH_CONSTANTS.DEFAULT_PROTOCOL}://${baseHost}`);
      const pathname = parsedUrl.pathname;
      const queryParams: Record<string, string> = {};
      parsedUrl.searchParams.forEach((val, key) => {
        queryParams[key] = val;
      });

      const result = await router.route(method, pathname, parsedBody, headersRecord, queryParams);

      res.writeHead(result.statusCode, {
        ...AUTH_CONSTANTS.SECURITY_CONFIG.CORS_HEADERS,
        [AUTH_CONSTANTS.HEADER_CONTENT_TYPE]: AUTH_CONSTANTS.HEADERS.CONTENT_TYPE_JSON,
      });
      res.end(JSON.stringify(result.payload));
    });
  });
});

const authRegistryManager = new ServiceRegistryManager({
  name: AUTH_CONSTANTS.SERVICE_NAME,
  host: process.env.HOST || process.env.SERVICE_HOST || process.env.HOSTNAME || '',
  port,
  protocol: AUTH_CONSTANTS.DEFAULT_PROTOCOL,
});

server.listen(port, () => {
  console.log(`[${AUTH_CONSTANTS.SERVICE_NAME}] Auth HTTP Service running live on ${AUTH_CONSTANTS.DEFAULT_PROTOCOL}://${HTTP_CONSTANTS.HOST_LOCALHOST}:${port}`);
  authRegistryManager.register().catch(() => {});
});
