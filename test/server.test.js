const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { rmSync } = require("node:fs");
const path = require("node:path");
const { server, database } = require("../server");

const photoData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("实训记录使用 SQLite 保存并关联本地照片", async (context) => {
  const memberId = `test-${Date.now()}`;
  const createdPhotos = [];
  database.prepare("INSERT INTO members (id, name, workshop) VALUES (?, ?, ?)").run(memberId, "测试成员", "测试车间");
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  context.after(() => {
    server.close();
    database.prepare("DELETE FROM sessions WHERE member_id = ?").run(memberId);
    database.prepare("DELETE FROM members WHERE id = ?").run(memberId);
    createdPhotos.forEach((photo) => rmSync(photo, { force: true }));
  });

  const started = await fetch(`${baseUrl}/api/sessions/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId, photoData }) });
  assert.equal(started.status, 201);
  const startData = await started.json();
  assert.ok(startData.active.id);
  createdPhotos.push(path.join(__dirname, "..", "data", "photos", path.basename(startData.active.startPhoto)));

  const duplicate = await fetch(`${baseUrl}/api/sessions/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId, photoData }) });
  assert.equal(duplicate.status, 409);

  const completed = await fetch(`${baseUrl}/api/sessions/${startData.active.id}/end`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId, photoData }) });
  assert.equal(completed.status, 200);
  const completedData = await completed.json();
  assert.equal(completedData.active, null);
  assert.equal(completedData.records.length, 1);
  createdPhotos.push(path.join(__dirname, "..", "data", "photos", path.basename(completedData.records[0].endPhoto)));

  const storedPhoto = await fetch(`${baseUrl}${completedData.records[0].startPhoto}`);
  assert.equal(storedPhoto.status, 200);
  assert.equal(storedPhoto.headers.get("content-type"), "image/png");
});

test("管理员需要认证后才能读取训练总览", async (context) => {
  let createdMemberId;
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  context.after(() => {
    server.close();
    if (createdMemberId) database.prepare("DELETE FROM members WHERE id = ?").run(createdMemberId);
  });

  const anonymous = await fetch(`${baseUrl}/api/admin/overview`);
  assert.equal(anonymous.status, 401);
  const anonymousRecords = await fetch(`${baseUrl}/api/admin/records`);
  assert.equal(anonymousRecords.status, 401);

  const login = await fetch(`${baseUrl}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account: "Admin", pin: "123456" }) });
  assert.equal(login.status, 200);
  const { token } = await login.json();

  const unifiedAdmin = await fetch(`${baseUrl}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Admin", pin: "123456" }) });
  assert.equal(unifiedAdmin.status, 200);
  assert.equal((await unifiedAdmin.json()).role, "admin");

  const overview = await fetch(`${baseUrl}/api/admin/overview`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(overview.status, 200);
  const data = await overview.json();
  assert.ok(data.members.length >= 1);
  assert.equal(typeof data.summary.monthMinutes, "number");
  assert.equal(typeof data.summary.abnormalRecords, "number");
  assert.equal(typeof data.previousSummary.averageDailyMinutes, "number");
  assert.equal(typeof data.previousSummary.goalReachedMembers, "number");
  assert.ok(Array.isArray(data.visualization.daily));
  assert.ok(Array.isArray(data.visualization.ranking));

  const records = await fetch(`${baseUrl}/api/admin/records`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(records.status, 200);
  const recordData = await records.json();
  assert.ok(Array.isArray(recordData.members));
  assert.ok(Array.isArray(recordData.records));

  const created = await fetch(`${baseUrl}/api/admin/members`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: "临时成员", workshop: "行车车间", pin: "654321" }) });
  assert.equal(created.status, 201);
  const createdData = await created.json();
  createdMemberId = createdData.member.id;

  const memberLogin = await fetch(`${baseUrl}/api/members/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "临时成员", pin: "654321" }) });
  assert.equal(memberLogin.status, 200);

  const unifiedMember = await fetch(`${baseUrl}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "临时成员", pin: "654321" }) });
  assert.equal(unifiedMember.status, 200);
  assert.equal((await unifiedMember.json()).role, "member");

  const edited = await fetch(`${baseUrl}/api/admin/members/${createdMemberId}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: "已编辑成员", workshop: "轧钢维修车间", pin: "111111" }) });
  assert.equal(edited.status, 200);

  const resetPinLogin = await fetch(`${baseUrl}/api/members/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "已编辑成员", pin: "111111" }) });
  assert.equal(resetPinLogin.status, 200);

  const reset = await fetch(`${baseUrl}/api/admin/members/${createdMemberId}/reset-pin`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(reset.status, 200);
  const defaultPinLogin = await fetch(`${baseUrl}/api/members/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "已编辑成员", pin: "123456" }) });
  assert.equal(defaultPinLogin.status, 200);

  database.prepare("INSERT INTO sessions (id, member_id, started_at, start_photo_path, status, created_at) VALUES (?, ?, ?, ?, 'training', ?)").run(`test-session-${Date.now()}`, createdMemberId, new Date().toISOString(), "data/photos/test.png", new Date().toISOString());
  const activeMember = await fetch(`${baseUrl}/api/admin/members/${createdMemberId}/disable`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(activeMember.status, 409);
  database.prepare("DELETE FROM sessions WHERE member_id = ?").run(createdMemberId);

  const disabled = await fetch(`${baseUrl}/api/admin/members/${createdMemberId}/disable`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(disabled.status, 200);
  assert.equal((await disabled.json()).member.active, false);

  const signInMembers = await fetch(`${baseUrl}/api/members`);
  assert.equal((await signInMembers.json()).members.some((member) => member.id === createdMemberId), false);

  database.prepare("INSERT INTO sessions (id, member_id, started_at, ended_at, start_photo_path, end_photo_path, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)").run(`test-completed-${Date.now()}`, createdMemberId, new Date().toISOString(), new Date().toISOString(), "data/photos/removed-start.png", "data/photos/removed-end.png", new Date().toISOString());
  const deleted = await fetch(`${baseUrl}/api/admin/members/${createdMemberId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(deleted.status, 200);
  assert.equal(database.prepare("SELECT count(*) AS count FROM sessions WHERE member_id = ?").get(createdMemberId).count, 0);

  const logout = await fetch(`${baseUrl}/api/admin/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(logout.status, 200);
  const expired = await fetch(`${baseUrl}/api/admin/overview`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(expired.status, 401);
});

test("管理员可闭环处理异常记录并保留审计日志", async (context) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const memberId = `abnormal-member-${suffix}`;
  const longOpenId = `abnormal-open-${suffix}`;
  const longCompletedId = `abnormal-long-${suffix}`;
  const shortId = `abnormal-short-${suffix}`;
  const normalId = `abnormal-normal-${suffix}`;
  const now = Date.now();
  database.prepare("INSERT INTO members (id, name, workshop) VALUES (?, ?, ?)").run(memberId, `异常测试成员${suffix}`, "测试车间");
  database.prepare("INSERT INTO sessions (id, member_id, started_at, start_photo_path, status, created_at) VALUES (?, ?, ?, ?, 'training', ?)").run(longOpenId, memberId, new Date(now - 9 * 60 * 60 * 1000).toISOString(), "data/photos/test-start.png", new Date(now).toISOString());
  database.prepare("INSERT INTO sessions (id, member_id, started_at, ended_at, start_photo_path, end_photo_path, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)").run(longCompletedId, memberId, new Date(now - 10 * 60 * 60 * 1000).toISOString(), new Date(now - 60 * 60 * 1000).toISOString(), "data/photos/test-start.png", "data/photos/test-end.png", new Date(now).toISOString());
  database.prepare("INSERT INTO sessions (id, member_id, started_at, ended_at, start_photo_path, end_photo_path, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)").run(shortId, memberId, new Date(now - 90 * 1000).toISOString(), new Date(now - 30 * 1000).toISOString(), "data/photos/test-start.png", "data/photos/test-end.png", new Date(now).toISOString());
  database.prepare("INSERT INTO sessions (id, member_id, started_at, ended_at, start_photo_path, end_photo_path, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)").run(normalId, memberId, new Date(now - 90 * 60 * 1000).toISOString(), new Date(now - 30 * 60 * 1000).toISOString(), "data/photos/test-start.png", "data/photos/test-end.png", new Date(now).toISOString());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  context.after(() => {
    server.close();
    database.prepare("DELETE FROM audit_logs WHERE record_id IN (?, ?, ?, ?)").run(longOpenId, longCompletedId, shortId, normalId);
    database.prepare("DELETE FROM sessions WHERE member_id = ?").run(memberId);
    database.prepare("DELETE FROM members WHERE id = ?").run(memberId);
  });

  const anonymous = await fetch(`${baseUrl}/api/admin/abnormal-records`);
  assert.equal(anonymous.status, 401);
  const login = await fetch(`${baseUrl}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account: "Admin", pin: "123456" }) });
  const { token } = await login.json();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const listed = await fetch(`${baseUrl}/api/admin/abnormal-records`, { headers });
  assert.equal(listed.status, 200);
  const records = (await listed.json()).records;
  const byId = new Map(records.map((record) => [record.id, record]));
  assert.deepEqual(byId.get(longOpenId).anomalyTypes, ["未结束", "超过8小时"]);
  assert.deepEqual(byId.get(longCompletedId).anomalyTypes, ["超过8小时"]);
  assert.deepEqual(byId.get(shortId).anomalyTypes, ["少于2分钟"]);
  assert.equal(byId.has(normalId), false);

  const noReason = await fetch(`${baseUrl}/api/admin/abnormal-records/${longOpenId}/complete`, { method: "POST", headers, body: JSON.stringify({ endedAt: new Date(now - 8 * 60 * 60 * 1000).toISOString() }) });
  assert.equal(noReason.status, 400);
  const invalidEnd = await fetch(`${baseUrl}/api/admin/abnormal-records/${longOpenId}/complete`, { method: "POST", headers, body: JSON.stringify({ endedAt: new Date(now - 10 * 60 * 60 * 1000).toISOString(), reason: "补录结束" }) });
  assert.equal(invalidEnd.status, 400);

  const completed = await fetch(`${baseUrl}/api/admin/abnormal-records/${longOpenId}/complete`, { method: "POST", headers, body: JSON.stringify({ endedAt: new Date(now - 8 * 60 * 60 * 1000).toISOString(), reason: "成员忘记结束签到，补录一小时实训。" }) });
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).record.status, "completed");

  const voided = await fetch(`${baseUrl}/api/admin/abnormal-records/${shortId}/void`, { method: "POST", headers, body: JSON.stringify({ reason: "误触发测试，作废该短时记录。" }) });
  assert.equal(voided.status, 200);
  assert.equal((await voided.json()).record.status, "voided");

  const audits = await fetch(`${baseUrl}/api/admin/audit-logs`, { headers });
  assert.equal(audits.status, 200);
  const logs = (await audits.json()).logs;
  const completionLog = logs.find((log) => log.recordId === longOpenId);
  const voidLog = logs.find((log) => log.recordId === shortId);
  assert.equal(completionLog.adminId, "Admin");
  assert.equal(completionLog.action, "补录结束时间");
  assert.equal(completionLog.beforeData.status, "training");
  assert.equal(completionLog.afterData.status, "completed");
  assert.ok(completionLog.beforeData.durationMinutes > 8 * 60);
  assert.equal(completionLog.afterData.durationMinutes, 60);
  assert.equal(voidLog.action, "作废记录");
  assert.equal(voidLog.beforeData.status, "completed");
  assert.equal(voidLog.afterData.status, "voided");
  assert.ok(voidLog.reason);
  assert.ok(voidLog.createdAt);

  const refreshed = await fetch(`${baseUrl}/api/admin/abnormal-records`, { headers });
  const remainingIds = new Set((await refreshed.json()).records.map((record) => record.id));
  assert.equal(remainingIds.has(longOpenId), false);
  assert.equal(remainingIds.has(shortId), false);
  assert.equal(remainingIds.has(longCompletedId), true);
});
