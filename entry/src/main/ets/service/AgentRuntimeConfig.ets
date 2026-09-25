/** Select the local mock or the HTTP gateway without changing the ViewModel contract. */
export enum AgentBackendMode {
  MOCK = 'mock',
  REMOTE = 'remote'
}

/** Keep MOCK as the safe default; set REMOTE only when the local gateway is running. */
export const AGENT_BACKEND_MODE: AgentBackendMode = AgentBackendMode.MOCK;

/** Replace with the host address reachable from the simulator, not 127.0.0.1 on the device. */
export const AGENT_GATEWAY_BASE_URL: string = 'http://127.0.0.1:3180';

/** Development-only gateway access key. Never put the upstream Agent service token here. */
export const AGENT_GATEWAY_DEV_TOKEN: string = '';
