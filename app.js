const state = { memberId: null, members: [], action: null, photoData: null, active: null, records: [], statistics: null, serverNow: null, showAllRecords: false, submitting: false, adminToken: null };
const identityKey = "training-checkin-member";
const $ = (id) => document.getElementById(id);

async function request(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "服务暂时不可用，请稍后重试。");
  return data;
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

function populateMembers() {
  $("memberSelect").innerHTML = state.members.map((member) => `<option value="${member.id}">${member.name} · ${member.workshop}</option>`).join("");
  const savedMember = localStorage.getItem(identityKey);
  if (state.members.some((member) => member.id === savedMember)) $("memberSelect").value = savedMember;
}

async function loadDashboard() {
  const data = await request(`/api/members/${encodeURIComponent(state.memberId)}/dashboard`);
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
    const data = await request("/api/members");
    state.members = data.members;
    populateMembers();
  } catch (error) {
    $("identityError").textContent = `无法连接本地服务：${error.message}`;
  }
  $("identityForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const pin = $("pinInput").value.trim();
    if (pin !== "123456") { $("identityError").textContent = "PIN 不正确，请输入演示 PIN：123456。"; return; }
    state.memberId = $("memberSelect").value;
    try {
      await loadDashboard();
      localStorage.setItem(identityKey, state.memberId);
      state.showAllRecords = false;
      $("identityError").textContent = "";
      $("identityView").classList.add("hidden");
      $("dashboard").classList.remove("hidden");
    } catch (error) {
      $("identityError").textContent = `无法加载训练数据：${error.message}`;
    }
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
      $("adminError").textContent = error.message;
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

$("switchMember").addEventListener("click", () => { $("dashboard").classList.add("hidden"); $("identityView").classList.remove("hidden"); $("pinInput").value = ""; $("pinInput").focus(); });
$("closeSheet").addEventListener("click", closeSheet);
$("sheetBackdrop").addEventListener("click", closeSheet);
$("photoInput").addEventListener("change", handlePhoto);
$("confirmCheckin").addEventListener("click", confirmCheckin);
$("showAllRecords").addEventListener("click", () => { state.showAllRecords = !state.showAllRecords; renderRecords(); });
$("adminLogout").addEventListener("click", leaveAdminDashboard);
setupIdentity();
window.setInterval(renderTimer, 1000);
