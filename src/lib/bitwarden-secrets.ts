import "server-only";

import {
  BitwardenClient,
  type SecretResponse,
} from "@bitwarden/sdk-napi";

const ACCESS_TOKEN = process.env.BITWARDEN_ACCESS_TOKEN;
const ORGANIZATION_ID = process.env.BITWARDEN_ORGANIZATION_ID;
const PROJECT_ID = process.env.BITWARDEN_PROJECT_ID;

function configuration() {
  if (!ACCESS_TOKEN || !ORGANIZATION_ID || !PROJECT_ID) {
    throw new Error("Bitwarden Secrets Manager no está configurado completamente.");
  }
  return { accessToken: ACCESS_TOKEN, organizationId: ORGANIZATION_ID, projectId: PROJECT_ID };
}

async function client() {
  const { accessToken } = configuration();
  const sdk = new BitwardenClient(
    {
      apiUrl: "https://api.bitwarden.com",
      identityUrl: "https://identity.bitwarden.com",
      userAgent: "control-cambios/bitwarden",
    },
    4,
  );
  await sdk.auth().loginAccessToken(accessToken);
  return sdk;
}

/**
 * Comprueba la conexión sin devolver valores secretos al navegador ni a logs.
 * La lectura de valores quedará en una siguiente fase, cuando cada cuenta
 * tenga una referencia secret_id persistida en Supabase.
 */
export async function listPanelSecretMetadata() {
  const { organizationId, projectId } = configuration();
  const sdk = await client();
  const response = await sdk.secrets().list(organizationId);
  const secrets = response.data ?? [];
  const metadata: Array<Pick<SecretResponse, "id" | "key" | "organizationId">> = [];

  for (const item of secrets) {
    const secret = await sdk.secrets().get(item.id);
    if (secret.projectId === projectId) {
      metadata.push({
        id: secret.id,
        key: secret.key,
        organizationId: secret.organizationId,
      });
    }
  }

  return metadata;
}
