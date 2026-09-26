import { AccountAccess } from '@/components/account-access';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Account reset · Company workspace', referrer: 'no-referrer', robots: { index: false, follow: false } };
export default function Page() { return <AccountAccess mode="reset" />; }

