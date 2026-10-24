// A local fake of the HubSpot and Zoho CRM endpoints intake reads (shapes from research/2026-10-24/crm-import/README.md),
// for the browser flow and screenshots. Synthetic people only; it logs every request so a test can prove nothing was written.
// The server reaches it through VP_CRM_FAKE_URL (never honoured in production).
import { createServer } from 'node:http';

export const HS_TOKEN = 'hs-e2e-synthetic-token';
export const ZO = { client_id: 'zo-e2e-client', client_secret: 'zo-e2e-secret', refresh_token: 'zo-e2e-refresh' };

export function startFakeCrm(port) {
  const log = [];
  const state = { down: false };
  const contacts = {
    '601': { updatedAt: '2026-10-20T10:00:00.000Z', p: { firstname: 'Kavita', lastname: 'Nair', mobilephone: '+91 90000 50101', phone: '', email: null, hs_language: 'hi' } },
    '602': { updatedAt: '2026-10-20T10:00:00.000Z', p: { firstname: 'Arjun', lastname: 'Malhotra', mobilephone: '', phone: '09000050102', email: null, hs_language: 'en' } },
    '603': { updatedAt: '2026-10-20T10:00:00.000Z', p: { firstname: 'Meera', lastname: 'Iyer', mobilephone: '९०००० ५०१०३', phone: '', email: null, hs_language: null } },
    '604': { updatedAt: '2026-10-20T10:00:00.000Z', p: { firstname: 'No', lastname: 'Number', mobilephone: '', phone: '', email: null, hs_language: null } },
  };
  const send = (res, status, json) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(json === undefined ? '' : JSON.stringify(json)); };
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      const u = new URL(req.url ?? '/', 'http://x');
      const body = raw ? JSON.parse(raw) : null;
      const auth = String(req.headers.authorization ?? '');
      log.push({ method: req.method, path: u.pathname });
      if (state.down) return send(res, 503, { message: 'service unavailable' });
      if (u.pathname.startsWith('/crm/v3/')) {
        if (auth !== `Bearer ${HS_TOKEN}`) return send(res, 401, { message: 'Authentication credentials not found.' });
        if (req.method === 'POST' && u.pathname === '/crm/v3/lists/search')
          return send(res, 200, { lists: [{ listId: '101', name: 'Renewals November', objectTypeId: '0-1', processingType: 'MANUAL', additionalProperties: { hs_list_size: '4' } }], hasMore: false, offset: 1, total: 1 });
        if (req.method === 'GET' && /^\/crm\/v3\/lists\/101\/memberships\/join-order$/.test(u.pathname))
          return send(res, 200, { results: Object.keys(contacts).map(recordId => ({ recordId, membershipTimestamp: '2026-10-01T00:00:00Z' })), total: 4 });
        if (req.method === 'POST' && u.pathname === '/crm/v3/objects/contacts/batch/read')
          return send(res, 200, { status: 'COMPLETE', startedAt: '2026-10-24T00:00:00Z', completedAt: '2026-10-24T00:00:01Z',
            results: body.inputs.filter(x => contacts[x.id]).map(x => ({ id: x.id, archived: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: contacts[x.id].updatedAt,
              properties: Object.fromEntries(body.properties.map(k => [k, contacts[x.id].p[k] ?? (k === 'lastmodifieddate' ? contacts[x.id].updatedAt : null)])) })) });
        return send(res, 404, { message: 'not found' });
      }
      if (u.pathname === '/oauth/v2/token') return send(res, 200, u.searchParams.get('refresh_token') === ZO.refresh_token ? { access_token: 'zo-e2e-access', api_domain: `http://127.0.0.1:${port}`, token_type: 'Bearer', expires_in: 3600 } : { error: 'invalid_code' });
      if (u.pathname === '/crm/v8/settings/custom_views') return send(res, 200, { custom_views: [{ id: '9001', display_value: 'Hot leads', name: 'Hot leads' }], info: { more_records: false } });
      if (u.pathname === '/crm/v8/Contacts') return send(res, 200, { data: [{ id: '7000101', First_Name: 'Sunita', Last_Name: 'Verma', Mobile: '9000050201', Modified_Time: '2026-10-21T09:00:00+05:30' }], info: { more_records: false } });
      send(res, 404, {});
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ server, log, state, contacts,
    /** Calls that would change something in the CRM. Reads (GET, HubSpot's search and batch read, Zoho's token) are not writes. */
    writes: () => log.filter(h => !(h.method === 'GET' || (h.method === 'POST' && ['/crm/v3/lists/search', '/crm/v3/objects/contacts/batch/read', '/oauth/v2/token'].includes(h.path)))) })));
}
