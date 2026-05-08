export type CloudProviderMode = "mock" | "supabase";

export type CloudProviderConfig = {
  mode: CloudProviderMode;
  cloudUrl: string | null;
};

export function getCloudProviderConfig(): CloudProviderConfig {
  const mode = (process.env.QOUTERX_CLOUD_PROVIDER?.trim().toLowerCase() === "supabase" ? "supabase" : "mock") as CloudProviderMode;
  const cloudUrl = process.env.QOUTERX_CLOUD_URL?.trim() || null;
  return {
    mode,
    cloudUrl
  };
}
