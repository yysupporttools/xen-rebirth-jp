// Public reads expose only published game profiles. Administration verifies
// the live Auth user and the existing board administrator lookup on each call.
const project = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const publishable = 'sb_publishable_yTgQ5bw5pnSkNCTOH4me8Q_YaQhRkQ_';
const allowedOrigin = 'https://yysupporttools.github.io';
const bucket = 'guild-member-photos';
const maxPhoto = 2097152;
const maxBody = 2850000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cors = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Vary': 'Origin',
};
const serviceHeaders = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
class ClientError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ClientError('入力内容を確認してください');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, required = false): string {
  if (typeof value !== 'string') throw new ClientError('文字列の入力を確認してください');
  const result = value.trim();
  if ([...result].length > max || (required && !result)) throw new ClientError('文字数を確認してください');
  return result;
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new ClientError('公開設定を確認してください');
  return value;
}
function integer(value: unknown, min: number, max: number, nullable = false): number | null {
  if (nullable && (value === null || value === '')) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new ClientError('数値の入力を確認してください');
  return value;
}
function imageUrl(value: unknown): string {
  const raw = text(value, 1000);
  if (!raw) return '';
  let url: URL;
  try { url = new URL(raw); } catch { throw new ClientError('画像URLを確認してください'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password ||
      /[\s\u0000-\u001f]/.test(raw) || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') ||
      host.startsWith('[') || /^(?:0|10|127)\./.test(host) || /^169\.254\./.test(host) ||
      /^192\.168\./.test(host) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) {
    throw new ClientError('公開された https:// の画像URLを入力してください');
  }
  url.hash = '';
  return url.href;
}
async function admin(req: Request): Promise<string> {
  const bearer = req.headers.get('Authorization') || '';
  if (!/^Bearer [\w.-]+$/.test(bearer)) throw new ClientError('管理者ログインが必要です', 403);
  const headers = { apikey: publishable, Authorization: bearer };
  const auth = await fetch(`${project}/auth/v1/user`, { headers });
  if (!auth.ok) throw new ClientError('ログインを確認できません。再度ログインしてください', 403);
  const user = await auth.json();
  if (typeof user.id !== 'string' || !uuid.test(user.id)) throw new ClientError('ログインを確認できません', 403);
  const check = await fetch(`${project}/rest/v1/rpc/board_is_admin`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}',
  });
  if (!check.ok || await check.json() !== true) throw new ClientError('このアカウントには管理者権限がありません', 403);
  return user.id;
}
async function rpc(name: string, args: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${project}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: serviceHeaders, body: JSON.stringify(args),
  });
  const data = await response.json();
  if (!response.ok) {
    if (data.code === 'P0001') throw new ClientError(data.message || '入力内容を確認してください');
    throw new Error('ギルド情報を保存できませんでした');
  }
  return data;
}
async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ClientError('入力形式を確認してください');
  if (Number(req.headers.get('content-length') || 0) > maxBody) throw new ClientError('画像は2MB以内で選んでください', 413);
  if (!req.body) throw new ClientError('入力内容を確認してください');
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBody) { await reader.cancel(); throw new ClientError('画像は2MB以内で選んでください', 413); }
    parts.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  try { return object(JSON.parse(new TextDecoder().decode(bytes))); }
  catch { throw new ClientError('入力内容を読み取れません'); }
}
const tag = (bytes: Uint8Array, start: number, count: number) => String.fromCharCode(...bytes.subarray(start, start + count));
function dimensions(width: number, height: number) {
  if (width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 16777216) {
    throw new ClientError('画像は縦横4096px以内で選んでください');
  }
}
function validateImage(bytes: Uint8Array, type: string) {
  if (bytes.length < 20 || bytes.length > maxPhoto) throw new ClientError('画像は2MB以内で選んでください');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'image/png') {
    if (bytes.length < 45 || tag(bytes, 0, 8) !== '\x89PNG\r\n\x1a\n' || view.getUint32(8) !== 13 || tag(bytes, 12, 4) !== 'IHDR') {
      throw new ClientError('PNG画像の形式を確認してください');
    }
    dimensions(view.getUint32(16), view.getUint32(20));
    let pos = 8, imageData = false, end = false;
    while (pos + 12 <= bytes.length) {
      const len = view.getUint32(pos), chunk = tag(bytes, pos + 4, 4);
      if (pos + len + 12 > bytes.length) throw new ClientError('PNG画像が壊れています');
      if (chunk === 'IDAT' && len > 0) imageData = true;
      pos += len + 12;
      if (chunk === 'IEND') { end = len === 0 && pos === bytes.length; break; }
    }
    if (!imageData || !end) throw new ClientError('PNG画像が壊れています');
  } else if (type === 'image/jpeg') {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new ClientError('JPEG画像の形式を確認してください');
    let pos = 2, frame = false, scan = false;
    const frames = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf];
    while (pos + 4 < bytes.length) {
      if (bytes[pos++] !== 0xff) throw new ClientError('JPEG画像が壊れています');
      while (bytes[pos] === 0xff) pos++;
      const marker = bytes[pos++];
      if (marker === 0xda) { scan = true; break; }
      if (marker >= 0xd0 && marker <= 0xd7) continue;
      const len = view.getUint16(pos);
      if (len < 2 || pos + len > bytes.length) throw new ClientError('JPEG画像が壊れています');
      if (frames.includes(marker)) {
        if (len < 8) throw new ClientError('JPEG画像が壊れています');
        dimensions(view.getUint16(pos + 5), view.getUint16(pos + 3)); frame = true;
      }
      pos += len;
    }
    if (!frame || !scan) throw new ClientError('JPEG画像が壊れています');
  } else if (type === 'image/webp') {
    if (tag(bytes, 0, 4) !== 'RIFF' || tag(bytes, 8, 4) !== 'WEBP' || view.getUint32(4, true) + 8 !== bytes.length) throw new ClientError('WebP画像の形式を確認してください');
    let pos = 12, imageData = false;
    while (pos + 8 <= bytes.length) {
      const chunk = tag(bytes, pos, 4), len = view.getUint32(pos + 4, true), start = pos + 8;
      if (len < 1 || start + len > bytes.length) throw new ClientError('WebP画像が壊れています');
      if (chunk === 'VP8X' && len >= 10) {
        const read24 = (i: number) => bytes[i] | bytes[i + 1] << 8 | bytes[i + 2] << 16;
        dimensions(read24(start + 4) + 1, read24(start + 7) + 1);
      } else if (chunk === 'VP8 ' && len >= 10 && tag(bytes, start + 3, 3) === '\x9d\x01\x2a') {
        dimensions(view.getUint16(start + 6, true) & 0x3fff, view.getUint16(start + 8, true) & 0x3fff); imageData = true;
      } else if (chunk === 'VP8L' && len >= 5 && bytes[start] === 0x2f) {
        const bits = view.getUint32(start + 1, true);
        dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1); imageData = true;
      }
      pos = start + len + (len % 2);
    }
    if (!imageData || pos !== bytes.length) throw new ClientError('WebP画像が壊れています');
  } else throw new ClientError('画像はPNG / JPEG / WebPで選んでください');
}
async function upload(value: unknown, memberId: string): Promise<{ path: string; url: string }> {
  const photo = object(value);
  const type = photo.type;
  if (typeof type !== 'string' || !['image/png', 'image/jpeg', 'image/webp'].includes(type) ||
      typeof photo.data !== 'string' || photo.data.length > 2796204 || !/^[A-Za-z0-9+/]*={0,2}$/.test(photo.data)) {
    throw new ClientError('画像はPNG / JPEG / WebP、2MB以内で選んでください');
  }
  let binary: string;
  try { binary = atob(photo.data); } catch { throw new ClientError('画像データを読み取れません'); }
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  validateImage(bytes, type);
  const extension = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : 'webp';
  const path = `${memberId}/${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`${project}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': type }, body: bytes,
  });
  if (!response.ok) throw new Error('画像を保存できませんでした');
  return { path, url: `${project}/storage/v1/object/public/${bucket}/${path}` };
}
async function removePhoto(path: string) {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(path)) return;
  try {
    await fetch(`${project}/storage/v1/object/${bucket}`, { method: 'DELETE', headers: serviceHeaders, body: JSON.stringify({ prefixes: [path] }) });
  } catch { /* A failed cleanup does not invalidate an already saved profile. */ }
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  if (origin && origin !== allowedOrigin) return reply({ error: 'このサイトからご利用ください' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.headers.get('apikey') !== publishable) return reply({ error: '接続キーを確認してください' }, 401);
  try {
    if (req.method === 'GET') {
      const params = new URL(req.url).searchParams;
      const isAdmin = params.get('action') === 'admin';
      if (params.has('action') && !isAdmin) throw new ClientError('操作を確認してください');
      if (isAdmin) await admin(req);
      return reply(await rpc('guild_showcase_read', { p_admin: isAdmin }));
    }
    if (req.method !== 'POST') return reply({ error: '操作を確認してください' }, 405);
    const actor = await admin(req);
    const data = await readJson(req);
    const action = data.action;
    let payload: Record<string, unknown>;
    if (action === 'save_guild') {
      const guild = object(data.guild);
      payload = {};
      if ('name' in guild) payload.name = text(guild.name, 80);
      if ('intro' in guild) payload.intro = text(guild.intro, 2000);
      if ('guild_level' in guild) payload.guild_level = integer(guild.guild_level, 1, 99, true);
      if ('member_count' in guild) payload.member_count = integer(guild.member_count, 0, 9999, true);
      if ('is_published' in guild) payload.is_published = boolean(guild.is_published);
      if ('slide_seconds' in guild) payload.slide_seconds = integer(guild.slide_seconds, 5, 30);
      if (payload.is_published && (!payload.name || !payload.intro)) throw new ClientError('公開するギルド名と紹介文を入力してください');
    } else if (action === 'save_member') {
      const member = object(data.member);
      const id = member.id === undefined ? crypto.randomUUID() : text(member.id, 36, true);
      if (!uuid.test(id)) throw new ClientError('メンバーIDを確認してください');
      payload = { id };
      if ('name' in member) payload.name = text(member.name, 80, true);
      if ('role' in member) payload.role = text(member.role, 80);
      if ('intro' in member) payload.intro = text(member.intro, 1200);
      if ('image_url' in member) payload.image_url = imageUrl(member.image_url);
      if ('is_published' in member) payload.is_published = boolean(member.is_published);
      let uploaded: { path: string; url: string } | null = null;
      try {
        if (data.photo) {
          // Check the member count before uploading. The DB checks again
          // atomically; a race/failed mutation cleans up this new object.
          const current = await rpc('guild_showcase_read', { p_admin: true });
          const members = current.members as { id: string }[];
          if (!members.some(m => m.id === id) && members.length >= 100) throw new ClientError('紹介できるメンバーは100人までです');
          uploaded = await upload(data.photo, id);
          payload.image_url = uploaded.url; payload.photo_path = uploaded.path;
        }
        const result = await rpc('guild_showcase_mutate', { p_action: action, p_payload: payload, p_actor: actor });
        if (typeof result.old_photo_path === 'string' && result.old_photo_path) await removePhoto(result.old_photo_path);
        return reply({ ok: true, id: result.id });
      } catch (error) {
        if (uploaded) await removePhoto(uploaded.path);
        throw error;
      }
    } else if (action === 'delete_member') {
      const id = text(data.id, 36, true);
      if (!uuid.test(id)) throw new ClientError('メンバーIDを確認してください');
      payload = { id };
    } else if (action === 'reorder') {
      if (!Array.isArray(data.ids) || data.ids.length > 100 || data.ids.some(id => typeof id !== 'string' || !uuid.test(id)) || new Set(data.ids).size !== data.ids.length) {
        throw new ClientError('並び順を確認してください');
      }
      payload = { ids: data.ids };
    } else throw new ClientError('操作を確認してください');
    await rpc('guild_showcase_mutate', { p_action: action, p_payload: payload, p_actor: actor });
    return reply({ ok: true });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : '操作に失敗しました' }, error instanceof ClientError ? error.status : 500);
  }
});
