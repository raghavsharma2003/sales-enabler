export const COMPANY_PROFILE_KIND = 'platform:company_profile';

export type CompanyProfileValues = {
  name: string;
  publicDisplayName: string;
  website: string;
  description: string;
  industry: string;
  country: string;
  timezone: string;
  languages: string[];
  brandAccent: string;
  logoDataUri?: string;
};

export type CompanyProfileRecord = CompanyProfileValues & {
  id: string;
  revision: number;
  status: 'active';
  createdAt?: string;
  updatedAt?: string;
};

export type CompanyBrandCopy = {
  name: string;
  accent: string;
  onAccent: '#ffffff' | '#242634';
  fallbackAccent: '#5148ce';
  logoDataUri?: string;
  verification: 'workspace_profile_unverified';
};

export type CompanyReadinessItem = {
  id: 'identity' | 'connections' | 'offering' | 'release' | 'deployment';
  label: string;
  state: 'ready' | 'missing' | 'attention';
  detail: string;
  count: number;
  target: 'Company' | 'Integrations' | 'Company brain' | 'Releases' | 'Deployments';
  actionLabel: string;
};

export type CompanySettingsSnapshot = {
  profile: CompanyProfileRecord;
  role: 'owner' | 'operator' | 'viewer';
  editable: boolean;
  publicBrand: CompanyBrandCopy;
  readiness: CompanyReadinessItem[];
};

export const COMPANY_CREATION_DEFAULTS = {
  country: 'India',
  timezone: 'Asia/Kolkata',
  languages: ['English', 'Hindi'],
  brandAccent: '#5148ce',
} as const;

export function accentForeground(accent: string): '#ffffff' | '#242634' {
  const match = /^#([0-9a-f]{6})$/i.exec(accent);
  if (!match) return '#ffffff';
  const values = [0, 2, 4].map(index => parseInt(match[1].slice(index, index + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  const luminance = .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
  const whiteContrast = 1.05 / (luminance + .05);
  const inkContrast = (luminance + .05) / .068;
  return whiteContrast >= inkContrast ? '#ffffff' : '#242634';
}

export function exportPublicBrand(profile: CompanyProfileValues): CompanyBrandCopy {
  const accent = /^#[0-9a-f]{6}$/i.test(profile.brandAccent) ? profile.brandAccent.toLowerCase() : COMPANY_CREATION_DEFAULTS.brandAccent;
  return {
    name: profile.publicDisplayName || profile.name,
    accent,
    onAccent: accentForeground(accent),
    fallbackAccent: COMPANY_CREATION_DEFAULTS.brandAccent,
    ...(profile.logoDataUri ? { logoDataUri: profile.logoDataUri } : {}),
    verification: 'workspace_profile_unverified',
  };
}
