// Use-case sample packs: synthetic contact lists, one per starter agent, so a workspace can try the whole import (preview,
// verdicts, receipt) and a campaign with data shaped like its own. Every person is made up. Numbers are 9000000000-
// 9000000099 only (each pack has its own twelve), names come from across India, and each pack has the per-contact facts
// its agent says, a duplicate, an opt-out or two, a missing consent and mixed languages. Nothing here is real data.

export interface SamplePack { id: string; label: string; templateId: string; about: string; headers: string[]; rows: string[][]; testFacts: string[] }

// Made-up people across regions, with the language they would most likely want.
const PEOPLE: [string, string, string][] = [
  ['Aarti Sharma', 'Hindi', 'Lucknow'], ['Harpreet Kaur', 'Hinglish', 'Ludhiana'], ['Sneha Patil', 'Marathi', 'Pune'], ['Karthik Subramanian', 'Tamil', 'Chennai'],
  ['Ananya Sen', 'Bengali', 'Kolkata'], ['Imran Sheikh', 'Hinglish', 'Hyderabad'], ['Hetal Shah', 'Gujarati', 'Ahmedabad'], ['Anjali Nair', 'English', 'Kochi'],
  ['Srinivas Reddy', 'Telugu', 'Vijayawada'], ['Kavya Gowda', 'Kannada', 'Mysuru'], ['Bikash Das', 'Hindi', 'Bhubaneswar'], ['Priyanka Bora', 'English', 'Guwahati'],
  ['Rajesh Verma', 'Hindi', 'Jaipur'], ['Ayesha Khan', 'Hinglish', 'Bhopal'], ['Joseph Thomas', 'English', 'Thiruvananthapuram'], ['Gurdeep Singh', 'Hinglish', 'Amritsar'],
  ['Divya Ramesh', 'Tamil', 'Coimbatore'], ['Amol Deshmukh', 'Marathi', 'Nagpur'], ['Sourav Chatterjee', 'Bengali', 'Durgapur'], ['Neha Chauhan', 'Hindi', 'Dehradun'],
  ['Lakshmi Prasanna', 'Telugu', 'Warangal'], ['Jignesh Patel', 'Gujarati', 'Surat'], ['Sandeep Yadav', 'Hindi', 'Patna'], ['Meenakshi Iyer', 'English', 'Bengaluru'],
];

const inr = (n: number) => '₹' + n.toLocaleString('en-IN');
/** dd/mm/yyyy, `days` from `from` (the packs stay current: due dates are always ahead of the day they are loaded). */
const day = (from: Date, days: number) => { const d = new Date(from.getTime() + days * 86_400_000); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };
/** The same number written the ways real files write it. */
function phone(n: number, style: number): string {
  const d = String(9_000_000_000 + n);
  return [`+91 ${d.slice(0, 5)} ${d.slice(5)}`, `0${d}`, `${d.slice(0, 5)}-${d.slice(5)}`, d, `91${d}`][style % 5];
}

interface Spec { id: string; label: string; templateId: string; about: string; facts: string[]; fact: (i: number, from: Date) => string[] }
const SPECS: Spec[] = [
  { id: 'insurance-renewal', label: 'Health insurance renewals', templateId: 'insurance-renewal', about: 'Policyholders whose renewal is due in the next three weeks, with the new premium.',
    facts: ['Policy number', 'Renewal due', 'Premium'], fact: (i, f) => [`SH-${2026}-${String(40110 + i * 7)}`, day(f, 5 + i), inr(14_250 + i * 1_375)] },
  { id: 'emi-reminder', label: 'Loan EMI reminders', templateId: 'lending-emi-reminder', about: 'Borrowers with an EMI due this week, the loan and the amount.',
    facts: ['Loan', 'EMI amount', 'EMI due'], fact: (i, f) => [`Two-wheeler loan ending ${String(3301 + i * 13).slice(-4)}`, inr(3_480 + i * 215), day(f, 2 + (i % 5))] },
  { id: 'cod-confirmation', label: 'COD order confirmations', templateId: 'd2c-cod-verification', about: 'Cash-on-delivery orders placed today, to confirm before they ship.',
    facts: ['Order', 'Address'], fact: i => [`Order #A${1043 + i}, ${['2 kurtas', 'a pressure cooker', 'running shoes', 'a bedsheet set', 'a phone cover'][i % 5]}, ${inr(690 + i * 140)} cash on delivery`,
      `${12 + i} ${['MG Road', 'Station Road', 'Gandhi Nagar', 'Civil Lines', 'Park Street'][i % 5]}, PIN ${String(110_001 + i * 37)}`] },
  { id: 'admissions-followup', label: 'Admissions enquiry follow-ups', templateId: 'education-admissions-followup', about: 'Students who enquired about a course in the last week.',
    facts: ['Enquiry'], fact: (i, f) => [`${['MBA weekend batch', 'B.Tech computer science', 'MSc data science', 'study in Germany guidance', 'BBA'][i % 5]}, enquired ${day(f, -1 - (i % 6))}`] },
  { id: 'appointment-reminder', label: 'Clinic appointment reminders', templateId: 'clinic-appointment-confirm', about: 'Patients with an appointment in the next few days.',
    facts: ['Appointment'], fact: (i, f) => [`${['Dr Mehta, general physician', 'Dr Rao, dermatology', 'Dr Kulkarni, paediatrics', 'Dr Fernandes, ENT'][i % 4]}, ${day(f, 1 + (i % 4))} at ${9 + (i % 8)}:${i % 2 ? '30' : '00'}`] },
  { id: 'lead-qualification', label: 'Rooftop solar leads', templateId: 'solar-lead-qualification', about: 'People who asked about rooftop solar on the website this week.',
    facts: ['Enquiry'], fact: (i, f) => [`${['3 kW', '5 kW', 'not sure of size', '2 kW'][i % 4]} for an ${['independent house', 'apartment terrace', 'shop roof'][i % 3]}, asked ${day(f, -1 - (i % 5))}; monthly bill about ${inr(1_800 + i * 250)}`] },
  { id: 'service-feedback', label: 'Service feedback calls', templateId: 'appliance-service-followup', about: 'Customers whose AC was serviced in the last few days.',
    facts: ['Job'], fact: (i, f) => [`${['AC gas refill', 'AC deep cleaning', 'AC installation', 'AC repair, PCB replaced'][i % 4]} on ${day(f, -2 - (i % 4))}, technician ${['Ravi', 'Salim', 'Prakash', 'Deepak'][i % 4]}`] },
];

export const SAMPLE_ROWS = 12;           // 11 people, plus one row repeating an earlier number (a duplicate in the file)

/** The packs, built for `today`. Pack k uses numbers 90000000(12k)…(12k+10); its last row repeats its third number. */
export function samplePacks(today = new Date()): SamplePack[] {
  return SPECS.map((s, k) => {
    const headers = ['Name', 'Mobile', 'Language', 'City', ...s.facts, 'Call consent', 'Do not call'];
    const rows: string[][] = [];
    for (let i = 0; i < SAMPLE_ROWS - 1; i++) {
      const [name, lang, city] = PEOPLE[(k * 5 + i) % PEOPLE.length];
      // Consent: most said yes; one row has none recorded (unknown); one or two asked not to be called.
      const optedOut = i === 4 || (k % 2 === 0 && i === 9);
      rows.push([name, phone(k * 12 + i, i + k), lang, city, ...s.fact(i, today), i === 6 ? '' : optedOut ? 'no' : 'yes', optedOut ? 'yes' : '']);
    }
    // The duplicate: the third person again, the number written another way, a fresher detail.
    const dup = [...rows[2]]; dup[1] = phone(k * 12 + 2, 3 + k + 1); rows.push(dup);
    // The member's own test row gets its own record ids (a policy, loan or order no person in the pack has), so a payment or
    // a lookup for a pack person never also matches the member.
    return { id: s.id, label: s.label, templateId: s.templateId, about: s.about, headers, rows, testFacts: s.fact(SAMPLE_ROWS + 19, today) };
  });
}

/** One row for the member's own verified phone, with facts of its own (shaped like the pack's) so the call has something to say. */
export function testRow(pack: SamplePack, name: string, e164: string): string[] {
  const r = [...pack.rows[0]];
  r[0] = name; r[1] = e164; r[pack.headers.indexOf('Call consent')] = 'yes'; r[pack.headers.indexOf('Do not call')] = '';
  pack.testFacts.forEach((v, k) => { r[4 + k] = v; });          // after Name, Mobile, Language, City
  return r;
}

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const packCsv = (headers: string[], rows: string[][]) => [headers, ...rows].map(r => r.map(cell).join(',')).join('\n') + '\n';
