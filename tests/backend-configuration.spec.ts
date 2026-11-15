import { test, expect } from "./fixtures";
import { ConfigurationError, readApiConfiguration, validateApiBaseUrl } from "../src/services/api-configuration";
import { createApiClient } from "../src/services/backend-client";
import { spawnSync } from "node:child_process";

test("configuration requires exact explicit modes and explicit Live destination", () => {
  for (const mode of [undefined, "", "LIVE", " mock", "other"]) {
    expect(readApiConfiguration(mode, "https://backend.invalid/functions/v1").error).toBeInstanceOf(ConfigurationError);
  }
  expect(readApiConfiguration("mock", "not a URL")).toEqual({ isMock: true, apiBaseUrl: null, error: null });
  for (const base of [undefined, "", "not a URL", "/api", "ftp://backend.invalid", "http://backend.invalid", "https://user:secret@backend.invalid", "https://backend.invalid?token=secret", "https://backend.invalid#fragment", " https://backend.invalid", "https:\\backend.invalid", "https://backend.invalid/a/../b"]) {
    expect(readApiConfiguration("live", base).error).toBeInstanceOf(ConfigurationError);
    let calls = 0;
    expect(() => createApiClient(base ?? "", async () => { calls++; return new Response(); })).toThrow(ConfigurationError);
    expect(calls).toBe(0);
  }
  for (const base of ["https://backend.invalid/functions/v1", "http://127.0.0.1:9999/api", "http://localhost:9999/api", "http://[::1]:9999/api"]) {
    expect(validateApiBaseUrl(base)).toBe(base);
    expect(readApiConfiguration("live", base)).toEqual({ isMock: false, apiBaseUrl: base, error: null });
  }
});

test("invalid service initialization never invokes transport and reports a non-sensitive error", () => {
  const source = `
    let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('network must not run'); };
    const services = require('./src/services/index.ts');
    (async () => {
      const operations = [() => services.accessService.verify('unused'), () => services.participantService.find('00123'),
        () => services.participantService.register({identifier:'00123',fullName:'Test'}), () => services.eligibilityService.load('00123'),
        () => services.attemptService.start({gameId:'1'}), () => services.attemptService.inspect('00123'),
        () => services.resultService.inspect('attempt'), () => services.resultService.save({attemptId:'attempt',score:0}),
        () => services.leaderboardService.load()];
      for (const operation of operations) { try { await operation(); throw new Error('accepted invalid config'); }
        catch(error) { if(error.name !== 'ConfigurationError' || error.message.includes('secret')) throw error; } }
      const React = require('react');
      const {renderToStaticMarkup} = require('react-dom/server');
      const {AccessScreen} = require('./src/features/access/access-screen.tsx');
      const html = renderToStaticMarkup(React.createElement(AccessScreen));
      if(!html.includes('role="alert"') || html.includes('<form')) throw new Error('configuration UI not blocked');
      if(calls !== 0) throw new Error('network called');
    })().catch(() => process.exitCode=1);`;
  for (const [mode, base] of [["", ""], ["unsupported", "https://backend.invalid"], ["live", ""], ["live", "https://user:secret@backend.invalid"]]) {
    const result = spawnSync(process.execPath, ["--require", "tsx/cjs", "-e", source], {
      env: { ...process.env, NEXT_PUBLIC_API_MODE: mode, NEXT_PUBLIC_API_BASE_URL: base }, encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
  }
});
