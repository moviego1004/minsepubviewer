const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const test = require("node:test");
const {
  listenWithPortFallback,
  normalizePort
} = require("../../electron/local-server.cjs");

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test("normalizePort accepts valid ports and falls back for invalid values", () => {
  assert.equal(normalizePort("9173", 1234), 9173);
  assert.equal(normalizePort("0", 1234), 0);
  assert.equal(normalizePort("invalid", 1234), 1234);
  assert.equal(normalizePort("70000", 1234), 1234);
});

test("listenWithPortFallback uses an available preferred port", async (t) => {
  const server = createServer();
  t.after(() => closeServer(server));

  const address = await listenWithPortFallback(server, { preferredPort: 0 });

  assert.equal(address.host, "127.0.0.1");
  assert.ok(address.port > 0);
  assert.equal(address.usedFallback, false);
});

test("listenWithPortFallback selects another port when the preferred port is occupied", async (t) => {
  const occupyingServer = createServer();
  const occupied = await listenWithPortFallback(occupyingServer, { preferredPort: 0 });
  const server = createServer();
  t.after(() => closeServer(server));
  t.after(() => closeServer(occupyingServer));

  const address = await listenWithPortFallback(server, {
    preferredPort: occupied.port
  });

  assert.notEqual(address.port, occupied.port);
  assert.equal(address.usedFallback, true);
});
