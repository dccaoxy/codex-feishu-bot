import fs from 'node:fs';
import path from 'node:path';

function absolute(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0') || value.split(path.sep).includes('..')) {
    throw Error('项目边界路径必须为不含 .. 的绝对路径');
  }
  return path.normalize(value);
}

export function projectRoots(values = []) {
  if (!Array.isArray(values)) throw Error('ownerAccess.projectRoots 必须为绝对路径数组');
  return Object.freeze([...new Set(values.map(value => {
    const root = fs.realpathSync.native(absolute(value));
    if (!fs.statSync(root).isDirectory()) throw Error('projectRoot 必须是现有目录');
    return root;
  }))]);
}

// Resolve existing ancestors before appending missing components. Dangling
// symlinks, permission errors and non-directory ancestors fail closed.
export function canonicalWritePath(value) {
  let current = absolute(value);
  const missing = [];
  for (;;) {
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (e) {
      if (e.code !== 'ENOENT') throw e;
      const parent = path.dirname(current);
      if (parent === current) throw e;
      missing.unshift(path.basename(current));
      current = parent;
      continue;
    }
    const resolved = fs.realpathSync.native(current);
    if (missing.length && !(stat.isDirectory() || (stat.isSymbolicLink() && fs.statSync(resolved).isDirectory()))) {
      throw Error('写入目标的现有祖先不是目录');
    }
    return path.join(resolved, ...missing);
  }
}

// Classification only: this does not grant a sandbox permission or execute an
// operation. A future executor must prevent symlink replacement between check
// and use, and bind approvals to all affected paths (including rename source).
export function classifyProjectWrite(target, roots) {
  const canonical = canonicalWritePath(target);
  const inside = roots.some(root => {
    if (fs.realpathSync.native(root) !== root || !fs.statSync(root).isDirectory()) throw Error('项目根目录已变化');
    const relative = path.relative(root, canonical);
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
  });
  return Object.freeze({target: canonical, requiresApproval: !inside});
}
