function normalizePort(value, fallbackPort) {
  if (value === undefined || value === null || value === "") {
    return fallbackPort;
  }

  const port = Number(value);

  return Number.isInteger(port) && port >= 0 && port <= 65535
    ? port
    : fallbackPort;
}

function listenOnce(server, options) {
  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      cleanup();
      reject(error);
    };
    const handleListening = () => {
      const address = server.address();
      cleanup();

      if (!address || typeof address === "string") {
        reject(new Error("Local server did not expose a TCP port"));
        return;
      }

      resolve(address.port);
    };
    const cleanup = () => {
      server.off("error", handleError);
      server.off("listening", handleListening);
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(options);
  });
}

async function listenWithPortFallback(server, options = {}) {
  const host = options.host || "127.0.0.1";
  const preferredPort = normalizePort(options.preferredPort, 0);

  try {
    const port = await listenOnce(server, { host, port: preferredPort });
    return { host, port, usedFallback: false };
  } catch (error) {
    if (error?.code !== "EADDRINUSE" || preferredPort === 0) {
      throw error;
    }

    const port = await listenOnce(server, { host, port: 0 });
    return { host, port, usedFallback: true };
  }
}

module.exports = {
  listenWithPortFallback,
  normalizePort
};
