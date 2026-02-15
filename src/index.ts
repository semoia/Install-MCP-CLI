#!/usr/bin/env node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { closeSync, openSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const OFFICIAL_SETUP_URL = "https://beta.trysemoia.com/api/setup-script?type=js";
const DEFAULT_TIMEOUT_MS = 30000;

type ParsedArgs = {
  showHelp: boolean;
  dryRun: boolean;
  timeoutMs: number;
  passthroughArgs: string[];
};

function print(message = "") {
  process.stdout.write(`${message}\n`);
}

function printError(message: string) {
  process.stderr.write(`${message}\n`);
}

function showHelp() {
  print("Semoia MCP Installer CLI");
  print("");
  print("Usage:");
  print("  install-mcp [target|options]");
  print("");
  print("Examples:");
  print("  install-mcp");
  print("  install-mcp cursor");
  print("");
  print("Options:");
  print("  -h, --help              Show help");
  print("      --timeout <ms>      Download timeout in milliseconds (default: 30000)");
  print("      --dry-run           Print resolved values and exit");
  print("");
  print(`Official setup endpoint: ${OFFICIAL_SETUP_URL}`);
  print("");
  print("Any other args are passed through to setup.mjs.");
}

function parsePositiveInt(raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid timeout value: ${raw}`);
  }
  return Math.floor(value);
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const parsed: ParsedArgs = {
    showHelp: false,
    dryRun: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    passthroughArgs: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      parsed.passthroughArgs.push(...args.slice(i + 1));
      break;
    }
    if (arg === "-h" || arg === "--help") {
      parsed.showHelp = true;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg === "-l" || arg === "--local" || arg === "--setup-url" || arg.startsWith("--setup-url=")) {
      throw new Error("This CLI is end-user only and uses the official Semoia domain. Local/custom setup URL is not supported.");
    }
    if (arg === "--timeout") {
      const value = args[i + 1];
      if (!value) throw new Error("Missing value for --timeout");
      parsed.timeoutMs = parsePositiveInt(value);
      i++;
      continue;
    }
    if (arg.startsWith("--timeout=")) {
      parsed.timeoutMs = parsePositiveInt(arg.slice("--timeout=".length));
      continue;
    }
    parsed.passthroughArgs.push(arg);
  }

  return parsed;
}

function ensureNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isFinite(major) || major < 18) {
    throw new Error(`Node.js 18+ is required. Current version: ${process.version}`);
  }
}

async function downloadSetupScript(setupUrl: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(setupUrl, {
      headers: {
        "User-Agent": "semoia-install-mcp/1.0.0",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Setup endpoint returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }

    const source = await res.text();
    if (!source.trim()) {
      throw new Error("Received empty setup script");
    }
    return source;
  } finally {
    clearTimeout(timer);
  }
}

function runSetupScript(scriptPath: string, passthroughArgs: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    let ttyFd: number | null = null;
    let stdio: "inherit" | [number, "inherit", "inherit"] = "inherit";

    // Keep wizard interactive even when command is piped (POSIX).
    if (!process.stdin.isTTY && process.platform !== "win32") {
      try {
        ttyFd = openSync("/dev/tty", "r");
        stdio = [ttyFd, "inherit", "inherit"];
      } catch {
        stdio = "inherit";
      }
    }

    const child = spawn(process.execPath, [scriptPath, ...passthroughArgs], {
      stdio,
      env: process.env,
    });

    child.on("error", (err) => {
      if (ttyFd !== null) closeSync(ttyFd);
      reject(err);
    });

    child.on("exit", (code, signal) => {
      if (ttyFd !== null) closeSync(ttyFd);
      if (signal) {
        reject(new Error(`Setup process terminated with signal: ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main() {
  ensureNodeVersion();
  const args = parseArgs(process.argv);

  if (args.showHelp) {
    showHelp();
    return;
  }

  const setupUrl = OFFICIAL_SETUP_URL;
  if (args.dryRun) {
    print(`setupUrl=${setupUrl}`);
    print(`timeoutMs=${args.timeoutMs}`);
    print(`passthroughArgs=${JSON.stringify(args.passthroughArgs)}`);
    return;
  }

  print("Installing Semoia MCP...");
  print(`Fetching setup wizard from: ${setupUrl}`);

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "semoia-install-mcp-"));
  const setupPath = path.join(tmpDir, "setup.mjs");

  try {
    const setupSource = await downloadSetupScript(setupUrl, args.timeoutMs);
    await writeFile(setupPath, setupSource, "utf8");
    const exitCode = await runSetupScript(setupPath, args.passthroughArgs);
    process.exitCode = exitCode;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  printError(`Install failed: ${message}`);
  process.exit(1);
});
