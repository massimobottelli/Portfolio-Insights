import Fastify from 'fastify';

/**
 * Fastify server entry point.
 * API layer: validates HTTP requests, orchestrates services, returns responses.
 * Never contains financial calculations or direct Prisma access.
 */
export async function createServer() {
  const app = Fastify({ logger: true });

  // Health check — verifies the server is running
  app.get('/health', async () => {
    return { status: 'ok' };
  });

  // Portfolio endpoint — will be implemented in EPIC 6
  app.get('/api/portfolio', async () => {
    return { message: 'Portfolio endpoint — coming in EPIC 6' };
  });

  return app;
}

// Start server when this file is run directly
const start = async () => {
  const app = await createServer();
  try {
    await app.listen({ port: 3000 });
    console.log('API server running on http://localhost:3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();