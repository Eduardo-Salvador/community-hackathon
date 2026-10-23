import { buildApp } from './app.ts';
import { loadConfig } from './core/config.ts';

const config = loadConfig();
const app = await buildApp(config);
await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`server on :${config.port} (mock=${config.mock})`);
