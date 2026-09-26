export type TeamRole = 'owner' | 'operator' | 'viewer';
export type TeamMember = { userId: string; email: string; role: TeamRole; status: 'active' | 'removed'; updatedAt: string };
export type TeamInvitation = { id: string; email: string; role: TeamRole; status: 'pending' | 'accepted' | 'revoked' | 'expired'; expiresAt: string; createdAt: string };
export type TeamSnapshot = { members: TeamMember[]; invitations: TeamInvitation[]; role: TeamRole };
