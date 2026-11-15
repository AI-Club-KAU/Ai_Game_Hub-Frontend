
import { readApiConfiguration } from "./api-configuration";
const configuration = readApiConfiguration(process.env.NEXT_PUBLIC_API_MODE, process.env.NEXT_PUBLIC_API_BASE_URL);
export const { isMock, apiBaseUrl, error: configurationError } = configuration;
