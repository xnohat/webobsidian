import { api, type TreeNode } from './api';
import { draftAssetUrl } from './draftAssets';
import { resolveAssetPath } from './tree';

export function vaultAssetUrl(
  tree: TreeNode | null,
  target: string,
  activePath: string | null,
): string {
  const path = resolveAssetPath(tree, target, activePath) ?? target;
  return draftAssetUrl(path) ?? api.rawUrl(path);
}
