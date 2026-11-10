import { expect, it } from 'vitest';
import { decode, homeFor } from '../../frontend/src/lib/auth';

const token = (claims: object) => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
it('decodes UTF-8 claims without the deprecated escape function', () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = token({ role: 'REPORTER', email: 'ผู้แจ้ง@example.test', departmentId: 'อาคาร 🛠️', exp });
  expect(decode(jwt)).toEqual({ token: jwt, role: 'REPORTER', email: 'ผู้แจ้ง@example.test', departmentId: 'อาคาร 🛠️', exp });
});
it.each([null, '', 'bad-token', 'a.%%%.b', token({ role: 'STAFF', exp: 1 })])('rejects invalid or expired claims: %s', value => {
  expect(decode(value)).toBeNull();
});
it('provides the same home routes for every supported role', () => {
  expect(['ADMIN', 'STAFF', 'REPORTER', 'GUEST', undefined].map(role => homeFor(role as Parameters<typeof homeFor>[0]))).toEqual(['/admin', '/staff', '/my', '/', '/']);
});
