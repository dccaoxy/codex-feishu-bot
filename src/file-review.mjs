import {classifyProjectWrite} from './project-paths.mjs';

// This is a review snapshot, not an execution capability. The App Server still
// owns the actual syscall; rechecking here cannot close its check/use window.
export function fileReview(changes, roots) {
  if (!Array.isArray(changes) || !changes.length) throw Error('文件变更详情缺失');
  const targets = [];
  for (const change of changes) {
    if (!change || typeof change.diff !== 'string' || !change.kind ||
        Object.keys(change).some(k => !['path','kind','diff'].includes(k)) ||
        Object.keys(change.kind).some(k => !['type','movePath'].includes(k)) ||
        !['add','update','delete'].includes(change.kind.type)) throw Error('文件变更协议无法完整核对');
    const {type,movePath} = change.kind;
    if (movePath != null && (type !== 'update' || typeof movePath !== 'string' || !movePath)) throw Error('移动目标无效');
    targets.push({operation: movePath ? 'move-source' : type, path: change.path, ...classifyProjectWrite(change.path, roots)});
    if (movePath) targets.push({operation:'move-destination',path:movePath,...classifyProjectWrite(movePath, roots)});
  }
  return targets;
}

// Fail closed on unknown permission shapes too. A future protocol version
// must not silently introduce another spelling of a reusable write grant.
export function isReadOnlyPermissionRequest(permissions) {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return false;
  if (Object.keys(permissions).some(k => !['fileSystem','network'].includes(k))) return false;
  if (permissions.network != null && (typeof permissions.network !== 'object' || Array.isArray(permissions.network) ||
      Object.keys(permissions.network).some(k => k !== 'enabled') || typeof permissions.network.enabled !== 'boolean')) return false;
  const files = permissions.fileSystem;
  if (files == null) return true;
  if (typeof files !== 'object' || Array.isArray(files) || Object.keys(files).some(k => !['read','write'].includes(k))) return false;
  if (files.write != null && (!Array.isArray(files.write) || files.write.length)) return false;
  return files.read == null || (Array.isArray(files.read) && files.read.every(p => typeof p === 'string' && p.length));
}
