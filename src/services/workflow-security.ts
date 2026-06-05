import {
  fetchValidatedOutboundUrl,
  validateResolvedOutboundUrl,
  type OutboundFetchResponse,
} from "./outbound-url-guard.js";

export type { OutboundFetchResponse } from "./outbound-url-guard.js";

const WORKFLOW_CALL_API_PROTOCOLS = ["http:", "https:"] as const;
const WORKFLOW_CALL_API_GUARD = {
  allowedProtocols: WORKFLOW_CALL_API_PROTOCOLS,
  label: "Workflow call_api URL",
};

export async function validateWorkflowCallApiUrl(raw: string): Promise<void> {
  await validateResolvedOutboundUrl(raw, WORKFLOW_CALL_API_GUARD);
}

export async function fetchWorkflowCallApiUrl(
  raw: string,
  init: RequestInit
): Promise<OutboundFetchResponse> {
  return fetchValidatedOutboundUrl(raw, init, WORKFLOW_CALL_API_GUARD);
}
