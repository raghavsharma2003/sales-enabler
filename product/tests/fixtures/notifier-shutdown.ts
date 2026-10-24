// Child process for tests/notifier-shutdown.test.ts: build the app with the workspace module (notifier and timers on, as in
// production), wait until the LISTEN connection is up, then shut down the way argv[2] says and let the process end by itself.
//   close      server.close() + stop() + pool.end(): a graceful shutdown
//   pool-only  pool.end() only, the way a bench or script that never closes the server ends
process.env.NODE_ENV = 'production';
(async () => {
  const { buildApp } = await import('../../server/app.ts');
  const { createPool } = await import('../../server/db.ts');
  const { module: workspace } = await import('../../server/modules/workspace/index.ts');
  const pool = createPool(process.env.DATABASE_URL);
  const { server, stop } = buildApp(pool, [workspace]);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const listening = async () => (await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND query ILIKE 'LISTEN vp_outbox%'")).rows[0].n;
  const t0 = Date.now();
  while (!(await listening()) && Date.now() - t0 < 8000) await new Promise(r => setTimeout(r, 100));
  console.log(`listening=${await listening()}`);
  if (process.argv[2] === 'close') { server.close(); await stop(); await pool.end(); }
  else { await pool.end(); server.close(); }
  console.log('shut down; waiting for the event loop to empty');
})().catch(e => { console.error(e); process.exit(1); });
