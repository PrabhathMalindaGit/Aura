#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:net";

const PORT_ENV_KEYS = [
  "PORT",
  "METRO_PORT",
  "RCT_METRO_PORT",
  "EXPO_PACKAGER_PORT",
  "EXPO_DEBUGGER_PORT",
  "WEB_PORT",
  "REACT_NATIVE_PACKAGER_PORT",
  "REACT_NATIVE_PACKAGER_HOSTNAME",
];
const DEFAULT_BASE_PORT = 8081;
const PORT_SCAN_WINDOW = 50;

function parsePort(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    return null;
  }
  return parsed;
}

function removeArgWithValue(args, flag) {
  const result = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === flag) {
      const next = args[index + 1];
      if (next !== undefined && !next.startsWith("-")) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith(`${flag}=`)) {
      continue;
    }
    result.push(arg);
  }
  return result;
}

function hasHostFlag(args) {
  return args.includes("--localhost") || args.includes("--lan") || args.includes("--tunnel");
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();

    server.once("error", () => {
      resolve(false);
    });

    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(basePort, windowSize) {
  for (let port = basePort; port <= basePort + windowSize; port += 1) {
    if (port > 65535) {
      break;
    }
    // eslint-disable-next-line no-await-in-loop
    const free = await isPortFree(port);
    if (free) {
      return port;
    }
  }
  return null;
}

function formatRemovedVars(removedVars) {
  if (removedVars.length === 0) {
    return "none";
  }
  const limit = 8;
  if (removedVars.length <= limit) {
    return removedVars.join(", ");
  }
  return `${removedVars.slice(0, limit).join(", ")}, ...(+${removedVars.length - limit} more)`;
}

async function main() {
  const env = { ...process.env };
  const removedVars = [];

  for (const key of PORT_ENV_KEYS) {
    if (env[key] !== undefined) {
      removedVars.push(`${key}=${env[key]}`);
      delete env[key];
    }
  }

  console.log(`[safe-start] Removed port env vars: ${formatRemovedVars(removedVars)}`);

  const rawUserArgs = process.argv.slice(2);
  const cleanedUserArgs = removeArgWithValue(rawUserArgs, "--port");

  const requestedBasePort = parsePort(process.env.AURA_DEV_PORT);
  const basePort = requestedBasePort ?? DEFAULT_BASE_PORT;
  if (process.env.AURA_DEV_PORT !== undefined && requestedBasePort === null) {
    console.log(
      `[safe-start] Ignoring invalid AURA_DEV_PORT=${process.env.AURA_DEV_PORT}; using ${DEFAULT_BASE_PORT}`
    );
  }

  const chosenPort = await findAvailablePort(basePort, PORT_SCAN_WINDOW);
  if (chosenPort === null) {
    throw new Error(
      `No free port in ${basePort}..${Math.min(basePort + PORT_SCAN_WINDOW, 65535)}. Stop other Expo/Metro processes and retry.`
    );
  }

  env.RCT_METRO_PORT = String(chosenPort);
  env.EXPO_PACKAGER_PORT = String(chosenPort);
  env.WEB_PORT = String(chosenPort);
  env.PORT = String(chosenPort);

  console.log(`[safe-start] Using Metro/Web port: ${chosenPort}`);
  console.log(
    `[safe-start] PORT env after forcing: PORT=${env.PORT} RCT_METRO_PORT=${env.RCT_METRO_PORT} WEB_PORT=${env.WEB_PORT}`
  );

  const expoArgs = [
    "expo",
    "start",
    "--clear",
    "--port",
    String(chosenPort),
    ...(hasHostFlag(cleanedUserArgs) ? [] : ["--localhost"]),
    ...cleanedUserArgs,
  ];

  console.log(`[safe-start] Command: npx ${expoArgs.join(" ")}`);

  const child = spawn("npx", expoArgs, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });

  child.on("error", (error) => {
    console.error(`[safe-start] Failed to launch Expo: ${error.message}`);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

main().catch((error) => {
  console.error(`[safe-start] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
