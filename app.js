const state = { memberId: null, members: [], action: null, photoData: null, active: null, records: [], statistics: null, serverNow: null, showAllRecords: false, selectedCalendarDate: "", submitting: false, adminToken: null, managedMembers: [], editingMemberId: null, memberSaving: false, adminRecords: [], adminRecordMembers: [], adminRecordMemberId: "", adminRecordDate: "", adminRecordPage: 1, adminCalendarDate: "" };
const ADMIN_RECORDS_PER_PAGE = 10;
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

function inputDate(date) {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
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

function renderLineChart(values, labels, ariaLabel = "本周训练趋势折线图") {
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
  return `<svg class="training-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${ariaLabel}。累计 ${formatMinutes(values.reduce((total, value) => total + value, 0))}"><g class="chart-grid">${grid}</g><polyline class="chart-line" points="${polyline}" />${dots}</svg>`;
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
  const accounts = [...state.members, { name: "Admin", workshop: "管理员工作台" }];
  const matches = keyword ? accounts.filter((account) => account.name.toLowerCase().includes(keyword.toLowerCase())).slice(0, 6) : [];
  list.innerHTML = matches.map((account) => `<button type="button" role="option" data-member-name="${escapeHtml(account.name)}"><strong>${escapeHtml(account.name)}</strong><span>${escapeHtml(account.workshop)}</span></button>`).join("");
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

async function loadAdminRecords(memberId = state.adminRecordMemberId) {
  const query = memberId ? `?memberId=${encodeURIComponent(memberId)}` : "";
  const data = await request(`/api/admin/records${query}`, { headers: adminHeaders() });
  state.adminRecords = data.records;
  state.adminRecordMembers = data.members;
  renderAdminRecords();
}

function renderManagedMembers() {
  $("memberCount").textContent = `共 ${state.managedMembers.length} 名成员`;
  $("memberManagementRows").innerHTML = state.managedMembers.map((member) => `<tr><td><strong>${escapeHtml(member.name)}</strong></td><td>${escapeHtml(member.workshop)}</td><td><span class="admin-status ${member.active ? "admin-status-complete" : "admin-status-muted"}">${member.active ? "正常使用" : "已停用"}</span></td><td class="member-row-actions"><button class="text-button edit-member" data-member-id="${member.id}" type="button">编辑</button>${member.active ? `<button class="text-button disable-member" data-member-id="${member.id}" type="button">停用</button>` : `<button class="text-button delete-member" data-member-id="${member.id}" type="button">删除</button>`}</td></tr>`).join("");
}

async function showAdminOverview() {
  try {
    await loadAdminDashboard();
    $("memberManagement").classList.add("hidden");
    $("adminRecordManagement").classList.add("hidden");
    $("adminOverview").classList.remove("hidden");
    $("showAdminOverview").className = "admin-nav-current";
    $("showMemberManagement").className = "admin-nav-button";
    $("showAdminRecords").className = "admin-nav-button";
  } catch (error) {
    showToast(serviceErrorMessage(error));
  }
}

async function showAdminRecords(memberId = "") {
  try {
    state.adminRecordMemberId = memberId;
    state.adminRecordDate = "";
    state.adminRecordPage = 1;
    state.adminCalendarDate = "";
    await loadAdminRecords();
    $("adminOverview").classList.add("hidden");
    $("memberManagement").classList.add("hidden");
    $("adminRecordManagement").classList.remove("hidden");
    $("showAdminOverview").className = "admin-nav-button";
    $("showMemberManagement").className = "admin-nav-button";
    $("showAdminRecords").className = "admin-nav-current";
  } catch (error) {
    showToast(serviceErrorMessage(error));
  }
}

async function showMemberManagement() {
  try {
    await loadManagedMembers();
    $("adminOverview").classList.add("hidden");
    $("adminRecordManagement").classList.add("hidden");
    $("memberManagement").classList.remove("hidden");
    $("showAdminOverview").className = "admin-nav-button";
    $("showMemberManagement").className = "admin-nav-current";
    $("showAdminRecords").className = "admin-nav-button";
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

function renderAdminVisualization(visualization) {
  const safeVisualization = visualization || { daily: [], ranking: [], frequency: [], reachedMembers: 0, remainingMembers: 0 };
  const daily = safeVisualization.daily || [];
  const total = daily.reduce((sum, item) => sum + item.minutes, 0);
  const completed = daily.reduce((sum, item) => sum + (item.count || 0), 0);
  $("adminDailySummary").textContent = total ? `本月累计 ${formatMinutes(total)}，完成 ${completed} 次；最高单日 ${formatMinutes(Math.max(...daily.map((item) => item.minutes)))}` : "本月尚无实训记录";
  $("adminDailyChart").innerHTML = total ? renderLineChart(daily.map((item) => item.minutes), daily.map((item) => `${item.day}日`), "本月全员每日实训时长趋势图") : '<p class="chart-empty">本月还没有可统计的实训记录。</p>';
  const ranking = safeVisualization.ranking || [];
  const maxRank = Math.max(...ranking.map((item) => item.minutes), 1);
  $("adminRankingChart").innerHTML = ranking.length ? `<div class="ranking-list">${ranking.map((item, index) => `<div class="ranking-row"><span>${index + 1}</span><strong>${escapeHtml(item.name)}</strong><div><i style="--ranking-progress:${item.minutes / maxRank}"></i></div><em>${formatMinutes(item.minutes)}</em></div>`).join("")}</div>` : '<p class="admin-empty">暂无排名数据。</p>';
  const totalMembers = safeVisualization.reachedMembers + safeVisualization.remainingMembers;
  const reachedRatio = totalMembers ? safeVisualization.reachedMembers / totalMembers : 0;
  $("adminAttainmentChart").innerHTML = `<div class="attainment-summary"><strong>${safeVisualization.reachedMembers}<span> / ${totalMembers} 人</span></strong><p>已完成月度目标</p><div class="attainment-track"><i style="--attainment-progress:${reachedRatio}"></i></div><small>未达标 ${safeVisualization.remainingMembers} 人</small></div>`;
  const frequency = safeVisualization.frequency || [];
  const maxFrequency = Math.max(...frequency.map((item) => item.count), 1);
  $("adminFrequencyChart").innerHTML = frequency.length ? `<div class="frequency-list">${frequency.map((item) => `<div><span>${escapeHtml(item.name)}</span><i style="--frequency-progress:${item.count / maxFrequency}"></i><strong>${item.count} 次</strong></div>`).join("")}</div>` : '<p class="admin-empty">暂无频率数据。</p>';
}

function adminPhotoButton(url, label) {
  return `<button class="record-photo-preview" type="button" data-photo-url="${escapeHtml(url)}" data-photo-label="${escapeHtml(label)}"><img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" /></button>`;
}

function renderAdminRecordCalendar(records) {
  const baseDate = new Date(records[0]?.start || Date.now());
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingDays = (new Date(year, month, 1).getDay() + 6) % 7;
  const recordsByDate = new Map();
  records.filter((record) => {
    const date = new Date(record.start);
    return date.getFullYear() === year && date.getMonth() === month;
  }).forEach((record) => {
    const date = inputDate(record.start);
    if (!recordsByDate.has(date)) recordsByDate.set(date, []);
    recordsByDate.get(date).push(record);
  });
  const dates = [...recordsByDate.keys()].sort();
  if (!state.adminCalendarDate || !recordsByDate.has(state.adminCalendarDate)) state.adminCalendarDate = dates.at(-1) || "";
  const member = state.adminRecordMembers.find((item) => item.id === state.adminRecordMemberId);
  $("adminRecordCalendarTitle").textContent = member ? `${member.name}的训练日历` : "成员训练日历";
  $("adminRecordCalendarSummary").textContent = dates.length ? `${year}年${month + 1}月共 ${dates.length} 个训练日；点击日期可同步筛选下方记录。` : "当前筛选条件下暂无可索引的实训记录。";
  const weekdays = ["一", "二", "三", "四", "五", "六", "日"].map((day) => `<span class="calendar-weekday">${day}</span>`).join("");
  const blanks = Array.from({ length: leadingDays }, () => '<span class="calendar-blank" aria-hidden="true"></span>').join("");
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const items = recordsByDate.get(date) || [];
    const minutes = items.reduce((total, record) => total + (new Date(record.end) - new Date(record.start)) / 60000, 0);
    return `<button class="calendar-day${items.length ? " has-record" : ""}${date === state.adminCalendarDate ? " is-selected" : ""}" type="button" data-admin-calendar-date="${date}" ${items.length ? "" : "disabled"}><strong>${day}</strong>${items.length ? `<span>${items.length} 次 · ${formatMinutes(minutes)}</span><i aria-hidden="true"></i>` : ""}</button>`;
  }).join("");
  $("adminRecordCalendar").innerHTML = weekdays + blanks + days;
  const selected = recordsByDate.get(state.adminCalendarDate) || [];
  const selectedMinutes = selected.reduce((total, record) => total + (new Date(record.end) - new Date(record.start)) / 60000, 0);
  $("adminRecordCalendarDetail").innerHTML = selected.length ? `<header><div><h3>${formatDate(`${state.adminCalendarDate}T00:00:00`)}</h3><p>${selected.length} 条实训记录 · 共 ${formatMinutes(selectedMinutes)}</p></div></header><div class="calendar-record-list">${selected.map((record) => `<article><div><strong>${escapeHtml(record.memberName)} · ${escapeHtml(record.workshop)}</strong><p>${formatClock(record.start)} 开始 · ${formatClock(record.end)} 结束</p><span>${formatMinutes((new Date(record.end) - new Date(record.start)) / 60000)}</span></div><div class="calendar-record-media">${adminPhotoButton(record.startPhoto, `${record.memberName}的开始现场照片`)}${adminPhotoButton(record.endPhoto, `${record.memberName}的结束现场照片`)}</div></article>`).join("")}</div>` : '<p class="calendar-empty">选择有蓝点的日期，查看当天的实训记录。</p>';
}

function renderAdminRecords() {
  const memberFilter = $("adminRecordMemberFilter");
  memberFilter.innerHTML = `<option value="">全部成员</option>${state.adminRecordMembers.map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)} · ${escapeHtml(member.workshop)}</option>`).join("")}`;
  memberFilter.value = state.adminRecordMemberId;
  $("adminRecordDateFilter").value = state.adminRecordDate;
  const records = state.adminRecords.filter((record) => !state.adminRecordDate || inputDate(record.start) === state.adminRecordDate);
  const pages = Math.max(1, Math.ceil(records.length / ADMIN_RECORDS_PER_PAGE));
  state.adminRecordPage = Math.min(state.adminRecordPage, pages);
  const start = (state.adminRecordPage - 1) * ADMIN_RECORDS_PER_PAGE;
  const pageRecords = records.slice(start, start + ADMIN_RECORDS_PER_PAGE);
  $("adminRecordFilterSummary").textContent = `共 ${records.length} 条已完成实训记录 · 每页 10 条`;
  renderAdminRecordCalendar(state.adminRecords);
  const groups = new Map();
  pageRecords.forEach((record) => {
    const date = inputDate(record.start);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(record);
  });
  $("adminRecordGroups").innerHTML = groups.size ? [...groups.entries()].map(([date, items]) => `<section class="admin-record-day"><header><strong>${formatDate(`${date}T00:00:00`)}</strong><span>${items.length} 条记录</span></header><div>${items.map((record) => `<article class="admin-record-card"><div class="admin-record-card-main"><div><strong>${escapeHtml(record.memberName)}</strong><span>${escapeHtml(record.workshop)}</span></div><p>${formatClock(record.start)} 开始 · ${formatClock(record.end)} 结束</p><em>${formatMinutes((new Date(record.end) - new Date(record.start)) / 60000)}</em></div><div class="admin-record-proof"><figure>${adminPhotoButton(record.startPhoto, `${record.memberName}的开始现场照片`)}<figcaption>开始</figcaption></figure><figure>${adminPhotoButton(record.endPhoto, `${record.memberName}的结束现场照片`)}<figcaption>结束</figcaption></figure></div></article>`).join("")}</div></section>`).join("") : '<section class="admin-section"><p class="admin-empty">没有符合筛选条件的已完成实训记录。</p></section>';
  $("adminRecordPagination").innerHTML = records.length > ADMIN_RECORDS_PER_PAGE ? `<span>第 ${state.adminRecordPage} / ${pages} 页</span><div><button class="text-button" data-admin-record-page="${state.adminRecordPage - 1}" type="button" ${state.adminRecordPage === 1 ? "disabled" : ""}>上一页</button><button class="text-button" data-admin-record-page="${state.adminRecordPage + 1}" type="button" ${state.adminRecordPage === pages ? "disabled" : ""}>下一页</button></div>` : "";
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
    return `<tr><td><strong>${escapeHtml(member.name)}</strong></td><td>${escapeHtml(member.workshop)}</td><td>${formatMinutes(member.monthMinutes)} · ${member.monthCount} 次</td><td><div class="admin-progress"><span style="--admin-progress:${ratio}"></span></div><small>${Math.round(member.monthMinutes / member.goalMinutes * 100)}%</small></td><td><span class="admin-status ${statusClass}">${status}</span></td><td><button class="text-button admin-member-records" data-member-id="${escapeHtml(member.id)}" type="button">查看记录</button></td></tr>`;
  }).join("");
  renderAdminVisualization(data.visualization);
  $("adminRecords").innerHTML = data.recentRecords.length ? data.recentRecords.map((record) => `<article class="admin-record"><div><strong>${escapeHtml(record.memberName)} <span class="admin-record-workshop">${escapeHtml(record.workshop || "未设置车间")}</span></strong><p>${formatDate(record.start)} · ${formatClock(record.start)} 至 ${formatClock(record.end)} · ${formatMinutes((new Date(record.end) - new Date(record.start)) / 60000)}</p></div><div class="admin-record-photos">${adminPhotoButton(record.startPhoto, `${record.memberName}的开始现场照片`)}${adminPhotoButton(record.endPhoto, `${record.memberName}的结束现场照片`)}</div></article>`).join("") : '<p class="admin-empty">暂无已完成的实训记录。成员完成一次开始和结束签到后，记录会显示在这里。</p>';
}

function openPhotoLightbox(url, label) {
  $("photoLightboxImage").src = url;
  $("photoLightboxImage").alt = label;
  $("photoLightboxLabel").textContent = label;
  $("photoLightbox").classList.remove("hidden");
  $("closePhotoLightbox").focus();
}

function closePhotoLightbox() {
  $("photoLightbox").classList.add("hidden");
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
      const data = await request("/api/login", { method: "POST", body: JSON.stringify({ name, pin }) });
      $("identityError").textContent = "";
      if (data.role === "admin") {
        state.adminToken = data.token;
        await loadAdminDashboard();
        $("identityView").classList.add("hidden");
        $("adminDashboard").classList.remove("hidden");
      } else {
        state.memberId = data.member.id;
        applyDashboard(data);
        state.showAllRecords = false;
        state.selectedCalendarDate = "";
        $("identityView").classList.add("hidden");
        $("dashboard").classList.remove("hidden");
      }
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
  renderCalendar();
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

function renderCalendar() {
  const now = new Date(state.serverNow);
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingDays = (new Date(year, month, 1).getDay() + 6) % 7;
  const recordsByDate = new Map();
  state.records.filter((record) => {
    const date = new Date(record.start);
    return date.getFullYear() === year && date.getMonth() === month;
  }).forEach((record) => {
    const date = inputDate(record.start);
    if (!recordsByDate.has(date)) recordsByDate.set(date, []);
    recordsByDate.get(date).push(record);
  });
  const availableDates = [...recordsByDate.keys()].sort();
  if (!state.selectedCalendarDate || !recordsByDate.has(state.selectedCalendarDate)) state.selectedCalendarDate = availableDates.at(-1) || "";
  $("calendarSummary").textContent = availableDates.length ? `本月有 ${availableDates.length} 个训练日；已选 ${state.selectedCalendarDate ? formatDate(`${state.selectedCalendarDate}T00:00:00`) : "最近记录"}。` : "本月暂无已完成的实训记录。完成签到后会自动显示在日历中。";
  const weekdays = ["一", "二", "三", "四", "五", "六", "日"].map((day) => `<span class="calendar-weekday">${day}</span>`).join("");
  const blanks = Array.from({ length: leadingDays }, () => '<span class="calendar-blank" aria-hidden="true"></span>').join("");
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const records = recordsByDate.get(date) || [];
    const minutes = records.reduce((total, record) => total + (new Date(record.end) - new Date(record.start)) / 60000, 0);
    const active = date === state.selectedCalendarDate;
    return `<button class="calendar-day${records.length ? " has-record" : ""}${active ? " is-selected" : ""}" type="button" data-calendar-date="${date}" ${records.length ? "" : "disabled"} aria-label="${month + 1}月${day}日${records.length ? `，${records.length} 条实训记录，共 ${formatMinutes(minutes)}` : "，无实训记录"}"><strong>${day}</strong>${records.length ? `<span>${formatMinutes(minutes)}</span><i aria-hidden="true"></i>` : ""}</button>`;
  }).join("");
  $("trainingCalendar").innerHTML = weekdays + blanks + days;
  const selectedRecords = recordsByDate.get(state.selectedCalendarDate) || [];
  const selectedMinutes = selectedRecords.reduce((total, record) => total + (new Date(record.end) - new Date(record.start)) / 60000, 0);
  $("calendarDetail").innerHTML = selectedRecords.length ? `<header><div><h3>${formatDate(`${state.selectedCalendarDate}T00:00:00`)}</h3><p>${selectedRecords.length} 条实训记录 · 共 ${formatMinutes(selectedMinutes)}</p></div><div class="calendar-mini-chart" aria-label="当天训练时长 ${formatMinutes(selectedMinutes)}"><i style="--calendar-hours:${Math.min(selectedMinutes / 480, 1)}"></i><span>${formatChartHours(selectedMinutes)}</span></div></header><div class="calendar-record-list">${selectedRecords.map((record) => `<article><div><strong>现场实训记录</strong><p>${formatClock(record.start)} 开始 · ${formatClock(record.end)} 结束</p><span>${formatMinutes((new Date(record.end) - new Date(record.start)) / 60000)}</span></div><div class="calendar-record-media">${adminPhotoButton(record.startPhoto, "开始现场照片")}${adminPhotoButton(record.endPhoto, "结束现场照片")}</div></article>`).join("")}</div>` : '<p class="calendar-empty">选择有蓝点的日期，即可查看当天的实训文字记录和现场照片。</p>';
}

function renderRecords() {
  const records = state.showAllRecords ? state.records : state.records.slice(0, 4);
  $("showAllRecords").textContent = state.showAllRecords ? "收起记录" : `查看全部 (${state.records.length})`;
  $("recordList").innerHTML = records.length ? records.map((record) => {
    const start = new Date(record.start);
    const end = new Date(record.end);
    const day = `${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    return `<article class="record-item"><span class="record-date">${day}</span><div class="record-main"><strong>本次实训记录</strong><p>${formatClock(start)} 开始 · ${formatClock(end)} 结束</p></div><div class="record-times"><span>${formatMinutes((end - start) / 60000)}</span><span class="record-status">正常</span></div><div class="record-media">${adminPhotoButton(record.startPhoto, "开始现场照片")}${adminPhotoButton(record.endPhoto, "结束现场照片")}</div></article>`;
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

$("switchMember").addEventListener("click", () => { state.memberId = null; state.active = null; state.records = []; state.statistics = null; $("dashboard").classList.add("hidden"); $("identityView").classList.remove("hidden"); $("usernameInput").value = ""; $("pinInput").value = ""; $("identityError").textContent = ""; $("usernameInput").focus(); });
$("closeSheet").addEventListener("click", closeSheet);
$("sheetBackdrop").addEventListener("click", closeSheet);
$("photoInput").addEventListener("change", handlePhoto);
$("confirmCheckin").addEventListener("click", confirmCheckin);
$("showAllRecords").addEventListener("click", () => { state.showAllRecords = !state.showAllRecords; renderRecords(); });
$("trainingCalendar").addEventListener("click", (event) => { const day = event.target.closest("button[data-calendar-date]"); if (!day || day.disabled) return; state.selectedCalendarDate = day.dataset.calendarDate; renderCalendar(); });
$("adminLogout").addEventListener("click", leaveAdminDashboard);
$("memberLogout").addEventListener("click", leaveAdminDashboard);
$("adminRecordsLogout").addEventListener("click", leaveAdminDashboard);
$("showAdminOverview").addEventListener("click", showAdminOverview);
$("showAdminRecords").addEventListener("click", () => showAdminRecords());
$("showMemberManagement").addEventListener("click", showMemberManagement);
$("adminMemberRows").addEventListener("click", (event) => {
  const memberId = event.target.dataset.memberId;
  if (memberId && event.target.classList.contains("admin-member-records")) showAdminRecords(memberId);
});
$("adminRecordMemberFilter").addEventListener("change", (event) => { state.adminRecordMemberId = event.target.value; state.adminRecordDate = ""; loadAdminRecords(); });
$("adminRecordDateFilter").addEventListener("change", (event) => { state.adminRecordDate = event.target.value; state.adminRecordPage = 1; renderAdminRecords(); });
$("clearAdminRecordFilters").addEventListener("click", () => { state.adminRecordMemberId = ""; state.adminRecordDate = ""; state.adminRecordPage = 1; state.adminCalendarDate = ""; loadAdminRecords(); });
$("adminRecordCalendar").addEventListener("click", (event) => { const day = event.target.closest("button[data-admin-calendar-date]"); if (!day || day.disabled) return; state.adminCalendarDate = day.dataset.adminCalendarDate; state.adminRecordDate = state.adminCalendarDate; state.adminRecordPage = 1; renderAdminRecords(); });
$("adminRecordPagination").addEventListener("click", (event) => { const button = event.target.closest("button[data-admin-record-page]"); if (!button || button.disabled) return; state.adminRecordPage = Number(button.dataset.adminRecordPage); renderAdminRecords(); });
$("adminDashboard").addEventListener("click", (event) => { const photo = event.target.closest("button[data-photo-url]"); if (photo) openPhotoLightbox(photo.dataset.photoUrl, photo.dataset.photoLabel); });
$("dashboard").addEventListener("click", (event) => { const photo = event.target.closest("button[data-photo-url]"); if (photo) openPhotoLightbox(photo.dataset.photoUrl, photo.dataset.photoLabel); });
$("closePhotoLightbox").addEventListener("click", closePhotoLightbox);
$("photoLightboxBackdrop").addEventListener("click", closePhotoLightbox);
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("photoLightbox").classList.contains("hidden")) closePhotoLightbox(); });
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
