const state = { memberId: null, members: [], action: null, photoData: null, active: null, records: [], statistics: null, serverNow: null, showAllRecords: false, submitting: false, adminToken: null, managedMembers: [], editingMemberId: null, memberSaving: false };
const $ = (id) => document.getElementById(id);

async function request(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "服务暂时不可用，请稍后重试。");
  return data;
}

function serviceErrorMessage(error) {
  if (/Failed to fetch/i.test(error.message)) return "无法连接本地服务。请在项目目录运行 npm start，并通过 http://127.0.0.1:4173 打开系统。";
  return error.message;
}

function formatMinutes(minutes) {
  const value = Math.max(0, Math.round(minutes));
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (!hours) return `${mins}分钟`;
  return mins ? `${hours}小时${mins}分钟` : `${hours}小时`;
}

function formatClock(date) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(date));
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date(date));
}

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function minutesInRange(record, rangeStart, rangeEnd, now) {
  const start = new Date(record.start).getTime();
  const end = new Date(record.end || now).getTime();
  return Math.max(0, Math.round((Math.min(end, rangeEnd.getTime()) - Math.max(start, rangeStart.getTime())) / 60000));
}

function formatChartHours(minutes) {
  const hours = Math.round(minutes / 6) / 10;
  return `${Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)}小时`;
}

function chartRange(records, start, days, now) {
  const values = Array(days).fill(0);
  for (let day = 0; day < days; day += 1) {
    const rangeStart = new Date(start);
    rangeStart.setDate(start.getDate() + day);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeStart.getDate() + 1);
    values[day] = records.reduce((total, record) => total + minutesInRange(record, rangeStart, rangeEnd, now), 0);
  }
  return values;
}

function chartRecords() {
  return state.active ? [...state.records, state.active] : state.records;
}

function renderBarChart(values, labels) {
  const max = Math.max(...values, 60);
  const width = 680;
  const height = 236;
  const plot = { left: 42, right: 14, top: 18, bottom: 33 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const step = plotWidth / values.length;
  const barWidth = Math.max(4, Math.min(16, step * .58));
  const grid = [0, .5, 1].map((ratio) => {
    const y = plot.top + plotHeight * (1 - ratio);
    return `<line x1="${plot.left}" x2="${width - plot.right}" y1="${y}" y2="${y}" /><text x="0" y="${y + 4}">${formatChartHours(max * ratio).replace("小时", "")}</text>`;
  }).join("");
  const bars = values.map((value, index) => {
    const barHeight = value ? Math.max(3, plotHeight * value / max) : 2;
    const x = plot.left + step * index + (step - barWidth) / 2;
    const y = plot.top + plotHeight - barHeight;
    const showLabel = index === 0 || index === values.length - 1 || index % 7 === 0;
    return `<g><title>${labels[index]}：${formatMinutes(value)}</title><rect class="${value ? "chart-bar" : "chart-bar-zero"}" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="${Math.min(3, barWidth / 2)}" />${showLabel ? `<text class="chart-x-label" x="${x + barWidth / 2}" y="${height - 8}">${labels[index]}</text>` : ""}</g>`;
  }).join("");
  return `<svg class="training-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="本月每日实训时长柱状图。最高单日 ${formatMinutes(Math.max(...values))}"><g class="chart-grid">${grid}</g><g>${bars}</g></svg>`;
}

function renderLineChart(values, labels) {
  const max = Math.max(...values, 60);
  const width = 520;
  const height = 220;
  const plot = { left: 38, right: 14, top: 18, bottom: 34 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const pointAt = (value, index) => ({ x: plot.left + plotWidth * index / (values.length - 1), y: plot.top + plotHeight * (1 - value / max) });
  const points = values.map(pointAt);
  const polyline = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const grid = [0, .5, 1].map((ratio) => {
    const y = plot.top + plotHeight * (1 - ratio);
    return `<line x1="${plot.left}" x2="${width - plot.right}" y1="${y}" y2="${y}" /><text x="0" y="${y + 4}">${formatChartHours(max * ratio).replace("小时", "")}</text>`;
  }).join("");
  const dots = points.map(({ x, y }, index) => `<g><title>${labels[index]}：${formatMinutes(values[index])}</title><circle class="chart-dot" cx="${x}" cy="${y}" r="4" /><text class="chart-x-label" x="${x}" y="${height - 8}">${labels[index]}</text></g>`).join("");
  return `<svg class="training-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="本周训练趋势折线图。本周累计 ${formatMinutes(values.reduce((total, value) => total + value, 0))}"><g class="chart-grid">${grid}</g><polyline class="chart-line" points="${polyline}" />${dots}</svg>`;
}

function currentMember() {
  return state.members.find((member) => member.id === state.memberId);
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.add("hidden"), 2800);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character]);
}

async function loadMembers() {
  const data = await request("/api/members");
  state.members = data.members;
}

function renderUsernameSuggestions() {
  const input = $("usernameInput");
  const list = $("usernameSuggestions");
  const keyword = input.value.trim();
  const matches = keyword ? state.members.filter((member) => member.name.includes(keyword)).slice(0, 6) : [];
  list.innerHTML = matches.map((member) => `<button type="button" role="option" data-member-name="${escapeHtml(member.name)}"><strong>${escapeHtml(member.name)}</strong><span>${escapeHtml(member.workshop)}</span></button>`).join("");
  list.classList.toggle("hidden", !matches.length);
  input.setAttribute("aria-expanded", String(Boolean(matches.length)));
}

async function loadDashboard() {
  const data = await request(`/api/members/${encodeURIComponent(state.memberId)}/dashboard`);
  applyDashboard(data);
}

function applyDashboard(data) {
  state.active = data.active;
  state.records = data.records;
  state.statistics = data.statistics;
  state.serverNow = data.now;
  render();
}

async function loadAdminDashboard() {
  const data = await request("/api/admin/overview", { headers: { Authorization: `Bearer ${state.adminToken}` } });
  renderAdminDashboard(data);
}

function adminHeaders() {
  return { Authorization: `Bearer ${state.adminToken}` };
}

async function loadManagedMembers() {
  const data = await request("/api/admin/members", { headers: adminHeaders() });
  state.managedMembers = data.members;
  renderManagedMembers();
}

function renderManagedMembers() {
  $("memberCount").textContent = `共 ${state.managedMembers.length} 名成员`;
  $("memberManagementRows").innerHTML = state.managedMembers.map((member) => `<tr><td><strong>${escapeHtml(member.name)}</strong></td><td>${escapeHtml(member.workshop)}</td><td><span class="admin-status ${member.active ? "admin-status-complete" : "admin-status-muted"}">${member.active ? "正常使用" : "已停用"}</span></td><td class="member-row-actions"><button class="text-button edit-member" data-member-id="${member.id}" type="button">编辑</button>${member.active ? `<button class="text-button disable-member" data-member-id="${member.id}" type="button">停用</button>` : `<button class="text-button delete-member" data-member-id="${member.id}" type="button">删除</button>`}</td></tr>`).join("");
}

async function showAdminOverview() {
  try {
    await loadAdminDashboard();
    $("memberManagement").classList.add("hidden");
    $("adminDashboard").querySelector(".admin-main").classList.remove("hidden");
    $("showAdminOverview").className = "admin-nav-current";
    $("showMemberManagement").className = "admin-nav-button";
  } catch (error) {
    showToast(serviceErrorMessage(error));
  }
}

async function showMemberManagement() {
  try {
    await loadManagedMembers();
    $("adminDashboard").querySelector(".admin-main").classList.add("hidden");
    $("memberManagement").classList.remove("hidden");
    $("showAdminOverview").className = "admin-nav-button";
    $("showMemberManagement").className = "admin-nav-current";
  } catch (error) {
    showToast(serviceErrorMessage(error));
  }
}

function openMemberSheet(member = null) {
  state.editingMemberId = member?.id || null;
  $("memberSheetTitle").textContent = member ? "编辑成员" : "新增成员";
  $("memberSheetDescription").textContent = member ? "修改后会立即同步到成员信息与管理端总览。" : "填写成员的基础实训信息。";
  $("managedMemberName").value = member?.name || "";
  $("managedMemberWorkshop").value = member?.workshop || "炼钢维修车间";
  $("managedMemberPin").value = "";
  $("managedMemberPin").required = !member;
  $("managedMemberPinLabel").textContent = member ? "重置 PIN（可选）" : "6 位 PIN";
  $("managedMemberPinHint").textContent = member ? "留空则保留原 PIN；填写时必须为 6 位数字。" : "新成员必须设置 6 位数字 PIN。";
  $("memberFormError").textContent = "";
  $("saveMember").textContent = member ? "保存修改" : "保存成员";
  $("memberSheet").classList.remove("hidden");
  $("managedMemberName").focus();
}

function closeMemberSheet() {
  if (state.memberSaving) return;
  $("memberSheet").classList.add("hidden");
  state.editingMemberId = null;
}

async function saveMember(event) {
  event.preventDefault();
  if (state.memberSaving) return;
  state.memberSaving = true;
  const button = $("saveMember");
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "正在保存…";
  try {
    const isEditing = Boolean(state.editingMemberId);
    const body = JSON.stringify({ name: $("managedMemberName").value, workshop: $("managedMemberWorkshop").value, pin: $("managedMemberPin").value.trim() });
    const path = state.editingMemberId ? `/api/admin/members/${encodeURIComponent(state.editingMemberId)}` : "/api/admin/members";
    await request(path, { method: state.editingMemberId ? "PATCH" : "POST", headers: adminHeaders(), body });
    await loadManagedMembers();
    await loadMembers();
    state.memberSaving = false;
    closeMemberSheet();
    showToast(isEditing ? "成员信息已更新。" : "成员已新增，可使用成员端签到。");
  } catch (error) {
    $("memberFormError").textContent = serviceErrorMessage(error);
  } finally {
    state.memberSaving = false;
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function disableMember(memberId) {
  const member = state.managedMembers.find((item) => item.id === memberId);
  if (!member || !window.confirm(`确认停用“${member.name}”吗？其历史训练记录会保留。`)) return;
  try {
    await request(`/api/admin/members/${encodeURIComponent(memberId)}/disable`, { method: "POST", headers: adminHeaders() });
    await loadManagedMembers();
    await loadMembers();
    showToast("成员已停用，无法再登录签到。");
  } catch (error) {
    showToast(serviceErrorMessage(error));
  }
}

async function deleteMember(memberId) {
  const member = state.managedMembers.find((item) => item.id === memberId);
  if (!member || !window.confirm(`确认永久删除“${member.name}”吗？该账号、全部训练记录和现场照片都将被删除，且无法恢复。`)) return;
  try {
    await request(`/api/admin/members/${encodeURIComponent(memberId)}`, { method: "DELETE", headers: adminHeaders() });
    await loadManagedMembers();
    await loadMembers();
    showToast("账号及相关训练数据已永久删除。");
  } catch (error) {
    showToast(serviceErrorMessage(error));
  }
}

function renderAdminDashboard(data) {
  $("adminDate").textContent = formatDate(data.now);
  $("adminMonthMinutes").textContent = formatMinutes(data.summary.monthMinutes);
  $("adminGoalMembers").textContent = `${data.summary.goalReachedMembers} 人`;
  $("adminActiveMembers").textContent = `${data.summary.activeMembers} 人`;
  $("adminCompletedSessions").textContent = `${data.summary.completedSessions} 次`;
  $("adminMemberRows").innerHTML = data.members.map((member) => {
    const ratio = Math.min(member.monthMinutes / member.goalMinutes, 1);
    const status = member.active ? "实训中" : member.monthMinutes >= member.goalMinutes ? "已达标" : "未达标";
    const statusClass = member.active ? "admin-status-active" : member.monthMinutes >= member.goalMinutes ? "admin-status-complete" : "admin-status-pending";
    return `<tr><td><strong>${escapeHtml(member.name)}</strong></td><td>${escapeHtml(member.workshop)}</td><td>${formatMinutes(member.monthMinutes)} · ${member.monthCount} 次</td><td><div class="admin-progress"><span style="--admin-progress:${ratio}"></span></div><small>${Math.round(member.monthMinutes / member.goalMinutes * 100)}%</small></td><td><span class="admin-status ${statusClass}">${status}</span></td></tr>`;
  }).join("");
  $("adminRecords").innerHTML = data.recentRecords.length ? data.recentRecords.map((record) => `<article class="admin-record"><div><strong>${escapeHtml(record.memberName)}</strong><p>${formatDate(record.start)} · ${formatClock(record.start)} 至 ${formatClock(record.end)} · ${formatMinutes((new Date(record.end) - new Date(record.start)) / 60000)}</p></div><div class="admin-record-photos"><img src="${record.startPhoto}" alt="${escapeHtml(record.memberName)}的开始现场照片" /><img src="${record.endPhoto}" alt="${escapeHtml(record.memberName)}的结束现场照片" /></div></article>`).join("") : '<p class="admin-empty">暂无已完成的实训记录。成员完成一次开始和结束签到后，记录会显示在这里。</p>';
}

function showAdminLogin() {
  $("identityView").classList.add("hidden");
  $("adminLogin").classList.remove("hidden");
  $("adminPin").value = "";
  $("adminError").textContent = "";
  $("adminPin").focus();
}

async function leaveAdminDashboard() {
  const token = state.adminToken;
  state.adminToken = null;
  $("adminDashboard").classList.add("hidden");
  $("identityView").classList.remove("hidden");
  $("pinInput").value = "";
  $("pinInput").focus();
  if (token) await request("/api/admin/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
}

async function setupIdentity() {
  try {
    await loadMembers();
  } catch (error) {
    $("identityError").textContent = serviceErrorMessage(error);
  }
  $("identityForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const pin = $("pinInput").value.trim();
    const name = $("usernameInput").value.trim();
    if (!name) { $("identityError").textContent = "请输入用户名后再登录。"; $("usernameInput").focus(); return; }
    if (!pin) { $("identityError").textContent = "请输入 6 位 PIN 后再登录。"; $("pinInput").focus(); return; }
    try {
      const data = await request("/api/members/login", { method: "POST", body: JSON.stringify({ name, pin }) });
      state.memberId = data.member.id;
      applyDashboard(data);
      state.showAllRecords = false;
      $("identityError").textContent = "";
      $("identityView").classList.add("hidden");
      $("dashboard").classList.remove("hidden");
    } catch (error) {
      $("identityError").textContent = `无法登录：${serviceErrorMessage(error)}`;
    }
  });
  $("usernameInput").addEventListener("input", () => { $("identityError").textContent = ""; renderUsernameSuggestions(); });
  $("usernameInput").addEventListener("focus", renderUsernameSuggestions);
  $("usernameInput").addEventListener("blur", () => window.setTimeout(() => { $("usernameSuggestions").classList.add("hidden"); $("usernameInput").setAttribute("aria-expanded", "false"); }, 120));
  $("usernameSuggestions").addEventListener("mousedown", (event) => {
    const option = event.target.closest("button[data-member-name]");
    if (!option) return;
    event.preventDefault();
    $("usernameInput").value = option.dataset.memberName;
    $("usernameSuggestions").classList.add("hidden");
    $("usernameInput").setAttribute("aria-expanded", "false");
    $("pinInput").focus();
  });
  $("showAdminLogin").addEventListener("click", showAdminLogin);
  $("backToMember").addEventListener("click", () => { $("adminLogin").classList.add("hidden"); $("identityView").classList.remove("hidden"); });
  $("adminLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = await request("/api/admin/login", { method: "POST", body: JSON.stringify({ account: $("adminAccount").value.trim(), pin: $("adminPin").value.trim() }) });
      state.adminToken = data.token;
      await loadAdminDashboard();
      $("adminError").textContent = "";
      $("adminLogin").classList.add("hidden");
      $("adminDashboard").classList.remove("hidden");
    } catch (error) {
      $("adminError").textContent = serviceErrorMessage(error);
    }
  });
}

function render() {
  const member = currentMember();
  if (!member || !state.statistics) return;
  $("profileName").textContent = member.name;
  $("welcomeTitle").textContent = `你好，${member.name}`;
  $("workshopLabel").textContent = `${member.workshop} · 安全规范，记录真实`;
  $("todayLabel").textContent = formatDate(state.serverNow);
  renderTrainingHero();
  renderStats();
  renderAnalytics();
  renderRecords();
}

function renderTrainingHero() {
  const active = state.active;
  const hero = $("trainingHero");
  const action = $("heroAction");
  hero.classList.toggle("training", Boolean(active));
  if (active) {
    $("statusBadge").textContent = "实训中";
    $("statusMeta").textContent = `开始于 ${formatClock(active.start)}（服务器时间）`;
    $("trainingStatusTitle").textContent = "当前正在实训";
    $("heroDescription").textContent = "结束时上传现场照片，系统会自动计算本次有效时长。";
    action.innerHTML = '<button id="endTraining" class="primary-button" type="button">结束实训</button>';
    $("endTraining").addEventListener("click", () => openSheet("end"));
  } else {
    $("statusBadge").textContent = "准备就绪";
    $("statusMeta").textContent = "尚未开始实训";
    $("trainingStatusTitle").textContent = "今天还没有实训记录";
    $("heroDescription").textContent = "开始实训后，请上传现场照片作为本次记录凭证。";
    $("timer").textContent = "00:00:00";
    action.innerHTML = '<button id="startTraining" class="primary-button" type="button">开始实训</button>';
    $("startTraining").addEventListener("click", () => openSheet("start"));
  }
}

function renderTimer() {
  if (!state.active || !state.serverNow) return;
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(state.active.start).getTime()) / 1000));
  $("timer").textContent = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map((value) => String(value).padStart(2, "0")).join(":");
}

function renderStats() {
  const stats = state.statistics;
  const complete = stats.monthMinutes >= stats.goalMinutes;
  const ratio = Math.min(stats.monthMinutes / stats.goalMinutes, 1);
  $("todayTime").textContent = formatMinutes(stats.todayMinutes);
  $("weekTime").textContent = formatMinutes(stats.weekMinutes);
  $("monthCount").textContent = `${stats.monthCount} 次`;
  $("progressText").innerHTML = `${formatMinutes(stats.monthMinutes)} <span>/ ${formatMinutes(stats.goalMinutes)}</span>`;
  $("completedTime").textContent = formatMinutes(stats.monthMinutes);
  $("remainingTime").textContent = complete ? "已完成" : formatMinutes(stats.goalMinutes - stats.monthMinutes);
  const status = $("goalStatus");
  status.textContent = complete ? "已达标" : "未达标";
  status.className = complete ? "success-text" : "warning-text";
  $("progressBar").style.setProperty("--progress", ratio);
}

function renderAnalytics() {
  const now = new Date(state.serverNow);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const records = chartRecords();
  const monthValues = chartRange(records, monthStart, daysInMonth, now);
  const monthTotal = monthValues.reduce((total, value) => total + value, 0);
  const monthActiveDays = monthValues.filter(Boolean).length;
  const monthLabels = monthValues.map((_, index) => `${index + 1}日`);
  $("dailyChartSummary").textContent = monthTotal ? `本月共 ${monthActiveDays} 个训练日，累计 ${formatMinutes(monthTotal)}` : "本月暂无实训数据";
  $("dailyTrainingChart").innerHTML = monthTotal ? renderBarChart(monthValues, monthLabels) : '<p class="chart-empty">本月还没有可统计的实训记录。完成一次实训后，时长会按日期显示在这里。</p>';

  const monday = startOfDay(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekValues = chartRange(records, monday, 7, now);
  const weekTotal = weekValues.reduce((total, value) => total + value, 0);
  const weekLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  $("weeklyChartSummary").textContent = weekTotal ? `本周累计 ${formatMinutes(weekTotal)}` : "本周暂无实训数据";
  $("weeklyTrainingChart").innerHTML = weekTotal ? renderLineChart(weekValues, weekLabels) : '<p class="chart-empty">本周还没有可统计的实训记录。</p>';

  const stats = state.statistics;
  const ratio = Math.min(stats.monthMinutes / stats.goalMinutes, 1);
  $("trainingInsightValue").textContent = `${Math.round(ratio * 100)}%`;
  $("trainingInsightMeta").textContent = stats.monthMinutes >= stats.goalMinutes ? "已完成本月 16 小时目标" : `距离目标还需 ${formatMinutes(stats.goalMinutes - stats.monthMinutes)}`;
  $("trainingInsightText").textContent = `累计 ${formatMinutes(stats.monthMinutes)}，${stats.monthCount} 次实训。`;
}

function renderRecords() {
  const records = state.showAllRecords ? state.records : state.records.slice(0, 4);
  $("showAllRecords").textContent = state.showAllRecords ? "收起记录" : `查看全部 (${state.records.length})`;
  $("recordList").innerHTML = records.length ? records.map((record) => {
    const start = new Date(record.start);
    const end = new Date(record.end);
    const day = `${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    return `<article class="record-item"><span class="record-date">${day}</span><div class="record-main"><strong>本次实训记录</strong><p>${formatClock(start)} 开始 · ${formatClock(end)} 结束</p></div><div class="record-times"><span>${formatMinutes((end - start) / 60000)}</span><span class="record-status">正常</span></div><div class="record-media"><img src="${record.startPhoto}" alt="开始现场照片" /><img src="${record.endPhoto}" alt="结束现场照片" /></div></article>`;
  }).join("") : '<p class="empty-records">暂无已完成的实训记录。完成一次签到后，照片和时长会在这里保留。</p>';
}

function openSheet(action) {
  state.action = action;
  state.photoData = null;
  const member = currentMember();
  $("sheetEyebrow").textContent = action === "start" ? "开始签到" : "结束签到";
  $("sheetTitle").textContent = action === "start" ? "上传实训现场照片" : "上传结束实训照片";
  $("checkinContext").innerHTML = action === "start" ? `<strong>${member.name}</strong><span>${member.workshop} · 提交后以服务器时间为准</span>` : `<strong>${member.name}</strong><span>开始于 ${formatClock(state.active.start)} · ${$("timer").textContent}</span>`;
  $("photoTitle").textContent = action === "start" ? "拍摄或上传开始现场照片" : "拍摄或上传结束现场照片";
  $("photoHint").textContent = "照片为本次签到的必填凭证，可重新选择";
  $("confirmCheckin").textContent = action === "start" ? "确认开始实训" : "确认结束实训";
  $("photoInput").value = "";
  $("photoPreview").src = "";
  $("photoPreview").classList.add("hidden");
  $("photoError").textContent = "";
  $("checkinSheet").classList.remove("hidden");
  $("photoInput").focus();
}

function closeSheet() {
  if (state.submitting) return;
  $("checkinSheet").classList.add("hidden");
  state.action = null;
  state.photoData = null;
}

async function handlePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) { $("photoError").textContent = "请选择图片文件后再提交。"; return; }
  try {
    const preview = await compressPhoto(file);
    state.photoData = preview;
    $("photoPreview").src = preview;
    $("photoPreview").classList.remove("hidden");
    $("photoError").textContent = "";
  } catch {
    $("photoError").textContent = "照片处理失败，请重新选择一张图片。";
  }
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const source = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(source);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    image.onerror = () => { URL.revokeObjectURL(source); reject(new Error("image-load-failed")); };
    image.src = source;
  });
}

async function confirmCheckin() {
  if (!state.photoData) { $("photoError").textContent = "请先拍摄或上传一张现场照片。"; return; }
  if (state.submitting) return;
  state.submitting = true;
  const button = $("confirmCheckin");
  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = "正在保存…";
  try {
    const path = state.action === "start" ? "/api/sessions/start" : `/api/sessions/${encodeURIComponent(state.active.id)}/end`;
    const data = await request(path, { method: "POST", body: JSON.stringify({ memberId: state.memberId, photoData: state.photoData }) });
    state.active = data.active;
    state.records = data.records;
    state.statistics = data.statistics;
    state.serverNow = data.now;
    const message = state.action === "start" ? "开始实训已记录，计时已开始。" : "结束实训已记录，统计已更新。";
    state.action = null;
    state.photoData = null;
    $("checkinSheet").classList.add("hidden");
    render();
    showToast(message);
  } catch (error) {
    $("photoError").textContent = error.message;
  } finally {
    state.submitting = false;
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

$("switchMember").addEventListener("click", () => { $("dashboard").classList.add("hidden"); $("identityView").classList.remove("hidden"); $("pinInput").value = ""; $("usernameInput").focus(); });
$("closeSheet").addEventListener("click", closeSheet);
$("sheetBackdrop").addEventListener("click", closeSheet);
$("photoInput").addEventListener("change", handlePhoto);
$("confirmCheckin").addEventListener("click", confirmCheckin);
$("showAllRecords").addEventListener("click", () => { state.showAllRecords = !state.showAllRecords; renderRecords(); });
$("adminLogout").addEventListener("click", leaveAdminDashboard);
$("memberLogout").addEventListener("click", leaveAdminDashboard);
$("showAdminOverview").addEventListener("click", showAdminOverview);
$("showMemberManagement").addEventListener("click", showMemberManagement);
$("addMember").addEventListener("click", () => openMemberSheet());
$("closeMemberSheet").addEventListener("click", closeMemberSheet);
$("memberSheetBackdrop").addEventListener("click", closeMemberSheet);
$("memberForm").addEventListener("submit", saveMember);
$("memberManagementRows").addEventListener("click", (event) => {
  const memberId = event.target.dataset.memberId;
  if (!memberId) return;
  if (event.target.classList.contains("edit-member")) openMemberSheet(state.managedMembers.find((member) => member.id === memberId));
  if (event.target.classList.contains("disable-member")) disableMember(memberId);
  if (event.target.classList.contains("delete-member")) deleteMember(memberId);
});
setupIdentity();
window.setInterval(renderTimer, 1000);
