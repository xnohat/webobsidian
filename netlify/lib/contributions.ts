import type { CreateContributionInput } from './github.js';
import { assertWritableMarkdownPath } from './paths.js';

const MAX_FILES = 20;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;

interface RawContributionInput {
  title?: unknown;
  contributor?: { name?: unknown };
  files?: Array<{ path?: unknown; content?: unknown }>;
  branch?: unknown;
}

export function validateContributionInput(raw: RawContributionInput): CreateContributionInput {
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const contributorName =
    typeof raw.contributor?.name === 'string' ? raw.contributor.name.trim() : '';

  if (!title || title.length > 120) throw new Error('title must contain 1 to 120 characters');
  if (!contributorName || contributorName.length > 80) {
    throw new Error('contributor.name must contain 1 to 80 characters');
  }
  if (!Array.isArray(raw.files) || raw.files.length === 0 || raw.files.length > MAX_FILES) {
    throw new Error(`files must contain 1 to ${MAX_FILES} documents`);
  }

  const seen = new Set<string>();
  let totalBytes = 0;
  const files = raw.files.map((file) => {
    if (typeof file.path !== 'string' || typeof file.content !== 'string') {
      throw new Error('Each file requires string path and content values');
    }
    const path = assertWritableMarkdownPath(file.path);
    const key = path.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate file path: ${path}`);
    seen.add(key);

    const bytes = new TextEncoder().encode(file.content).byteLength;
    if (bytes > MAX_FILE_BYTES) throw new Error(`File exceeds 256 KiB: ${path}`);
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Contribution exceeds 1 MiB');
    return { path, content: file.content };
  });

  let branch: string | undefined;
  if (raw.branch !== undefined) {
    if (typeof raw.branch !== 'string' || !/^contrib\/\d{8}-[a-f0-9]{8}$/.test(raw.branch)) {
      throw new Error('branch must be a contribution branch created by this editor');
    }
    branch = raw.branch;
  }

  return { title, contributorName, files, ...(branch ? { branch } : {}) };
}

export function createContributionBranch(
  now: Date = new Date(),
  id: string = crypto.randomUUID(),
): string {
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  const safeId = id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  return `contrib/${date}-${safeId}`;
}
