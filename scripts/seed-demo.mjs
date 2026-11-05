// Idempotent demo bootstrap through public APIs; does not read service databases.
const base = process.env.API_URL ?? 'http://localhost:3100';
const password = process.env.DEMO_PASSWORD ?? 'FondueDemo!2026';
async function request(path, method = 'GET', body, token) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok && res.status !== 409) throw Error(`${path}: ${JSON.stringify(data)}`);
  return data;
}
const admin = await request('/auth/login', 'POST', { email: process.env.ADMIN_EMAIL ?? 'admin@fondue.test', password: process.env.ADMIN_PASSWORD ?? password });
const token = admin.accessToken;
let departments = await request('/departments', 'GET', undefined, token);
for (const department of [
  { name: 'งานอาคารและสถานที่', contactEmail: 'facilities@fondue.test', buildings: ['อาคารวิศวกรรมศาสตร์ 1', 'อาคารวิศวกรรมศาสตร์ 2', 'หอสมุดกลาง'] },
  { name: 'ฝ่ายเทคโนโลยีสารสนเทศ', contactEmail: 'it@fondue.test', buildings: ['อาคารจามจุรี 4', 'อาคารจามจุรี 9'] },
]) {
  if (!departments.some(d => d.name === department.name)) await request('/departments', 'POST', department, token);
}
departments = await request('/departments', 'GET', undefined, token);
await request('/auth/register', 'POST', { email: 'reporter@fondue.test', password });
await request('/auth/users', 'POST', { email: 'staff@fondue.test', password, role: 'STAFF', departmentId: departments.find(d => d.name === 'งานอาคารและสถานที่').id }, token);
console.log('Demo accounts ready: admin@fondue.test / reporter@fondue.test / staff@fondue.test');
console.log('Default demo password: FondueDemo!2026 (or your DEMO_PASSWORD override).');
