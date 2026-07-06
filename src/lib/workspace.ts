import { cookies } from 'next/headers';

export const WORKSPACE_COOKIE_NAME = 'demo_invoices_workspace';
export const LEGACY_WORKSPACE_KEY = 'legacy-global';

export async function getCurrentWorkspaceKey(): Promise<string> {
  try {
    const cookieStore = await cookies();
    const workspaceKey = normalizeWorkspaceKey(cookieStore.get(WORKSPACE_COOKIE_NAME)?.value || '');
    return workspaceKey || LEGACY_WORKSPACE_KEY;
  } catch {
    return LEGACY_WORKSPACE_KEY;
  }
}

export function normalizeWorkspaceKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

export function scopeSettingKey(workspaceKey: string, settingKey: string): string {
  const normalizedWorkspaceKey = normalizeWorkspaceKey(workspaceKey) || LEGACY_WORKSPACE_KEY;
  const normalizedSettingKey = String(settingKey || '').trim() || 'default';
  return `${normalizedWorkspaceKey}::${normalizedSettingKey}`;
}

export function scopeSettingPrefix(workspaceKey: string): string {
  const normalizedWorkspaceKey = normalizeWorkspaceKey(workspaceKey) || LEGACY_WORKSPACE_KEY;
  return `${normalizedWorkspaceKey}::`;
}

export function scopeEntityId(workspaceKey: string, entityId: string): string {
  const normalizedWorkspaceKey = normalizeWorkspaceKey(workspaceKey) || LEGACY_WORKSPACE_KEY;
  const normalizedEntityId = String(entityId || '').trim();
  if (!normalizedEntityId) {
    return normalizedWorkspaceKey;
  }
  return `${normalizedWorkspaceKey}__${normalizedEntityId}`;
}
