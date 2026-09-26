import { AccountSecurity } from '@/components/account-access';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Account security · Company workspace', referrer: 'no-referrer', robots: { index: false, follow: false } };
export default function Page() { return <main className="account-page"><div className="account-panel"><a className="account-home" href="/">Return to workspace</a><AccountSecurity /></div></main>; }

