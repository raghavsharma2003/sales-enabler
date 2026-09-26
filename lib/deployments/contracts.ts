import type { AgentConfig } from '../platform/agents';
import type { PlatformRecord } from '../platform/records';
import type { AuthUser } from '../server/auth';
import type { Database } from '../server/db';

export type DeploymentChannel = 'web_voice' | 'web_chat' | 'telegram' | 'whatsapp';
export type DeploymentLimits = { enabled: boolean; maxSessionsPerDay: number; maxTurnsPerConversation: number; maxConcurrentSessions: number; maxSessionSeconds: number; maxSessionsPerIpHour: number };
export type DeploymentConnection = { connectionId: string; integrationId: 'telegram' | 'whatsapp_cloud'; authorizationVersion: string; identity: string };
export type DeploymentBrand = {
  name: string;
  welcomeMessage: string;
  accent?: string;
  onAccent?: '#ffffff' | '#242634';
  logoDataUri?: string;
};
export type Deployment = {
  publicId: string; name: string; agentId: string; versionId: string; releaseId: string;
  channel: DeploymentChannel; ownerUserId: string; ownerAuthorizationVersion: string; publicKnowledgeIds: string[];
  brand: DeploymentBrand; allowedOrigins: string[];
  limits: DeploymentLimits; connection?: DeploymentConnection;
  allowUnknownInbound: boolean; autoLearning: boolean; publishedAt?: string; publicationAcknowledgement?: string;
};
export type DeploymentStatement = Parameters<Database['batch']>[0][number];
export type DeploymentAuthority = {
  user: AuthUser; deployment: PlatformRecord<Deployment>; config: AgentConfig;
  context: string; fences: DeploymentStatement[];
};
export type PublicDeploymentView = { publicId: string; channel: DeploymentChannel; brand: Deployment['brand']; disclosure: string; available: boolean; maxSessionSeconds: number; maxTurnsPerConversation: number };
export const PUBLICATION_ACKNOWLEDGEMENT = 'only selected approved company sources are public';
export const DEFAULT_DEPLOYMENT_LIMITS: DeploymentLimits = { enabled: false, maxSessionsPerDay: 25, maxTurnsPerConversation: 12, maxConcurrentSessions: 3, maxSessionSeconds: 300, maxSessionsPerIpHour: 3 };
