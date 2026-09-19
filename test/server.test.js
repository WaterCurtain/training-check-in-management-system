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
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  context.after(() => server.close());

  const anonymous = await fetch(`${baseUrl}/api/admin/overview`);
  assert.equal(anonymous.status, 401);

  const login = await fetch(`${baseUrl}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account: "Admin", pin: "123456" }) });
  assert.equal(login.status, 200);
  const { token } = await login.json();

  const overview = await fetch(`${baseUrl}/api/admin/overview`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(overview.status, 200);
  const data = await overview.json();
  assert.equal(data.members.length, 3);
  assert.equal(typeof data.summary.monthMinutes, "number");

  const logout = await fetch(`${baseUrl}/api/admin/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(logout.status, 200);
  const expired = await fetch(`${baseUrl}/api/admin/overview`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(expired.status, 401);
});
