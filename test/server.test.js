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

  const login = await fetch(`${baseUrl}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account: "Admin", pin: "123456" }) });
  assert.equal(login.status, 200);
  const { token } = await login.json();

  const overview = await fetch(`${baseUrl}/api/admin/overview`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(overview.status, 200);
  const data = await overview.json();
  assert.ok(data.members.length >= 1);
  assert.equal(typeof data.summary.monthMinutes, "number");

  const created = await fetch(`${baseUrl}/api/admin/members`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: "临时成员", workshop: "行车车间", pin: "654321" }) });
  assert.equal(created.status, 201);
  const createdData = await created.json();
  createdMemberId = createdData.member.id;

  const memberLogin = await fetch(`${baseUrl}/api/members/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "临时成员", pin: "654321" }) });
  assert.equal(memberLogin.status, 200);

  const edited = await fetch(`${baseUrl}/api/admin/members/${createdMemberId}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: "已编辑成员", workshop: "轧钢维修车间", pin: "111111" }) });
  assert.equal(edited.status, 200);

  const resetPinLogin = await fetch(`${baseUrl}/api/members/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "已编辑成员", pin: "111111" }) });
  assert.equal(resetPinLogin.status, 200);

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
