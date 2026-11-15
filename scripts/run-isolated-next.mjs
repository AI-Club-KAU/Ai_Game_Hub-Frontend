import { cpSync, mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [action, mode, port = "3101"] = process.argv.slice(2);
if (!["dev", "build"].includes(action) || !["mock", "live", "invalid"].includes(mode)) throw new Error("Use dev/build and mock/live/invalid");
mkdirSync(join(root, "tmp"), { recursive: true });
const workspace = mkdtempSync(join(root, "tmp", "isolated-next-"));
// No .env files, incoming games, existing .next output, or credentials are copied.
for (const name of ["src", "public", "package.json", "next.config.ts", "postcss.config.mjs", "tsconfig.json", "next-env.d.ts", "AGENTS.md"]) {
  cpSync(join(root, name), join(workspace, name), { recursive: true });
}
symlinkSync(join(root, "node_modules"), join(workspace, "node_modules"), "junction");
const env = { ...process.env, NEXT_PUBLIC_API_MODE: mode === "invalid" ? "" : mode,
  NEXT_PUBLIC_API_BASE_URL: mode === "invalid" ? "" : "https://backend.invalid/functions/v1",
  NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: `--require="${join(root, "scripts", "offline-network-guard.cjs").replaceAll("\\", "/")}"` };
const args = [join(root, "node_modules", "next", "dist", "bin", "next"), action, "--webpack"];
if (action === "dev") args.push("--hostname", "127.0.0.1", "--port", port);
console.log(`Isolated ${action} (${mode}); generated files stay under tmp/`);
const child = spawn(process.execPath, args, { cwd: workspace, env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 1));
child.on("error", () => process.exit(1));
