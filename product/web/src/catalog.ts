// Plain-words labels for the enums in shared/agent-config.ts. Industry-neutral on purpose: a job is a shape of conversation,
// and the examples span insurers, lenders, clinics, retail, schools and more. Never add a label that assumes one sector.
import { CALL_CATEGORIES, JOBS, LANGUAGES, SECTOR_PACKS } from '../../shared/agent-config.ts';
export { CALL_CATEGORIES, JOBS, LANGUAGES, SECTOR_PACKS };

export const JOB_INFO: Record<string, { label: string; blurb: string; who: string }> = {
  renewal_reminder: { label: 'Renewal reminder', blurb: 'Tell people a plan, policy or membership is due and help them renew.', who: 'Insurance, subscriptions, gyms, software' },
  payment_reminder: { label: 'Payment reminder', blurb: 'A calm nudge before or after a due date, with the easiest way to pay.', who: 'Lending, utilities, schools, rent' },
  lead_qualification: { label: 'Lead qualification', blurb: 'Call new enquiries, learn what they need, pass on the ready ones.', who: 'Real estate, education, solar, B2B' },
  appointment_confirmation: { label: 'Appointment confirmation', blurb: 'Confirm, move or cancel a booked slot.', who: 'Clinics, salons, service visits' },
  appointment_booking: { label: 'Appointment booking', blurb: 'Call people and book a slot for them.', who: 'Healthcare, banks, test drives' },
  order_verification: { label: 'Order verification', blurb: 'Confirm an order and address before it ships.', who: 'D2C, cash-on-delivery, marketplaces' },
  delivery_coordination: { label: 'Delivery coordination', blurb: 'Agree a time and place with the recipient.', who: 'Logistics, furniture, appliances' },
  feedback_survey: { label: 'Feedback call', blurb: 'Ask a few questions after a purchase or visit.', who: 'Retail, hospitality, hospitals' },
  onboarding_welcome: { label: 'Welcome call', blurb: 'Welcome a new customer and help them take the first step.', who: 'Fintech, telecom, edtech' },
  win_back: { label: 'Win-back', blurb: 'Reach people who left and learn why, with an honest offer.', who: 'Subscriptions, telecom, insurance' },
  event_invitation: { label: 'Event invitation', blurb: 'Invite people and record who is coming.', who: 'Schools, webinars, exhibitions' },
  document_collection: { label: 'Document collection', blurb: 'Ask for a missing document and say how to send it.', who: 'Lending, admissions, KYC follow-up' },
  service_follow_up: { label: 'Service follow-up', blurb: 'Check that a repair, installation or visit went well.', who: 'Appliances, auto, home services' },
  inbound_support: { label: 'Inbound support', blurb: 'Answer calls people make to you.', who: 'Any business with a helpline' },
  custom: { label: 'Something else', blurb: 'Describe the job in your own words.', who: 'Any' },
};
export const jobLabel = (j: string) => JOB_INFO[j]?.label ?? j.replace(/_/g, ' ');

export const CATEGORY_INFO: Record<string, { label: string; blurb: string }> = {
  service: { label: 'Service', blurb: 'People who already use you, about their own account or order.' },
  transactional: { label: 'Transactional', blurb: 'Orders, appointments and payments they asked for.' },
  promotional: { label: 'Promotional', blurb: 'Offers. Needs a recorded consent for every person.' },
};
export const LANG_LABEL: Record<string, string> = { hinglish: 'Hinglish', 'hi-IN': 'Hindi (हिन्दी)', 'en-IN': 'English (India)', 'ta-IN': 'Tamil (தமிழ்)', 'te-IN': 'Telugu (తెలుగు)', 'kn-IN': 'Kannada (ಕನ್ನಡ)', 'ml-IN': 'Malayalam (മലയാളം)', 'mr-IN': 'Marathi (मराठी)', 'gu-IN': 'Gujarati (ગુજરાતી)', 'bn-IN': 'Bengali (বাংলা)', 'pa-IN': 'Punjabi (ਪੰਜਾਬੀ)', 'or-IN': 'Odia (ଓଡ଼ିଆ)' };
export const SECTOR_LABEL: Record<string, string> = { base: 'Generic business', insurance_irdai: 'Insurance (IRDAI)', lending_rbi: 'Lending (RBI)', securities_sebi: 'Securities (SEBI)', healthcare: 'Healthcare', education: 'Education', ecommerce: 'E-commerce', real_estate: 'Real estate', telecom: 'Telecom', travel: 'Travel' };
export const REGISTER_INFO: Record<string, { label: string; blurb: string }> = {
  warm_peer: { label: 'Friendly professional', blurb: 'Warm and light, like a helpful colleague. The default for service calls.' },
  polite_professional: { label: 'Calm and reassuring', blurb: 'Measured and respectful. Good for dues and sensitive topics.' },
  crisp_efficient: { label: 'Brisk and efficient', blurb: 'Short and to the point. Good for order checks.' },
  gentle_elder_respect: { label: 'Patient and respectful', blurb: 'Slower, more formal. Good for older callers.' },
};
export const HANDOFF_WHEN: Record<string, string> = { asks_for_human: 'Asks for a person', crisis: 'Sounds in crisis', complaint: 'Wants to complain', legal_threat: 'Mentions legal action', out_of_scope: 'Asks something outside the job', payment_dispute: 'Disputes a payment', repeated_misunderstanding: 'She has misunderstood twice' };
export const TOOL_INFO: Record<string, { label: string; risk: string; blurb: string }> = {
  end_call: { label: 'End the call herself', risk: 'external', blurb: 'Hangs up politely once the job is done.' },
  transfer: { label: 'Connect to a person', risk: 'external', blurb: 'Bridges the call to your team, with a one-line summary.' },
  send_whatsapp_link: { label: 'Send a link on WhatsApp', risk: 'external', blurb: 'Sends your approved link to the number she is speaking to.' },
  book_slot: { label: 'Book a slot', risk: 'external', blurb: 'Books a time in your calendar.' },
  mark_callback: { label: 'Note a callback time', risk: 'draft', blurb: 'Writes down when the person asked to be called.' },
  lookup_order: { label: 'Look up an order', risk: 'read', blurb: 'Reads an order from your system.' },
};
export const PURPOSES = ['service', 'offer', 'identity', 'logistics'] as const;
export const PURPOSE_HINT: Record<string, string> = { service: 'About their own account', offer: 'A promotion. Dropped from service calls', identity: 'Who she is and who you are', logistics: 'Addresses, times, steps' };

export function prettyId(id: string | undefined): string {
  if (!id) return '';
  const via = /@or$/.test(id) ? ' via OpenRouter' : '';
  const words = id.replace(/@or$/, '').split('-').map(w => w === 'gpt' || w === 'mai' ? w.toUpperCase() : /^\d+b$/i.test(w) ? w.toUpperCase() : /^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1));
  return words.join(' ').replace('Flash Lite', 'Flash-Lite').replace('MAI Voice', 'MAI-Voice') + via;
}

/** Language codes as the server stores them (hi-en, hi, ta ...) next to the agent-config ones. */
export const LANG_SHORT: Record<string, string> = { 'hi-en': 'Hinglish', hinglish: 'Hinglish', hi: 'Hindi', 'hi-IN': 'Hindi', en: 'English', 'en-IN': 'English', ta: 'Tamil', 'ta-IN': 'Tamil', te: 'Telugu', 'te-IN': 'Telugu', kn: 'Kannada', 'kn-IN': 'Kannada', ml: 'Malayalam', 'ml-IN': 'Malayalam', mr: 'Marathi', 'mr-IN': 'Marathi', gu: 'Gujarati', 'gu-IN': 'Gujarati', bn: 'Bengali', 'bn-IN': 'Bengali', pa: 'Punjabi', 'pa-IN': 'Punjabi', or: 'Odia', 'or-IN': 'Odia' };
export const langShort = (c: string | null | undefined) => (c ? LANG_SHORT[c] ?? c : '—');
