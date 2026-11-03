/** Render CLI configuration without performing installation or changing existing files. */
export function renderDefaultEnv(vaultPath: string, dataDir: string): string {
  return `# WebObsidian CLI Configuration (~/.webobsidian/.env)
PORT=8787
HOST=0.0.0.0
VAULT_PATH=${vaultPath}
DATA_DIR=${dataDir}
ALLOWED_ROOTS=${vaultPath}
# Optional recovery override: set a private password to enable it.
WEBOBSIDIAN_PASSWORD=
WEBOBSIDIAN_WATCH=auto
TRUST_PROXY=true
`;
}
