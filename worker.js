const WORKSHOPS = ["炼钢维修车间", "精炼连铸维修车间", "轧钢维修车间", "行车车间"];
const LONG_TRAINING_HOURS = 12;
const SESSION_HOURS = 12;

const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const failure = (message, status = 400) => json({ error: message }, status);
const all = async (db, sql, ...params) => (await db.prepare(sql).bind(...params).all()).results;
const one = (db, sql, ...params) => db.prepare(sql).bind(...params).first();
const run = (db, sql, ...params) => db.prepare(sql).bind(...params).run();
const now = () => new Date();
const iso = (date = now()) => date.toISOString();

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function auth(request, env, role) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] || new URL(request.url).searchParams.get("token");
  if (!token) return null;
  const session = await one(env.DB, "SELECT * FROM auth_sessions WHERE token = ? AND expires_at > ?", token, iso());
  return session && (!role || session.role === role) ? session : null;
}

function duration(session, current = now()) { return Math.max(0, (new Date(session.ended_at || current) - new Date(session.started_at)) / 60000); }
function anomalies(session, current = now()) {
  if (session.status === "voided") return [];
  const minutes = duration(session, current);
  if (session.status === "training") return minutes > LONG_TRAINING_HOURS * 60 ? ["未结束", `超过${LONG_TRAINING_HOURS}小时`] : [];
  if (session.status !== "completed") return [];
  const result = [];
  if (session.review_status === "pending" && minutes > LONG_TRAINING_HOURS * 60) result.push(`超过${LONG_TRAINING_HOURS}小时`);
  if (minutes < 2) result.push("少于2分钟");
  return result;
}
function minutesInRange(session, from, to, current) {
  return Math.max(0, Math.round((Math.min(new Date(session.ended_at || current), to) - Math.max(new Date(session.started_at), from)) / 60000));
}
function sessionView(session) {
  if (!session) return null;
  return { id: session.id, memberId: session.member_id, start: session.started_at, end: session.ended_at, startPhoto: `/api/photos/${encodeURIComponent(session.start_photo_path)}`, endPhoto: session.end_photo_path ? `/api/photos/${encodeURIComponent(session.end_photo_path)}` : null, status: session.status, reviewStatus: session.review_status };
}

async function dashboard(env, memberId) {
  const member = await one(env.DB, "SELECT id, name, workshop FROM members WHERE id = ? AND active = 1", memberId);
  if (!member) return null;
  const current = now();
  const active = await one(env.DB, "SELECT * FROM sessions WHERE member_id = ? AND status = 'training' LIMIT 1", memberId);
  const completed = await all(env.DB, "SELECT * FROM sessions WHERE member_id = ? AND status = 'completed' AND review_status = 'approved' ORDER BY started_at DESC", memberId);
  const counted = active && !anomalies(active, current).length ? [...completed, active] : completed;
  const day = new Date(current); day.setHours(0, 0, 0, 0);
  const tomorrow = new Date(day); tomorrow.setDate(day.getDate() + 1);
  const monday = new Date(day); monday.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  const nextMonday = new Date(monday); nextMonday.setDate(monday.getDate() + 7);
  const month = new Date(current.getFullYear(), current.getMonth(), 1);
  const nextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  const total = (from, to) => counted.reduce((sum, item) => sum + minutesInRange(item, from, to, current), 0);
  return { now: iso(current), member, active: sessionView(active), records: completed.map(sessionView), statistics: { todayMinutes: total(day, tomorrow), weekMinutes: total(monday, nextMonday), monthMinutes: total(month, nextMonth), monthCount: completed.filter((item) => new Date(item.started_at) < nextMonth && new Date(item.ended_at) > month).length, goalMinutes: 960 } };
}

async function decodePhoto(dataUrl) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!match) throw new Error("照片格式无效，请使用相机重新拍摄。");
  const binary = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  if (!binary.length || binary.length > 1500 * 1024) throw new Error("照片压缩后需小于 1.5MB，请重新拍摄。");
  return { body: binary, type: match[1] === "jpeg" ? "image/jpeg" : `image/${match[1]}`, extension: match[1] === "jpeg" ? "jpg" : match[1] };
}
async function putPhoto(env, dataUrl, kind) {
  const photo = await decodePhoto(dataUrl);
  const key = `${kind}-${crypto.randomUUID()}.${photo.extension}`;
  await run(env.DB, "INSERT INTO photos(id, content, content_type, created_at) VALUES (?, ?, ?, ?)", key, photo.body, photo.type, iso());
  return key;
}

async function overview(env, year, monthIndex) {
  const current = now();
  const yearValue = Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : current.getFullYear();
  const monthValue = Number.isInteger(monthIndex) && monthIndex >= 0 && monthIndex <= 11 ? monthIndex : current.getMonth();
  const members = await all(env.DB, "SELECT id, name, workshop, active FROM members WHERE active = 1 ORDER BY name");
  const sessions = await all(env.DB, "SELECT * FROM sessions WHERE status != 'voided' ORDER BY started_at DESC");
  const effective = sessions.filter((item) => item.status === "completed" && item.review_status === "approved");
  const from = new Date(yearValue, monthValue, 1), to = new Date(yearValue, monthValue + 1, 1);
  const stats = members.map((member) => { const own = effective.filter((item) => item.member_id === member.id); const minutes = own.reduce((sum, item) => sum + minutesInRange(item, from, to, current), 0); const active = yearValue === current.getFullYear() && monthValue === current.getMonth() && sessions.some((item) => item.member_id === member.id && item.status === "training"); return { ...member, monthMinutes: minutes, monthCount: own.filter((item) => new Date(item.started_at) < to && new Date(item.ended_at) > from).length, active, goalMinutes: 960 }; });
  const rangeEnd = yearValue === current.getFullYear() && monthValue === current.getMonth() ? new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1) : to;
  const daily = []; for (let cursor = new Date(from); cursor < rangeEnd; cursor.setDate(cursor.getDate() + 1)) { const end = new Date(cursor); end.setDate(end.getDate() + 1); const items = effective.filter((item) => minutesInRange(item, cursor, end, current) > 0); daily.push({ day: cursor.getDate(), minutes: items.reduce((sum, item) => sum + minutesInRange(item, cursor, end, current), 0), count: items.length, members: new Set(items.map((item) => item.member_id)).size }); }
  const monthMinutes = stats.reduce((sum, item) => sum + item.monthMinutes, 0); const elapsed = yearValue === current.getFullYear() && monthValue === current.getMonth() ? Math.max(1, current.getDate()) : new Date(yearValue, monthValue + 1, 0).getDate();
  return { now: iso(current), selectedYear: yearValue, selectedMonth: monthValue, availableYears: [...new Set([current.getFullYear(), ...sessions.map((item) => new Date(item.started_at).getFullYear())])].sort((a, b) => b - a), summary: { monthMinutes, averageDailyMinutes: members.length ? Math.round(monthMinutes / members.length / elapsed) : 0, goalReachedMembers: stats.filter((item) => item.monthMinutes >= 960).length, activeMembers: stats.filter((item) => item.active).length, completedSessions: effective.filter((item) => new Date(item.started_at) < to && new Date(item.ended_at) > from).length, abnormalRecords: sessions.filter((item) => anomalies(item, current).length).length }, previousSummary: { averageDailyMinutes: 0, goalReachedMembers: 0 }, members: stats, recentRecords: effective.filter((item) => new Date(item.started_at) < to && new Date(item.ended_at) > from).map((item) => ({ ...sessionView(item), memberName: members.find((member) => member.id === item.member_id)?.name, workshop: members.find((member) => member.id === item.member_id)?.workshop })), visualization: { daily, ranking: [...stats].sort((a, b) => b.monthMinutes - a.monthMinutes).map(({ id, name, monthMinutes: minutes }) => ({ id, name, minutes })), frequency: [...stats].sort((a, b) => b.monthCount - a.monthCount).map(({ id, name, monthCount: count }) => ({ id, name, count })), reachedMembers: stats.filter((item) => item.monthMinutes >= 960).length, remainingMembers: stats.filter((item) => item.monthMinutes < 960).length } };
}

async function seed(env) {
  const pin = await sha256("123456");
  await env.DB.batch(["zhangwei|张伟|炼钢维修车间", "liang|李昂|精炼连铸维修车间", "wangyu|王宇|轧钢维修车间"].map((line) => { const [id, name, workshop] = line.split("|"); return env.DB.prepare("INSERT OR IGNORE INTO members(id, name, workshop, pin_hash) VALUES (?, ?, ?, ?)").bind(id, name, workshop, pin); }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url); const path = url.pathname;
    try {
      if (!path.startsWith("/api/")) {
        const publicAssets = new Set(["/", "/index.html", "/app.js", "/styles.css"]);
        return publicAssets.has(path) ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
      }
      if (path === "/api/health") return json({ ok: true });
      if (path === "/api/photos/" || path.startsWith("/api/photos/")) { const session = await auth(request, env); if (!session) return failure("请先登录。", 401); const key = decodeURIComponent(path.slice("/api/photos/".length)); const photo = await one(env.DB, "SELECT content, content_type FROM photos WHERE id = ?", key); return photo ? new Response(photo.content, { headers: { "content-type": photo.content_type, "cache-control": "private, max-age=300" } }) : failure("照片不存在。", 404); }
      await seed(env);
      if (path === "/api/members" && request.method === "GET") return json({ members: await all(env.DB, "SELECT id, name, workshop FROM members WHERE active = 1 ORDER BY id") });
      if (path === "/api/login" && request.method === "POST") {
        const body = await request.json(); const account = String(body.name || "").trim(); const pin = String(body.pin || "");
        if (!/^\d{6}$/.test(pin)) return failure("PIN 必须为 6 位数字。");
        const adminAccount = env.ADMIN_ACCOUNT || "Admin"; const adminHash = env.ADMIN_PIN_HASH;
        let role, memberId = null;
        if (account === adminAccount && adminHash && await sha256(pin) === adminHash) role = "admin";
        else { const member = await one(env.DB, "SELECT * FROM members WHERE name = ? AND active = 1", account); if (!member || member.pin_hash !== await sha256(pin)) return failure("账号或 PIN 不正确。", 401); role = "member"; memberId = member.id; }
        const token = crypto.randomUUID(); await run(env.DB, "INSERT INTO auth_sessions(token, role, member_id, expires_at) VALUES (?, ?, ?, ?)", token, role, memberId, iso(new Date(Date.now() + SESSION_HOURS * 3600000)));
        return role === "admin" ? json({ role, token, account }) : json({ role, token, ...(await dashboard(env, memberId)) });
      }
      if (path === "/api/admin/logout" && request.method === "POST") { const session = await auth(request, env, "admin"); if (!session) return failure("管理员身份已失效，请重新登录。", 401); await run(env.DB, "DELETE FROM auth_sessions WHERE token = ?", session.token); return json({ ok: true }); }
      const memberDashboard = /^\/api\/members\/([^/]+)\/dashboard$/.exec(path);
      if (memberDashboard && request.method === "GET") { const session = await auth(request, env); const memberId = decodeURIComponent(memberDashboard[1]); if (!session || (session.role === "member" && session.member_id !== memberId)) return failure("请先登录。", 401); const data = await dashboard(env, memberId); return data ? json(data) : failure("成员不存在或已停用。", 404); }
      if (path === "/api/sessions/start" && request.method === "POST") { const session = await auth(request, env, "member"); if (!session) return failure("请先登录。", 401); const body = await request.json(); if (body.memberId !== session.member_id) return failure("无权为其他成员签到。", 403); if (await one(env.DB, "SELECT id FROM sessions WHERE member_id = ? AND status = 'training'", session.member_id)) return failure("当前已有进行中的实训记录，请先结束本次实训。", 409); const photo = await putPhoto(env, body.photoData, "start"); const created = iso(); await run(env.DB, "INSERT INTO sessions(id, member_id, started_at, start_photo_path, status, review_status, created_at) VALUES (?, ?, ?, ?, 'training', 'approved', ?)", crypto.randomUUID(), session.member_id, created, photo, created); return json(await dashboard(env, session.member_id), 201); }
      const end = /^\/api\/sessions\/([^/]+)\/end$/.exec(path);
      if (end && request.method === "POST") { const session = await auth(request, env, "member"); if (!session) return failure("请先登录。", 401); const body = await request.json(); if (body.memberId !== session.member_id) return failure("无权为其他成员签到。", 403); const active = await one(env.DB, "SELECT * FROM sessions WHERE member_id = ? AND status = 'training'", session.member_id); if (!active || active.id !== decodeURIComponent(end[1])) return failure("未找到可结束的实训记录，请刷新页面后重试。", 409); const photo = await putPhoto(env, body.photoData, "end"); const endedAt = iso(); await run(env.DB, "UPDATE sessions SET ended_at = ?, end_photo_path = ?, status = 'completed', review_status = ? WHERE id = ?", endedAt, photo, new Date(endedAt) - new Date(active.started_at) > LONG_TRAINING_HOURS * 3600000 ? "pending" : "approved", active.id); return json(await dashboard(env, session.member_id)); }
      if (path === "/api/admin/overview" && request.method === "GET") { if (!await auth(request, env, "admin")) return failure("管理员身份已失效，请重新登录。", 401); return json(await overview(env, Number(url.searchParams.get("year")), Number(url.searchParams.get("month")) - 1)); }
      if (path === "/api/admin/records" && request.method === "GET") { if (!await auth(request, env, "admin")) return failure("管理员身份已失效，请重新登录。", 401); const memberId = url.searchParams.get("memberId") || ""; const members = await all(env.DB, "SELECT id, name, workshop, active FROM members ORDER BY active DESC, name"); const records = (await all(env.DB, "SELECT * FROM sessions WHERE status = 'completed'" )).filter((item) => !memberId || item.member_id === memberId).map((item) => ({ ...sessionView(item), memberName: members.find((member) => member.id === item.member_id)?.name, workshop: members.find((member) => member.id === item.member_id)?.workshop })); return json({ members, records }); }
      if (path === "/api/admin/members" && request.method === "GET") { if (!await auth(request, env, "admin")) return failure("管理员身份已失效，请重新登录。", 401); return json({ members: await all(env.DB, "SELECT id, name, workshop, active FROM members ORDER BY active DESC, name") }); }
      if (path === "/api/admin/members" && request.method === "POST") { if (!await auth(request, env, "admin")) return failure("管理员身份已失效，请重新登录。", 401); const body = await request.json(), name = String(body.name || "").trim(), workshop = String(body.workshop || "").trim(); if (!name || !WORKSHOPS.includes(workshop) || !/^\d{6}$/.test(body.pin || "")) return failure("请填写有效的姓名、车间和 6 位 PIN。"); const id = `member-${crypto.randomUUID()}`; try { await run(env.DB, "INSERT INTO members(id,name,workshop,pin_hash) VALUES(?,?,?,?)", id, name, workshop, await sha256(body.pin)); } catch { return failure("该用户名已存在，请使用不同的姓名。", 409); } return json({ member: { id, name, workshop, active: true } }, 201); }
      const adminMember = /^\/api\/admin\/members\/([^/]+)$/.exec(path);
      if (adminMember && request.method === "PATCH") { if (!await auth(request, env, "admin")) return failure("管理员身份已失效，请重新登录。", 401); const id = decodeURIComponent(adminMember[1]), body = await request.json(), name = String(body.name || "").trim(), workshop = String(body.workshop || "").trim(); if (!name || !WORKSHOPS.includes(workshop)) return failure("请填写有效的姓名和车间。"); try { await run(env.DB, "UPDATE members SET name=?, workshop=? WHERE id=?", name, workshop, id); if (body.pin) { if (!/^\d{6}$/.test(body.pin)) return failure("PIN 必须为 6 位数字。"); await run(env.DB, "UPDATE members SET pin_hash=? WHERE id=?", await sha256(body.pin), id); } } catch { return failure("该用户名已存在。", 409); } return json({ member: await one(env.DB, "SELECT id,name,workshop,active FROM members WHERE id=?", id) }); }
      const reset = /^\/api\/admin\/members\/([^/]+)\/reset-pin$/.exec(path); if (reset && request.method === "POST") { if (!await auth(request, env, "admin")) return failure("管理员身份已失效，请重新登录。", 401); await run(env.DB, "UPDATE members SET pin_hash=? WHERE id=?", await sha256("123456"), decodeURIComponent(reset[1])); return json({ ok: true }); }
      const disable = /^\/api\/admin\/members\/([^/]+)\/disable$/.exec(path); if (disable && request.method === "POST") { if (!await auth(request, env, "admin")) return failure("管理员身份已失效，请重新登录。", 401); const id = decodeURIComponent(disable[1]); if (await one(env.DB, "SELECT id FROM sessions WHERE member_id=? AND status='training'", id)) return failure("该成员正在实训中，请先结束实训后再停用。", 409); await run(env.DB, "UPDATE members SET active=0 WHERE id=?", id); return json({ member: await one(env.DB, "SELECT id,name,workshop,active FROM members WHERE id=?", id) }); }
      return failure("接口不存在。", 404);
    } catch (error) { return failure(error instanceof Error ? error.message : "服务器处理失败。", 500); }
  }
};
