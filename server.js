const { createServer } = require("node:http");
const { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync, copyFileSync } = require("node:fs");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PHOTO_DIR = path.join(DATA_DIR, "photos");
const PORT = Number(process.env.PORT || 4173);
const ADMIN_ACCOUNT = "Admin";
const ADMIN_PIN = "123456";
const adminSessions = new Set();
const WORKSHOPS = ["炼钢维修车间", "精炼连铸维修车间", "轧钢维修车间", "行车车间"];

function hashPin(pin) {
  return createHash("sha256").update(pin).digest("hex");
}

const DEFAULT_MEMBER_PIN_HASH = hashPin("123456");

mkdirSync(PHOTO_DIR, { recursive: true });
const database = new DatabaseSync(path.join(DATA_DIR, "training.db"));
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    workshop TEXT NOT NULL,
    pin_hash TEXT NOT NULL DEFAULT '${DEFAULT_MEMBER_PIN_HASH}',
    active INTEGER NOT NULL DEFAULT 1
  ) STRICT;
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(id),
    started_at TEXT NOT NULL,
    ended_at TEXT,
    start_photo_path TEXT NOT NULL,
    end_photo_path TEXT,
    status TEXT NOT NULL DEFAULT 'training',
    created_at TEXT NOT NULL
  ) STRICT;
  CREATE INDEX IF NOT EXISTS sessions_member_started_idx ON sessions(member_id, started_at DESC);
`);

if (!database.prepare("PRAGMA table_info(members)").all().some((column) => column.name === "pin_hash")) {
  database.exec(`ALTER TABLE members ADD COLUMN pin_hash TEXT NOT NULL DEFAULT '${DEFAULT_MEMBER_PIN_HASH}'`);
}
database.exec("CREATE UNIQUE INDEX IF NOT EXISTS members_name_unique_idx ON members(name)");

const seedMember = database.prepare("INSERT OR IGNORE INTO members (id, name, workshop, pin_hash) VALUES (?, ?, ?, ?)");
[
  ["zhangwei", "张伟", "炼钢维修车间", DEFAULT_MEMBER_PIN_HASH],
  ["liang", "李昂", "精炼连铸维修车间", DEFAULT_MEMBER_PIN_HASH],
  ["wangyu", "王宇", "轧钢维修车间", DEFAULT_MEMBER_PIN_HASH],
  ["demo-chenhao", "陈浩", "炼钢维修车间", DEFAULT_MEMBER_PIN_HASH],
  ["demo-sunli", "孙莉", "精炼连铸维修车间", DEFAULT_MEMBER_PIN_HASH],
  ["demo-zhouming", "周明", "轧钢维修车间", DEFAULT_MEMBER_PIN_HASH],
  ["demo-wuqian", "吴倩", "行车车间", DEFAULT_MEMBER_PIN_HASH],
  ["demo-liujun", "刘军", "炼钢维修车间", DEFAULT_MEMBER_PIN_HASH],
  ["demo-gaoning", "高宁", "精炼连铸维修车间", DEFAULT_MEMBER_PIN_HASH],
].forEach((member) => seedMember.run(...member));
const updateSeedWorkshop = database.prepare("UPDATE members SET workshop = ? WHERE id = ? AND workshop = ?");
[["炼钢维修车间", "zhangwei", "仪控维修一组"], ["精炼连铸维修车间", "liang", "电气维修二组"], ["轧钢维修车间", "wangyu", "自动化实训组"]].forEach((member) => updateSeedWorkshop.run(...member));

const demoSourcePhoto = path.join(ROOT, "design-assets", "training-system-ui-concept.png");
const seedDemoSession = database.prepare("INSERT OR IGNORE INTO sessions (id, member_id, started_at, ended_at, start_photo_path, end_photo_path, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)");
const demoMemberIds = ["demo-chenhao", "demo-sunli", "demo-zhouming", "demo-wuqian", "demo-liujun", "demo-gaoning"];
const demoNow = new Date();
demoMemberIds.forEach((memberId, memberIndex) => {
  for (let recordIndex = 0; recordIndex < 4; recordIndex += 1) {
    const offset = (memberIndex * 3 + recordIndex * 2) % Math.max(demoNow.getDate(), 1);
    const startedAt = new Date(demoNow.getFullYear(), demoNow.getMonth(), Math.max(1, demoNow.getDate() - offset), 8 + (memberIndex + recordIndex) % 5, recordIndex % 2 ? 20 : 0);
    const endedAt = new Date(startedAt.getTime() + (75 + ((memberIndex * 23 + recordIndex * 17) % 105)) * 60 * 1000);
    const id = `demo-${demoNow.getFullYear()}-${demoNow.getMonth() + 1}-${memberId}-${recordIndex}`;
    const demoPhoto = path.join(PHOTO_DIR, `${id}.png`);
    if (!existsSync(demoPhoto) && existsSync(demoSourcePhoto)) copyFileSync(demoSourcePhoto, demoPhoto);
    seedDemoSession.run(id, memberId, startedAt.toISOString(), endedAt.toISOString(), demoPhoto, demoPhoto, startedAt.toISOString());
  }
});

const statements = {
  members: database.prepare("SELECT id, name, workshop FROM members WHERE active = 1 ORDER BY id"),
  member: database.prepare("SELECT id, name, workshop FROM members WHERE id = ? AND active = 1"),
  memberByName: database.prepare("SELECT id, name, workshop, pin_hash FROM members WHERE name = ? AND active = 1"),
  allMembers: database.prepare("SELECT id, name, workshop, active FROM members ORDER BY active DESC, name"),
  memberAny: database.prepare("SELECT id, name, workshop, active FROM members WHERE id = ?"),
  createMember: database.prepare("INSERT INTO members (id, name, workshop, pin_hash) VALUES (?, ?, ?, ?)"),
  updateMember: database.prepare("UPDATE members SET name = ?, workshop = ? WHERE id = ?"),
  updateMemberPin: database.prepare("UPDATE members SET pin_hash = ? WHERE id = ?"),
  disableMember: database.prepare("UPDATE members SET active = 0 WHERE id = ? AND active = 1"),
  memberSessionPhotos: database.prepare("SELECT start_photo_path, end_photo_path FROM sessions WHERE member_id = ?"),
  deleteMemberSessions: database.prepare("DELETE FROM sessions WHERE member_id = ?"),
  deleteMember: database.prepare("DELETE FROM members WHERE id = ?"),
  active: database.prepare("SELECT * FROM sessions WHERE member_id = ? AND status = 'training' LIMIT 1"),
  sessions: database.prepare("SELECT * FROM sessions WHERE member_id = ? AND status = 'completed' ORDER BY started_at DESC"),
  allSessions: database.prepare("SELECT * FROM sessions ORDER BY started_at DESC"),
  start: database.prepare("INSERT INTO sessions (id, member_id, started_at, start_photo_path, status, created_at) VALUES (?, ?, ?, ?, 'training', ?)"),
  end: database.prepare("UPDATE sessions SET ended_at = ?, end_photo_path = ?, status = 'completed' WHERE id = ? AND member_id = ? AND status = 'training'"),
};

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

function sendError(response, status, message) {
  sendJson(response, status, { error: message });
}

function photoUrl(filePath) {
  return `/uploads/${path.basename(filePath)}`;
}

function serializeSession(session) {
  if (!session) return null;
  return { id: session.id, memberId: session.member_id, start: session.started_at, end: session.ended_at, startPhoto: photoUrl(session.start_photo_path), endPhoto: session.end_photo_path ? photoUrl(session.end_photo_path) : null, status: session.status };
}

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function minutesInRange(session, rangeStart, rangeEnd, now) {
  const start = new Date(session.started_at).getTime();
  const end = new Date(session.ended_at || now).getTime();
  return Math.max(0, Math.round((Math.min(end, rangeEnd.getTime()) - Math.max(start, rangeStart.getTime())) / 60000));
}

function dashboard(memberId) {
  const member = statements.member.get(memberId);
  if (!member) return null;
  const now = new Date();
  const active = statements.active.get(memberId);
  const completed = statements.sessions.all(memberId);
  const sessions = active ? [...completed, active] : completed;
  const todayStart = startOfDay(now);
  const tomorrow = new Date(todayStart); tomorrow.setDate(tomorrow.getDate() + 1);
  const monday = new Date(todayStart); monday.setDate(todayStart.getDate() - ((todayStart.getDay() + 6) % 7));
  const nextMonday = new Date(monday); nextMonday.setDate(nextMonday.getDate() + 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const totalFor = (start, end) => sessions.reduce((total, session) => total + minutesInRange(session, start, end, now), 0);
  const monthMinutes = totalFor(monthStart, nextMonth);
  const goalMinutes = 16 * 60;
  return {
    now: now.toISOString(),
    member,
    active: serializeSession(active),
    records: completed.map(serializeSession),
    statistics: {
      todayMinutes: totalFor(todayStart, tomorrow),
      weekMinutes: totalFor(monday, nextMonday),
      monthMinutes,
      monthCount: completed.filter((session) => new Date(session.started_at) < nextMonth && new Date(session.ended_at) > monthStart).length,
      goalMinutes,
    },
  };
}

function isAdmin(request) {
  const authorization = request.headers.authorization || "";
  return authorization.startsWith("Bearer ") && adminSessions.has(authorization.slice(7));
}

function adminOverview() {
  const now = new Date();
  const allMembers = statements.allMembers.all();
  const members = allMembers.filter((member) => member.active);
  const sessions = statements.allSessions.all();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const goalMinutes = 16 * 60;
  const memberStats = members.map((member) => {
    const memberSessions = sessions.filter((session) => session.member_id === member.id);
    const monthMinutes = memberSessions.reduce((total, session) => total + minutesInRange(session, monthStart, nextMonth, now), 0);
    const active = memberSessions.find((session) => session.status === "training");
    return { ...member, monthMinutes, monthCount: memberSessions.filter((session) => session.status === "completed" && new Date(session.started_at) < nextMonth && new Date(session.ended_at) > monthStart).length, active: Boolean(active), activeSince: active?.started_at || null, goalMinutes };
  });
  const monthMinutes = memberStats.reduce((total, member) => total + member.monthMinutes, 0);
  const memberInfo = new Map(allMembers.map((member) => [member.id, member]));
  const daily = [];
  for (let cursor = new Date(monthStart); cursor < nextMonth; cursor.setDate(cursor.getDate() + 1)) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const daySessions = sessions.filter((session) => session.status === "completed" && minutesInRange(session, dayStart, dayEnd, now) > 0);
    daily.push({ day: dayStart.getDate(), minutes: sessions.reduce((total, session) => total + minutesInRange(session, dayStart, dayEnd, now), 0), count: daySessions.length, members: new Set(daySessions.map((session) => session.member_id)).size });
  }
  return {
    now: now.toISOString(),
    summary: {
      monthMinutes,
      goalReachedMembers: memberStats.filter((member) => member.monthMinutes >= goalMinutes).length,
      activeMembers: memberStats.filter((member) => member.active).length,
      completedSessions: sessions.filter((session) => session.status === "completed").length,
    },
    members: memberStats,
    recentRecords: sessions.filter((session) => session.status === "completed").slice(0, 10).map((session) => ({ ...serializeSession(session), memberName: memberInfo.get(session.member_id)?.name, workshop: memberInfo.get(session.member_id)?.workshop })),
    visualization: {
      daily,
      ranking: [...memberStats].sort((left, right) => right.monthMinutes - left.monthMinutes).map((member) => ({ id: member.id, name: member.name, minutes: member.monthMinutes })),
      frequency: [...memberStats].sort((left, right) => right.monthCount - left.monthCount).map((member) => ({ id: member.id, name: member.name, count: member.monthCount })),
      reachedMembers: memberStats.filter((member) => member.monthMinutes >= goalMinutes).length,
      remainingMembers: memberStats.filter((member) => member.monthMinutes < goalMinutes).length,
    },
  };
}

function adminRecords(memberId) {
  const members = statements.allMembers.all();
  const names = new Map(members.map((member) => [member.id, member]));
  const records = statements.allSessions.all()
    .filter((session) => session.status === "completed" && (!memberId || session.member_id === memberId))
    .map((session) => ({ ...serializeSession(session), memberName: names.get(session.member_id)?.name, workshop: names.get(session.member_id)?.workshop }));
  return { members, records };
}

function memberPayload(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const workshop = typeof body.workshop === "string" ? body.workshop.trim() : "";
  if (!name || !workshop) throw new Error("请填写成员姓名和所属车间。");
  if (name.length > 32 || workshop.length > 64) throw new Error("成员姓名或所属车间过长，请控制在规定范围内。");
  if (!WORKSHOPS.includes(workshop)) throw new Error("请选择有效的所属车间。");
  return { name, workshop };
}

function memberPin(pin, required) {
  if (!pin && !required) return null;
  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) throw new Error("PIN 必须为 6 位数字。");
  return hashPin(pin);
}

function deleteStoredPhoto(photoPath) {
  if (!photoPath) return;
  const resolvedPath = path.resolve(photoPath);
  if (resolvedPath.startsWith(`${PHOTO_DIR}${path.sep}`) && existsSync(resolvedPath)) unlinkSync(resolvedPath);
}

function parsePhoto(dataUrl) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!match) throw new Error("照片格式无效，请重新拍摄或选择 JPG、PNG、WebP 图片。");
  const photo = Buffer.from(match[2], "base64");
  if (!photo.length || photo.length > 5 * 1024 * 1024) throw new Error("照片大小需在 5MB 以内，请重新选择。");
  return { photo, extension: match[1] === "jpeg" ? "jpg" : match[1] };
}

function savePhoto(dataUrl, prefix) {
  const { photo, extension } = parsePhoto(dataUrl);
  const filename = `${prefix}-${Date.now()}-${randomUUID()}.${extension}`;
  const fullPath = path.join(PHOTO_DIR, filename);
  writeFileSync(fullPath, photo, { flag: "wx" });
  return fullPath;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let received = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      received += chunk.length;
      if (received > 7 * 1024 * 1024) { reject(new Error("请求内容过大，照片压缩后请控制在 5MB 以内。")); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new Error("请求格式无效。")); } });
    request.on("error", reject);
  });
}

function contentType(filePath) {
  return ({ ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" })[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function serveFile(response, filePath) {
  if (!existsSync(filePath)) return sendError(response, 404, "资源不存在。");
  response.writeHead(200, { "Content-Type": contentType(filePath), "X-Content-Type-Options": "nosniff" });
  response.end(readFileSync(filePath));
}

async function handleApi(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/members") return sendJson(response, 200, { members: statements.members.all() });
  if (request.method === "POST" && pathname === "/api/login") {
    const body = await readJson(request);
    const account = typeof body.name === "string" ? body.name.trim() : "";
    if (account === ADMIN_ACCOUNT && body.pin === ADMIN_PIN) {
      const token = randomUUID();
      adminSessions.add(token);
      return sendJson(response, 200, { role: "admin", token, account: ADMIN_ACCOUNT });
    }
    const member = statements.memberByName.get(account);
    if (!member || member.pin_hash !== memberPin(body.pin, true)) return sendError(response, 401, "账号或 PIN 不正确。");
    return sendJson(response, 200, { role: "member", ...dashboard(member.id) });
  }
  if (request.method === "POST" && pathname === "/api/members/login") {
    const body = await readJson(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const member = statements.memberByName.get(name);
    if (!member || member.pin_hash !== memberPin(body.pin, true)) return sendError(response, 401, "用户名或 PIN 不正确。");
    return sendJson(response, 200, dashboard(member.id));
  }
  if (request.method === "POST" && pathname === "/api/admin/login") {
    const body = await readJson(request);
    if (body.account !== ADMIN_ACCOUNT || body.pin !== ADMIN_PIN) return sendError(response, 401, "管理员账号或 PIN 不正确。");
    const token = randomUUID();
    adminSessions.add(token);
    return sendJson(response, 200, { token, account: ADMIN_ACCOUNT });
  }
  if (request.method === "POST" && pathname === "/api/admin/logout") {
    if (!isAdmin(request)) return sendError(response, 401, "管理员身份已失效，请重新登录。");
    adminSessions.delete(request.headers.authorization.slice(7));
    return sendJson(response, 200, { ok: true });
  }
  if (request.method === "GET" && pathname === "/api/admin/overview") {
    if (!isAdmin(request)) return sendError(response, 401, "管理员身份已失效，请重新登录。");
    return sendJson(response, 200, adminOverview());
  }
  if (request.method === "GET" && pathname === "/api/admin/records") {
    if (!isAdmin(request)) return sendError(response, 401, "管理员身份已失效，请重新登录。");
    const memberId = new URL(request.url, `http://${request.headers.host || "localhost"}`).searchParams.get("memberId") || "";
    if (memberId && !statements.memberAny.get(memberId)) return sendError(response, 404, "成员不存在。");
    return sendJson(response, 200, adminRecords(memberId));
  }
  if (request.method === "GET" && pathname === "/api/admin/members") {
    if (!isAdmin(request)) return sendError(response, 401, "管理员身份已失效，请重新登录。");
    return sendJson(response, 200, { members: statements.allMembers.all().map((member) => ({ ...member, active: Boolean(member.active) })) });
  }
  if (request.method === "POST" && pathname === "/api/admin/members") {
    if (!isAdmin(request)) return sendError(response, 401, "管理员身份已失效，请重新登录。");
    const body = await readJson(request);
    const { name, workshop } = memberPayload(body);
    const pinHash = memberPin(body.pin, true);
    const id = `member-${randomUUID()}`;
    try {
      statements.createMember.run(id, name, workshop, pinHash);
      return sendJson(response, 201, { member: { id, name, workshop, active: true } });
    } catch (error) {
      if (/UNIQUE constraint/i.test(error.message)) return sendError(response, 409, "该用户名已存在，请使用不同的姓名。");
      throw error;
    }
  }
  const memberMatch = /^\/api\/admin\/members\/([^/]+)$/.exec(pathname);
  if (request.method === "PATCH" && memberMatch) {
    if (!isAdmin(request)) return sendError(response, 401, "管理员身份已失效，请重新登录。");
    const id = decodeURIComponent(memberMatch[1]);
    if (!statements.memberAny.get(id)) return sendError(response, 404, "成员不存在。");
    const body = await readJson(request);
    const { name, workshop } = memberPayload(body);
    const pinHash = memberPin(body.pin, false);
    try {
      statements.updateMember.run(name, workshop, id);
      if (pinHash) statements.updateMemberPin.run(pinHash, id);
    } catch (error) {
      if (/UNIQUE constraint/i.test(error.message)) return sendError(response, 409, "该用户名已存在，请使用不同的姓名。");
      throw error;
    }
    return sendJson(response, 200, { member: { ...statements.memberAny.get(id), active: Boolean(statements.memberAny.get(id).active) } });
  }
  const disableMatch = /^\/api\/admin\/members\/([^/]+)\/disable$/.exec(pathname);
  if (request.method === "POST" && disableMatch) {
    if (!isAdmin(request)) return sendError(response, 401, "管理员身份已失效，请重新登录。");
    const id = decodeURIComponent(disableMatch[1]);
    const member = statements.memberAny.get(id);
    if (!member) return sendError(response, 404, "成员不存在。");
    if (!member.active) return sendError(response, 409, "该成员已停用。");
    if (statements.active.get(id)) return sendError(response, 409, "该成员正在实训中，请先结束实训后再停用。");
    statements.disableMember.run(id);
    return sendJson(response, 200, { member: { ...statements.memberAny.get(id), active: false } });
  }
  if (request.method === "DELETE" && memberMatch) {
    if (!isAdmin(request)) return sendError(response, 401, "管理员身份已失效，请重新登录。");
    const id = decodeURIComponent(memberMatch[1]);
    const member = statements.memberAny.get(id);
    if (!member) return sendError(response, 404, "成员不存在。");
    if (member.active) return sendError(response, 409, "请先停用成员，再删除账号与相关数据。");
    const photos = statements.memberSessionPhotos.all(id);
    database.exec("BEGIN");
    try {
      statements.deleteMemberSessions.run(id);
      statements.deleteMember.run(id);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    photos.forEach((session) => { deleteStoredPhoto(session.start_photo_path); deleteStoredPhoto(session.end_photo_path); });
    return sendJson(response, 200, { ok: true });
  }
  const dashboardMatch = /^\/api\/members\/([^/]+)\/dashboard$/.exec(pathname);
  if (request.method === "GET" && dashboardMatch) {
    const data = dashboard(decodeURIComponent(dashboardMatch[1]));
    return data ? sendJson(response, 200, data) : sendError(response, 404, "成员不存在或已停用。");
  }
  if (request.method === "POST" && pathname === "/api/sessions/start") {
    const body = await readJson(request);
    if (!statements.member.get(body.memberId)) return sendError(response, 404, "成员不存在或已停用。");
    if (statements.active.get(body.memberId)) return sendError(response, 409, "当前已有进行中的实训记录，请先结束本次实训。");
    const photoPath = savePhoto(body.photoData, "start");
    const now = new Date().toISOString();
    statements.start.run(randomUUID(), body.memberId, now, photoPath, now);
    return sendJson(response, 201, dashboard(body.memberId));
  }
  const endMatch = /^\/api\/sessions\/([^/]+)\/end$/.exec(pathname);
  if (request.method === "POST" && endMatch) {
    const body = await readJson(request);
    if (!statements.member.get(body.memberId)) return sendError(response, 404, "成员不存在或已停用。");
    const active = statements.active.get(body.memberId);
    if (!active || active.id !== endMatch[1]) return sendError(response, 409, "未找到可结束的实训记录，请刷新页面后重试。");
    const photoPath = savePhoto(body.photoData, "end");
    statements.end.run(new Date().toISOString(), photoPath, active.id, body.memberId);
    return sendJson(response, 200, dashboard(body.memberId));
  }
  return sendError(response, 404, "接口不存在。");
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(request, response, url.pathname);
    if (url.pathname.startsWith("/uploads/")) return serveFile(response, path.join(PHOTO_DIR, path.basename(decodeURIComponent(url.pathname))));
    if (request.method !== "GET" && request.method !== "HEAD") return sendError(response, 405, "不支持该请求方法。");
    const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const filePath = path.resolve(ROOT, relativePath);
    if (!filePath.startsWith(`${ROOT}${path.sep}`)) return sendError(response, 403, "无权访问该资源。");
    return serveFile(response, filePath);
  } catch (error) {
    console.error(error);
    return sendError(response, 400, error.message || "请求处理失败，请重试。");
  }
});

if (require.main === module) server.listen(PORT, () => console.log(`实训打卡系统运行于 http://127.0.0.1:${PORT}`));

module.exports = { server, database, dashboard };
