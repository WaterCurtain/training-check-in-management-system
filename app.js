const state = { memberId: null, members: [], action: null, photoData: null, active: null, records: [], statistics: null, serverNow: null, selectedCalendarDate: "", selectedCalendarYear: null, selectedCalendarMonth: null, calendarDraftYear: null, calendarDraftMonth: null, historyPage: 1, submitting: false, adminToken: null, managedMembers: [], editingMemberId: null, memberSaving: false, adminRecords: [], adminRecordMembers: [], adminRecordMemberId: "", adminRecordDraftMemberId: "", adminRecordYear: null, adminRecordMonth: null, adminRecordDraftYear: null, adminRecordDraftMonth: null, adminCalendarDate: "", adminOverviewRecords: [], adminOverviewRecordPage: 1, adminDashboardData: null, adminOverviewYear: null, adminOverviewMonth: null, adminOverviewDraftYear: null, adminOverviewDraftMonth: null, adminTrendRange: "week" };
const ADMIN_RECORDS_PER_PAGE = 10;
const MEMBER_RECORDS_PER_PAGE = 10;
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

function formatAverageDailyComparison(current, previous) {
  const difference = current - previous;
  if (difference === 0) return "较上月持平";
  if (previous === 0) return `较上月新增 ${formatMinutes(current)}`;
  const direction = difference > 0 ? "增加" : "减少";
  const percentage = Math.round((Math.abs(difference) / previous) * 100);
  return `较上月${direction} ${formatMinutes(Math.abs(difference))}（${percentage}%）`;
}

function formatGoalMembersComparison(current, previous) {
  const difference = current - previous;
  if (difference === 0) return "较上月持平";
  if (previous === 0) return `较上月新增 ${current} 人`;
  const direction = difference > 0 ? "增加" : "减少";
  const percentage = Math.round((Math.abs(difference) / previous) * 100);
  return `较上月${direction} ${Math.abs(difference)} 人（${percentage}%）`;
}

function formatRemainingMinutes(minutes) {
  return minutes <= 0 ? "0小时" : formatMinutes(minutes);
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

function chartScaleMax(values, headroom = 1.15) {
  const highest = Math.max(...values, 1);
  return Math.max(30, Math.ceil((highest * headroom) / 30) * 30);
}

function chartLabelIndexes(length, maximum = 7) {
  if (length <= maximum) return Array.from({ length }, (_, index) => index);
  const step = Math.ceil((length - 1) / (maximum - 1));
  const indexes = Array.from({ length }, (_, index) => index).filter((index) => index % step === 0);
  if (indexes.at(-1) !== length - 1) indexes.push(length - 1);
  return indexes;
}

function chartDateLabel(date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", weekday: "short" }).format(new Date(date)).replace(" ", "");
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

function renderBarChart(values, labels, shortLabels = labels) {
  const max = chartScaleMax(values);
  const width = 680;
  const height = 236;
  const plot = { left: 42, right: 14, top: 18, bottom: 33 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const step = plotWidth / values.length;
  const barWidth = Math.max(4, Math.min(16, step * .58));
  const grid = [0, 1 / 3, 2 / 3, 1].map((ratio) => {
    const y = plot.top + plotHeight * (1 - ratio);
    return `<line x1="${plot.left}" x2="${width - plot.right}" y1="${y}" y2="${y}" /><text x="0" y="${y + 4}">${formatChartHours(max * ratio).replace("小时", "")}</text>`;
  }).join("");
  const visibleLabels = new Set(chartLabelIndexes(values.length));
  const bars = values.map((value, index) => {
    const barHeight = value ? Math.max(3, plotHeight * value / max) : 2;
    const x = plot.left + step * index + (step - barWidth) / 2;
    const y = plot.top + plotHeight - barHeight;
    return `<g class="chart-interactive" tabindex="0" data-chart-label="${escapeHtml(labels[index])}" data-chart-value="${formatMinutes(value)}"><title>${labels[index]}：${formatMinutes(value)}</title><rect class="chart-hit-area" x="${plot.left + step * index + step * .08}" y="${plot.top}" width="${step * .84}" height="${plotHeight}" /><rect class="${value ? "chart-bar" : "chart-bar-zero"}" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="${Math.min(3, barWidth / 2)}" />${visibleLabels.has(index) ? `<text class="chart-x-label" x="${x + barWidth / 2}" y="${height - 8}">${shortLabels[index]}</text>` : ""}</g>`;
  }).join("");
  return `<div class="chart-scroll" tabindex="0" aria-label="可左右滚动查看所选月份全部日期"><svg class="training-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="所选月份每日实训时长柱状图。最高单日 ${formatMinutes(Math.max(...values))}"><g class="chart-grid">${grid}</g><g>${bars}</g></svg></div>`;
}

function renderLineChart(values, labels, ariaLabel = "本周训练趋势折线图", shortLabels = labels, headroom = 1.15, compact = false) {
  const max = chartScaleMax(values, headroom);
  const width = compact ? 620 : 520;
  const height = compact ? 172 : 220;
  const plot = compact ? { left: 34, right: 12, top: 12, bottom: 28 } : { left: 38, right: 14, top: 18, bottom: 34 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const pointAt = (value, index) => ({ x: plot.left + plotWidth * index / (values.length - 1), y: plot.top + plotHeight * (1 - value / max) });
  const points = values.map(pointAt);
  const polyline = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const grid = [0, 1 / 3, 2 / 3, 1].map((ratio) => {
    const y = plot.top + plotHeight * (1 - ratio);
    return `<line x1="${plot.left}" x2="${width - plot.right}" y1="${y}" y2="${y}" /><text x="0" y="${y + 4}">${formatChartHours(max * ratio).replace("小时", "")}</text>`;
  }).join("");
  const visibleLabels = new Set(chartLabelIndexes(values.length));
  const hitWidth = Math.max(24, plotWidth / Math.max(values.length - 1, 1) * .9);
  const dots = points.map(({ x, y }, index) => `<g class="chart-interactive" tabindex="0" data-chart-label="${escapeHtml(labels[index])}" data-chart-value="${formatMinutes(values[index])}"><title>${labels[index]}：${formatMinutes(values[index])}</title><rect class="chart-hit-area" x="${Math.max(plot.left, x - hitWidth / 2)}" y="${plot.top}" width="${Math.min(hitWidth, width - plot.right - Math.max(plot.left, x - hitWidth / 2))}" height="${plotHeight}" /><circle class="chart-dot" cx="${x}" cy="${y}" r="4" />${visibleLabels.has(index) ? `<text class="chart-x-label" x="${x}" y="${height - 8}">${shortLabels[index]}</text>` : ""}</g>`).join("");
  return `<svg class="training-chart-svg${compact ? " admin-trend-svg" : ""}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${ariaLabel}。累计 ${formatMinutes(values.reduce((total, value) => total + value, 0))}"><g class="chart-grid">${grid}</g><polyline class="chart-line" points="${polyline}" />${dots}</svg>`;
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
  const now = new Date();
  if (state.adminOverviewYear === null) state.adminOverviewYear = now.getFullYear();
  if (state.adminOverviewMonth === null) state.adminOverviewMonth = now.getMonth();
  const query = `?year=${state.adminOverviewYear}&month=${state.adminOverviewMonth + 1}`;
  const data = await request(`/api/admin/overview${query}`, { headers: { Authorization: `Bearer ${state.adminToken}` } });
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
  $("memberManagementRows").innerHTML = state.managedMembers.map((member) => `<tr><td><strong>${escapeHtml(member.name)}</strong></td><td>${escapeHtml(member.workshop)}</td><td><span class="admin-status ${member.active ? "admin-status-complete" : "admin-status-muted"}">${member.active ? "正常使用" : "已停用"}</span></td><td class="member-row-actions"><button class="text-button edit-member" data-member-id="${member.id}" type="button">编辑</button><button class="text-button reset-member-pin" data-member-id="${member.id}" type="button">重置 PIN</button>${member.active ? `<button class="text-button disable-member" data-member-id="${member.id}" type="button">停用</button>` : `<button class="text-button delete-member" data-member-id="${member.id}" type="button">删除</button>`}</td></tr>`).join("");
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
    const now = new Date();
    state.adminRecordMemberId = memberId;
    state.adminRecordDraftMemberId = memberId;
    state.adminRecordYear = now.getFullYear();
    state.adminRecordMonth = now.getMonth();
    state.adminRecordDraftYear = state.adminRecordYear;
    state.adminRecordDraftMonth = state.adminRecordMonth;
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
  $("managedMemberPin").value = member ? "" : "123456";
  $("managedMemberPin").required = !member;
  $("managedMemberPinLabel").textContent = member ? "修改 PIN（可选）" : "6 位 PIN";
  $("managedMemberPinHint").textContent = member ? "留空则保留原 PIN；填写时必须为 6 位数字。" : "默认 PIN 为 123456，可按需修改。";
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

async function resetMemberPin(memberId) {
  const member = state.managedMembers.find((item) => item.id === memberId);
  if (!member || !window.confirm(`确认将“${member.name}”的 PIN 重置为 123456 吗？`)) return;
  try {
    await request(`/api/admin/members/${encodeURIComponent(memberId)}/reset-pin`, { method: "POST", headers: adminHeaders() });
    showToast(`“${member.name}”的 PIN 已重置为 123456。`);
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

function renderAdminVisualization(visualization, now) {
  const safeVisualization = visualization || { daily: [], ranking: [], frequency: [], reachedMembers: 0, remainingMembers: 0 };
  const daily = safeVisualization.daily || [];
  const visibleDaily = state.adminTrendRange === "week" ? daily.slice(-7) : daily;
  const total = visibleDaily.reduce((sum, item) => sum + item.minutes, 0);
  const completed = visibleDaily.reduce((sum, item) => sum + (item.count || 0), 0);
  const periodLabel = state.adminTrendRange === "week" ? "近 7 日" : `${state.adminOverviewMonth + 1}月`;
  $("adminDailySummary").textContent = total ? `${periodLabel}累计 ${formatMinutes(total)}，完成 ${completed} 次；最高单日 ${formatMinutes(Math.max(...visibleDaily.map((item) => item.minutes)))}` : `${periodLabel}尚无实训记录`;
  const dailyDates = visibleDaily.map((item) => new Date(state.adminOverviewYear, state.adminOverviewMonth, item.day));
  $("adminTrendRange").querySelectorAll("button").forEach((button) => {
    const active = button.dataset.adminTrendRange === state.adminTrendRange;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const chart = total ? renderLineChart(visibleDaily.map((item) => item.minutes), dailyDates.map(chartDateLabel), `${periodLabel}全员每日实训时长趋势图`, visibleDaily.map((item) => `${item.day}日`), 1.3, true) : '<p class="chart-empty admin-chart-empty">暂无可统计的实训记录。</p>';
  $("adminDailyChart").innerHTML = state.adminTrendRange === "month" && total ? `<div class="chart-scroll admin-trend-scroll" tabindex="0" aria-label="可左右浏览${state.adminOverviewMonth + 1}月全部日期">${chart}</div>` : chart;
  const ranking = safeVisualization.ranking || [];
  const maxRank = Math.max(...ranking.map((item) => item.minutes), 1);
  $("adminRankingChart").innerHTML = ranking.length ? `<div class="admin-chart-list-scroll"><div class="ranking-list">${ranking.map((item, index) => `<div class="ranking-row"><span>${index + 1}</span><strong>${escapeHtml(item.name)}</strong><div><i style="--ranking-progress:${item.minutes / maxRank}"></i></div><em>${formatMinutes(item.minutes)}</em></div>`).join("")}</div></div>` : '<p class="admin-empty">暂无排名数据。</p>';
  const totalMembers = safeVisualization.reachedMembers + safeVisualization.remainingMembers;
  const reachedRatio = totalMembers ? safeVisualization.reachedMembers / totalMembers : 0;
  $("adminAttainmentChart").innerHTML = `<div class="attainment-ring-layout"><div class="attainment-ring" aria-label="已完成 ${safeVisualization.reachedMembers} 人，共 ${totalMembers} 人"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="attainment-ring-track" cx="60" cy="60" r="48" pathLength="100"/><circle class="attainment-ring-value" cx="60" cy="60" r="48" pathLength="100" stroke-dasharray="${reachedRatio * 100} 100"/></svg><strong>${safeVisualization.reachedMembers}<small> / ${totalMembers}人</small></strong></div><div class="attainment-summary"><p>已完成月度目标</p><small><i class="attainment-key reached"></i>达标 ${safeVisualization.reachedMembers} 人　<i class="attainment-key remaining"></i>未达标 ${safeVisualization.remainingMembers} 人</small></div></div>`;
  const frequency = safeVisualization.frequency || [];
  const maxFrequency = Math.max(...frequency.map((item) => item.count), 1);
  $("adminFrequencyChart").innerHTML = frequency.length ? `<div class="admin-chart-list-scroll"><div class="frequency-list">${frequency.map((item) => `<div><span>${escapeHtml(item.name)}</span><i style="--frequency-progress:${item.count / maxFrequency}"></i><strong>${item.count} 次</strong></div>`).join("")}</div></div>` : '<p class="admin-empty">暂无频率数据。</p>';
}

function adminPhotoButton(url, label) {
  return `<button class="record-photo-preview" type="button" data-photo-url="${escapeHtml(url)}" data-photo-label="${escapeHtml(label)}"><img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" /></button>`;
}

function renderAdminRecordCalendar(records) {
  const baseDate = new Date(state.adminRecordYear ?? new Date(records[0]?.start || Date.now()).getFullYear(), state.adminRecordMonth ?? new Date(records[0]?.start || Date.now()).getMonth(), 1);
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
  memberFilter.value = state.adminRecordDraftMemberId;
  const now = new Date();
  const years = [...new Set([now.getFullYear(), ...state.adminRecords.map((record) => new Date(record.start).getFullYear())])].sort((left, right) => right - left);
  $("adminRecordYearFilter").innerHTML = years.map((year) => `<option value="${year}">${year}年</option>`).join("");
  $("adminRecordMonthFilter").innerHTML = Array.from({ length: 12 }, (_, month) => `<option value="${month}">${month + 1}月</option>`).join("");
  $("adminRecordYearFilter").value = state.adminRecordDraftYear ?? now.getFullYear();
  $("adminRecordMonthFilter").value = state.adminRecordDraftMonth ?? now.getMonth();
  const records = state.adminRecords.filter((record) => {
    const date = new Date(record.start);
    return date.getFullYear() === state.adminRecordYear && date.getMonth() === state.adminRecordMonth;
  });
  $("adminRecordFilterSummary").textContent = `当前条件下共 ${records.length} 条已完成实训记录；点击日历日期查看详情。`;
  renderAdminRecordCalendar(records);
}

function renderAdminDashboard(data) {
  state.adminDashboardData = data;
  state.adminOverviewYear = data.selectedYear;
  state.adminOverviewMonth = data.selectedMonth;
  const periodLabel = `${data.selectedYear}年${data.selectedMonth + 1}月`;
  $("adminDate").textContent = formatDate(data.now);
  $("adminMonthMinutes").textContent = formatMinutes(data.summary.averageDailyMinutes);
  $("adminGoalMembers").textContent = `${data.summary.goalReachedMembers} 人`;
  $("adminMonthMinutesComparison").textContent = formatAverageDailyComparison(data.summary.averageDailyMinutes, data.previousSummary.averageDailyMinutes);
  $("adminGoalMembersComparison").textContent = formatGoalMembersComparison(data.summary.goalReachedMembers, data.previousSummary.goalReachedMembers);
  $("adminActiveMembers").textContent = `${data.summary.activeMembers} 人`;
  $("adminCompletedSessions").textContent = `${data.summary.completedSessions} 次`;
  $("adminVisualsTitle").textContent = `${periodLabel}训练数据`;
  $("adminMembersTitle").textContent = `${periodLabel}成员训练进度`;
  $("adminMemberMonthSummary").textContent = `${periodLabel}数据`;
  $("adminMemberMonthColumn").textContent = `${data.selectedMonth + 1}月训练时长`;
  const years = data.availableYears || [data.selectedYear];
  $("adminOverviewYearFilter").innerHTML = years.map((year) => `<option value="${year}">${year}年</option>`).join("");
  $("adminOverviewMonthFilter").innerHTML = Array.from({ length: 12 }, (_, month) => `<option value="${month}">${month + 1}月</option>`).join("");
  $("adminOverviewYearFilter").value = state.adminOverviewDraftYear ?? data.selectedYear;
  $("adminOverviewMonthFilter").value = state.adminOverviewDraftMonth ?? data.selectedMonth;
  $("adminMemberRows").innerHTML = [...data.members].sort((left, right) => {
    const progressDifference = right.monthMinutes / right.goalMinutes - left.monthMinutes / left.goalMinutes;
    return progressDifference || right.monthMinutes - left.monthMinutes || left.name.localeCompare(right.name, "zh-CN");
  }).map((member) => {
    const ratio = Math.min(member.monthMinutes / member.goalMinutes, 1);
    const progressPercent = Math.min(100, Math.round(member.monthMinutes / member.goalMinutes * 100));
    const status = member.active ? "实训中" : member.monthMinutes >= member.goalMinutes ? "已达标" : "未达标";
    const statusClass = member.active ? "admin-status-active" : member.monthMinutes >= member.goalMinutes ? "admin-status-complete" : "admin-status-pending";
    return `<tr data-member-search="${escapeHtml(`${member.name} ${member.workshop}`.toLocaleLowerCase("zh-CN"))}"><td><strong>${escapeHtml(member.name)}</strong></td><td>${escapeHtml(member.workshop)}</td><td>${formatMinutes(member.monthMinutes)} · ${member.monthCount} 次</td><td><div class="admin-progress"><span style="--admin-progress:${ratio}"></span></div><small>${progressPercent}%</small></td><td><span class="admin-status ${statusClass}">${status}</span></td><td><button class="text-button admin-member-records" data-member-id="${escapeHtml(member.id)}" type="button">查看记录</button></td></tr>`;
  }).join("");
  renderAdminVisualization(data.visualization, data.now);
  state.adminOverviewRecords = data.recentRecords;
  const pages = Math.max(1, Math.ceil(data.recentRecords.length / ADMIN_RECORDS_PER_PAGE));
  state.adminOverviewRecordPage = Math.min(state.adminOverviewRecordPage, pages);
  const start = (state.adminOverviewRecordPage - 1) * ADMIN_RECORDS_PER_PAGE;
  const pageRecords = data.recentRecords.slice(start, start + ADMIN_RECORDS_PER_PAGE);
  $("adminRecords").innerHTML = pageRecords.length ? pageRecords.map((record) => `<article class="admin-record"><div><strong>${escapeHtml(record.memberName)} <span class="admin-record-workshop">${escapeHtml(record.workshop || "未设置车间")}</span></strong><p>${formatDate(record.start)} · ${formatClock(record.start)} 至 ${formatClock(record.end)} · ${formatMinutes((new Date(record.end) - new Date(record.start)) / 60000)}</p></div><div class="admin-record-photos">${adminPhotoButton(record.startPhoto, `${record.memberName}的开始现场照片`)}${adminPhotoButton(record.endPhoto, `${record.memberName}的结束现场照片`)}</div></article>`).join("") : '<p class="admin-empty">暂无已完成的实训记录。成员完成一次开始和结束签到后，记录会显示在这里。</p>';
  $("adminOverviewRecordPagination").innerHTML = data.recentRecords.length > ADMIN_RECORDS_PER_PAGE ? `<span>第 ${state.adminOverviewRecordPage} / ${pages} 页</span><div><label class="pagination-jump">跳至 <input id="adminOverviewRecordPageInput" type="number" min="1" max="${pages}" value="${state.adminOverviewRecordPage}" inputmode="numeric" data-admin-overview-page-input aria-label="跳转到第几页" /> 页</label><button class="text-button pagination-jump-button" data-admin-overview-page-jump="${pages}" type="button">跳转</button><button class="text-button" data-admin-overview-page="${state.adminOverviewRecordPage - 1}" type="button" ${state.adminOverviewRecordPage === 1 ? "disabled" : ""}>上一页</button><button class="text-button" data-admin-overview-page="${state.adminOverviewRecordPage + 1}" type="button" ${state.adminOverviewRecordPage === pages ? "disabled" : ""}>下一页</button></div>` : "";
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
        state.selectedCalendarDate = "";
        const serverDate = new Date(data.now);
        state.selectedCalendarYear = serverDate.getFullYear();
        state.selectedCalendarMonth = serverDate.getMonth();
        state.calendarDraftYear = state.selectedCalendarYear;
        state.calendarDraftMonth = state.selectedCalendarMonth;
        state.historyPage = 1;
        applyDashboard(data);
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
  const now = new Date(state.serverNow);
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  const complete = stats.monthMinutes >= stats.goalMinutes;
  const ratio = Math.min(stats.monthMinutes / stats.goalMinutes, 1);
  $("todayTime").textContent = formatMinutes(stats.todayMinutes);
  $("weekTime").textContent = formatMinutes(stats.weekMinutes);
  $("monthCount").textContent = `${stats.monthCount} 次`;
  $("summaryTitle").textContent = `${monthLabel}训练进度`;
  $("monthCountLabel").textContent = `${monthLabel}实训次数`;
  $("progressTrack").setAttribute("aria-label", `${monthLabel}训练完成进度`);
  $("progressText").innerHTML = `${formatMinutes(stats.monthMinutes)} <span>/ ${formatMinutes(stats.goalMinutes)}</span>`;
  $("completedTime").textContent = formatMinutes(stats.monthMinutes);
  $("remainingTime").textContent = formatRemainingMinutes(stats.goalMinutes - stats.monthMinutes);
  const status = $("goalStatus");
  status.textContent = complete ? "已达标" : "未达标";
  status.className = complete ? "success-text" : "warning-text";
  $("progressBar").style.setProperty("--progress", ratio);
}

function renderAnalytics() {
  renderDailyTrainingChart();
  renderWeeklyAndMonthlySummary();
}

function renderDailyTrainingChart() {
  const now = new Date(state.serverNow);
  const year = state.selectedCalendarYear ?? now.getFullYear();
  const month = state.selectedCalendarMonth ?? now.getMonth();
  const monthStart = new Date(year, month, 1);
  const records = chartRecords();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const monthValues = chartRange(records, monthStart, isCurrentMonth ? now.getDate() : new Date(year, month + 1, 0).getDate(), now);
  const monthTotal = monthValues.reduce((total, value) => total + value, 0);
  const monthActiveDays = monthValues.filter(Boolean).length;
  const monthDates = monthValues.map((_, index) => new Date(year, month, index + 1));
  $("dailyChartTitle").textContent = `${year}年${month + 1}月每日实训时长`;
  $("dailyChartSummary").textContent = monthTotal ? `${year}年${month + 1}月共 ${monthActiveDays} 个训练日，累计 ${formatMinutes(monthTotal)}` : `${year}年${month + 1}月暂无实训数据`;
  $("dailyTrainingChart").innerHTML = monthTotal ? renderBarChart(monthValues, monthDates.map(chartDateLabel), monthDates.map((date) => `${date.getDate()}日`)) : `<p class="chart-empty">${year}年${month + 1}月还没有可统计的实训记录。完成一次实训后，时长会按日期显示在这里。</p>`;
}

function renderWeeklyAndMonthlySummary() {
  const now = new Date(state.serverNow);
  const monday = startOfDay(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekValues = chartRange(records, monday, 7, now);
  const weekTotal = weekValues.reduce((total, value) => total + value, 0);
  const weekDates = weekValues.map((_, index) => { const date = new Date(monday); date.setDate(monday.getDate() + index); return date; });
  $("weeklyChartSummary").textContent = weekTotal ? `本周累计 ${formatMinutes(weekTotal)}` : "本周暂无实训数据";
  $("weeklyTrainingChart").innerHTML = weekTotal ? renderLineChart(weekValues, weekDates.map(chartDateLabel), "本周训练趋势折线图", weekDates.map((date) => `周${["日", "一", "二", "三", "四", "五", "六"][date.getDay()]}`)) : '<p class="chart-empty">本周还没有可统计的实训记录。</p>';

  const stats = state.statistics;
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  const ratio = Math.min(stats.monthMinutes / stats.goalMinutes, 1);
  $("trainingInsightTitle").textContent = `${monthLabel}累计进度`;
  $("trainingInsightValue").textContent = `${Math.round(ratio * 100)}%`;
  $("trainingInsightMeta").textContent = stats.monthMinutes >= stats.goalMinutes ? `已完成${monthLabel} 16 小时目标` : `距离${monthLabel}目标还需 ${formatMinutes(stats.goalMinutes - stats.monthMinutes)}`;
  $("trainingInsightText").textContent = `累计 ${formatMinutes(stats.monthMinutes)}，${stats.monthCount} 次实训。`;
}

function renderCalendar() {
  const now = new Date(state.serverNow);
  const year = state.selectedCalendarYear ?? now.getFullYear();
  const month = state.selectedCalendarMonth ?? now.getMonth();
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
  const years = [...new Set([now.getFullYear(), ...state.records.map((record) => new Date(record.start).getFullYear())])].sort((left, right) => right - left);
  $("calendarYear").innerHTML = years.map((item) => `<option value="${item}">${item}年</option>`).join("");
  $("calendarMonth").innerHTML = Array.from({ length: 12 }, (_, index) => `<option value="${index}">${index + 1}月</option>`).join("");
  $("calendarYear").value = state.calendarDraftYear ?? year;
  $("calendarMonth").value = state.calendarDraftMonth ?? month;
  $("trainingCalendar").setAttribute("aria-label", `${year}年${month + 1}月实训日历`);
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
  const recordsInSelectedMonth = state.records.filter((record) => {
    const date = new Date(record.start);
    return date.getFullYear() === state.selectedCalendarYear && date.getMonth() === state.selectedCalendarMonth;
  });
  const pages = Math.max(1, Math.ceil(recordsInSelectedMonth.length / MEMBER_RECORDS_PER_PAGE));
  state.historyPage = Math.min(state.historyPage, pages);
  const startIndex = (state.historyPage - 1) * MEMBER_RECORDS_PER_PAGE;
  const records = recordsInSelectedMonth.slice(startIndex, startIndex + MEMBER_RECORDS_PER_PAGE);
  $("recordList").innerHTML = records.length ? records.map((record) => {
    const start = new Date(record.start);
    const end = new Date(record.end);
    const day = `${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    return `<article class="record-item"><span class="record-date">${day}</span><div class="record-main"><strong>本次实训记录</strong><p>${formatClock(start)} 开始 · ${formatClock(end)} 结束</p></div><div class="record-times"><span>${formatMinutes((end - start) / 60000)}</span><span class="record-status">正常</span></div><div class="record-media">${adminPhotoButton(record.startPhoto, "开始现场照片")}${adminPhotoButton(record.endPhoto, "结束现场照片")}</div></article>`;
  }).join("") : `<p class="empty-records">${state.selectedCalendarYear}年${state.selectedCalendarMonth + 1}月暂无已完成的实训记录。</p>`;
  $("memberRecordPagination").innerHTML = recordsInSelectedMonth.length > MEMBER_RECORDS_PER_PAGE ? `<span>第 ${state.historyPage} / ${pages} 页</span><div><label class="pagination-jump">跳至 <input id="memberRecordPageInput" type="number" min="1" max="${pages}" value="${state.historyPage}" inputmode="numeric" data-member-record-page-input aria-label="跳转到第几页" /> 页</label><button class="text-button pagination-jump-button" data-member-record-page-jump="${pages}" type="button">跳转</button><button class="text-button" type="button" data-member-record-page="${state.historyPage - 1}" ${state.historyPage === 1 ? "disabled" : ""}>上一页</button><button class="text-button" type="button" data-member-record-page="${state.historyPage + 1}" ${state.historyPage === pages ? "disabled" : ""}>下一页</button></div>` : "";
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
$("calendarYear").addEventListener("change", (event) => { state.calendarDraftYear = Number(event.target.value); });
$("calendarMonth").addEventListener("change", (event) => { state.calendarDraftMonth = Number(event.target.value); });
$("applyCalendarMonth").addEventListener("click", () => {
  state.selectedCalendarYear = state.calendarDraftYear;
  state.selectedCalendarMonth = state.calendarDraftMonth;
  state.selectedCalendarDate = "";
  state.historyPage = 1;
  renderDailyTrainingChart();
  renderCalendar();
  renderRecords();
});
$("memberRecordPagination").addEventListener("click", (event) => {
  const jumpButton = event.target.closest("button[data-member-record-page-jump]");
  if (jumpButton) {
    const page = Number($("memberRecordPageInput")?.value);
    const pages = Number(jumpButton.dataset.memberRecordPageJump);
    if (!Number.isInteger(page) || page < 1 || page > pages) return showToast(`请输入 1 至 ${pages} 的页码。`);
    state.historyPage = page;
    return renderRecords();
  }
  const button = event.target.closest("button[data-member-record-page]");
  if (!button || button.disabled) return;
  state.historyPage = Number(button.dataset.memberRecordPage);
  renderRecords();
});
$("memberRecordPagination").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !event.target.matches("[data-member-record-page-input]")) return;
  event.preventDefault();
  $("memberRecordPagination").querySelector("button[data-member-record-page-jump]")?.click();
});
$("trainingCalendar").addEventListener("click", (event) => { const day = event.target.closest("button[data-calendar-date]"); if (!day || day.disabled) return; state.selectedCalendarDate = day.dataset.calendarDate; renderCalendar(); });
$("adminLogout").addEventListener("click", leaveAdminDashboard);
$("memberLogout").addEventListener("click", leaveAdminDashboard);
$("adminRecordsLogout").addEventListener("click", leaveAdminDashboard);
$("showAdminOverview").addEventListener("click", showAdminOverview);
$("showAdminRecords").addEventListener("click", () => showAdminRecords());
$("showMemberManagement").addEventListener("click", showMemberManagement);
$("adminOverviewYearFilter").addEventListener("change", (event) => { state.adminOverviewDraftYear = Number(event.target.value); });
$("adminOverviewMonthFilter").addEventListener("change", (event) => { state.adminOverviewDraftMonth = Number(event.target.value); });
$("applyAdminOverviewMonth").addEventListener("click", () => {
  state.adminOverviewYear = state.adminOverviewDraftYear;
  state.adminOverviewMonth = state.adminOverviewDraftMonth;
  state.adminOverviewRecordPage = 1;
  loadAdminDashboard().catch((error) => showToast(serviceErrorMessage(error)));
});
$("adminTrendRange").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-admin-trend-range]");
  if (!button || !state.adminDashboardData) return;
  state.adminTrendRange = button.dataset.adminTrendRange;
  renderAdminVisualization(state.adminDashboardData.visualization, state.adminDashboardData.now);
});
$("adminMemberRows").addEventListener("click", (event) => {
  const memberId = event.target.dataset.memberId;
  if (memberId && event.target.classList.contains("admin-member-records")) showAdminRecords(memberId);
});
$("adminMemberSearchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const query = $("adminMemberQuery").value.trim().toLocaleLowerCase("zh-CN");
  const rows = [...$("adminMemberRows").rows];
  rows.forEach((row) => row.classList.remove("is-located"));
  if (!query) return showToast("请输入姓名或车间名称。");
  const row = rows.find((item) => item.dataset.memberSearch.includes(query));
  if (!row) return showToast("未找到匹配的成员。");
  row.classList.add("is-located");
  const tableWrap = $("adminMemberTableWrap");
  tableWrap.scrollTo({ top: Math.max(0, row.offsetTop - (tableWrap.clientHeight - row.offsetHeight) / 2), behavior: "smooth" });
});
$("adminRecordMemberFilter").addEventListener("change", (event) => { state.adminRecordDraftMemberId = event.target.value; });
$("adminRecordYearFilter").addEventListener("change", (event) => { state.adminRecordDraftYear = Number(event.target.value); });
$("adminRecordMonthFilter").addEventListener("change", (event) => { state.adminRecordDraftMonth = Number(event.target.value); });
$("applyAdminRecordFilters").addEventListener("click", () => {
  const memberChanged = state.adminRecordMemberId !== state.adminRecordDraftMemberId;
  state.adminRecordMemberId = state.adminRecordDraftMemberId;
  state.adminRecordYear = state.adminRecordDraftYear;
  state.adminRecordMonth = state.adminRecordDraftMonth;
  state.adminCalendarDate = "";
  if (memberChanged) loadAdminRecords(); else renderAdminRecords();
});
$("clearAdminRecordFilters").addEventListener("click", () => { const now = new Date(); state.adminRecordMemberId = ""; state.adminRecordDraftMemberId = ""; state.adminRecordYear = now.getFullYear(); state.adminRecordMonth = now.getMonth(); state.adminRecordDraftYear = state.adminRecordYear; state.adminRecordDraftMonth = state.adminRecordMonth; state.adminCalendarDate = ""; loadAdminRecords(); });
$("adminRecordCalendar").addEventListener("click", (event) => { const day = event.target.closest("button[data-admin-calendar-date]"); if (!day || day.disabled) return; state.adminCalendarDate = day.dataset.adminCalendarDate; renderAdminRecords(); });
$("adminOverviewRecordPagination").addEventListener("click", (event) => {
  const jumpButton = event.target.closest("button[data-admin-overview-page-jump]");
  if (jumpButton && state.adminDashboardData) {
    const page = Number($("adminOverviewRecordPageInput")?.value);
    const pages = Number(jumpButton.dataset.adminOverviewPageJump);
    if (!Number.isInteger(page) || page < 1 || page > pages) return showToast(`请输入 1 至 ${pages} 的页码。`);
    state.adminOverviewRecordPage = page;
    return renderAdminDashboard(state.adminDashboardData);
  }
  const button = event.target.closest("button[data-admin-overview-page]");
  if (!button || button.disabled || !state.adminDashboardData) return;
  state.adminOverviewRecordPage = Number(button.dataset.adminOverviewPage);
  renderAdminDashboard(state.adminDashboardData);
});
$("adminOverviewRecordPagination").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !event.target.matches("[data-admin-overview-page-input]")) return;
  event.preventDefault();
  $("adminOverviewRecordPagination").querySelector("button[data-admin-overview-page-jump]")?.click();
});
function showChartTooltip(item) {
  const tooltip = $("chartTooltip");
  const rect = item.getBoundingClientRect();
  tooltip.textContent = `${item.dataset.chartLabel} · ${item.dataset.chartValue}`;
  tooltip.style.left = `${Math.min(window.innerWidth - 12, Math.max(12, rect.left + rect.width / 2))}px`;
  tooltip.style.top = `${Math.max(12, rect.top - 10)}px`;
  tooltip.classList.remove("hidden");
  document.querySelectorAll(".chart-interactive.is-highlighted").forEach((element) => element.classList.remove("is-highlighted"));
  item.classList.add("is-highlighted");
}
function hideChartTooltip() {
  $("chartTooltip").classList.add("hidden");
  document.querySelectorAll(".chart-interactive.is-highlighted").forEach((element) => element.classList.remove("is-highlighted"));
}
document.addEventListener("pointerover", (event) => { const item = event.target.closest(".chart-interactive"); if (item) showChartTooltip(item); });
document.addEventListener("focusin", (event) => { const item = event.target.closest(".chart-interactive"); if (item) showChartTooltip(item); });
document.addEventListener("pointerout", (event) => { if (event.target.closest(".chart-interactive") && !event.relatedTarget?.closest(".chart-interactive")) hideChartTooltip(); });
document.addEventListener("focusout", (event) => { if (event.target.closest(".chart-interactive")) hideChartTooltip(); });
let chartScrollDrag = null;
function clearChartScrollDrag(event) {
  if (!chartScrollDrag || (event?.pointerId !== undefined && event.pointerId !== chartScrollDrag.pointerId)) return;
  const { scroller } = chartScrollDrag;
  chartScrollDrag = null;
  scroller.classList.remove("is-dragging");
  document.body.classList.remove("is-chart-dragging");
}
document.addEventListener("pointerdown", (event) => {
  const scroller = event.target.closest(".admin-trend-scroll");
  if (!scroller || event.pointerType !== "mouse" || event.button !== 0 || scroller.scrollWidth <= scroller.clientWidth) return;
  chartScrollDrag = { scroller, pointerId: event.pointerId, startX: event.clientX, scrollLeft: scroller.scrollLeft, dragging: false };
});
document.addEventListener("pointermove", (event) => {
  if (!chartScrollDrag || event.pointerId !== chartScrollDrag.pointerId) return;
  const distance = event.clientX - chartScrollDrag.startX;
  if (!chartScrollDrag.dragging && Math.abs(distance) < 5) return;
  chartScrollDrag.dragging = true;
  chartScrollDrag.scroller.classList.add("is-dragging");
  document.body.classList.add("is-chart-dragging");
  chartScrollDrag.scroller.scrollLeft = chartScrollDrag.scrollLeft - distance;
});
document.addEventListener("pointerup", clearChartScrollDrag);
document.addEventListener("pointercancel", clearChartScrollDrag);
document.addEventListener("lostpointercapture", clearChartScrollDrag);
window.addEventListener("blur", () => clearChartScrollDrag());
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
  if (event.target.classList.contains("reset-member-pin")) resetMemberPin(memberId);
  if (event.target.classList.contains("disable-member")) disableMember(memberId);
  if (event.target.classList.contains("delete-member")) deleteMember(memberId);
});
setupIdentity();
window.setInterval(renderTimer, 1000);
