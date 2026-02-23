/**
 * Permission Type Definitions
 * Defines permission levels and checking interfaces
 */

export enum PermissionLevel {
  NONE = 'none',
  VIEW = 'view',
  EDIT = 'edit',
  MANAGE = 'manage',
}

export interface PermissionCheck {
  canView: boolean;
  canEdit: boolean;
  canManageCompanions: boolean;
}

export interface PermissionContext {
  companionId: string;
  entityType: 'trip' | 'item';
  entityId?: string;
  userId: string;
}

export interface PermissionResult {
  allowed: boolean;
  level: PermissionLevel;
  reason?: string;
}
