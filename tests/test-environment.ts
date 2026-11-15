// Reserved non-routable name; never use an operator's real API URL in local tests.
export const TEST_API_BASE_URL = "https://backend.invalid/functions/v1";
export const testMode = process.env.NEXT_PUBLIC_API_MODE;
export const TEST_ORIGIN = `http://127.0.0.1:${testMode === "mock" ? 3101 : 3102}`;
