#!/usr/bin/env node

import { spawn } from "node:child_process";

const PORT_ENV_KEYS = [
  "PORT",
  "RCT_METRO_PORT",
  "EXPO_PACKAGER_PORT",
  "WEB_PORT",
];

const FORCED_PORT = "8081";
const env = { ...process.env };
const removedVars = [];

for (const key of PORT_ENV_KEYS) {
  const value = env[key];
  if (value === undefined) {
    continue;
  }

  const parsed = Number(value);
  const isInvalid =
    !Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0 || parsed >= 65536;

  if (isInvalid) {
    removedVars.push(`${key}=${value}`);
    delete env[key];
  }
}

if (removedVars.length > 0) {
  console.log(`[safe-start] Removed invalid port env vars: ${removedVars.join(", ")}`);
} else {
  console.log("[safe-start] Removed invalid port env vars: none");
}
console.log(`[safe-start] Forcing Expo/Metro port: ${FORCED_PORT}`);

const userArgs = process.argv.slice(2);
const expoArgs = [
  "expo",
  "start",
  "--clear",
  "--localhost",
  "--port",
  FORCED_PORT,
  ...userArgs,
];

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
