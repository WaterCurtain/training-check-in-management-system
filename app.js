const members = {
  zhangwei: { name: "张伟", workshop: "仪控维修一组", baseline: 820, week: 260, count: 8 },
  liang: { name: "李昂", workshop: "电气维修二组", baseline: 610, week: 185, count: 6 },
  wangyu: { name: "王宇", workshop: "自动化实训组", baseline: 735, week: 220, count: 7 },
};

const state = { memberId: null, action: null, photoData: null, active: null, activeByMember: {}, records: [], showAllRecords: false };
const storageKey = "training-checkin-prototype-v1";
const $ = (id) => document.getElementById(id);

function readStore() {
  try { return JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { return {}; }
}
function writeStore(activeByMember, records) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ memberId: state.memberId, activeByMember, records }));
    return true;
  } catch {
    return false;
  }
}
function formatMinutes(minutes) {
  const value = Math.max(0, Math.round(minutes));
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (!hours) return `${mins}分钟`;
  return mins ? `${hours}小时${mins}分钟` : `${hours}小时`;
}
function formatClock(date) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(date);
}
function validRecords() { return state.records.filter((record) => record.memberId === state.memberId); }
function completedRecords() { return validRecords().filter((record) => record.end); }
function currentMember() { return members[state.memberId]; }
function showToast(message) { const toast = $("toast"); toast.textContent = message; toast.classList.remove("hidden"); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.add("hidden"), 2800); }
function sessionRecords() {
  const records = completedRecords();
  return state.active && state.active.memberId === state.memberId ? [...records, { ...state.active, end: new Date().toISOString() }] : records;
}
function minutesInRange(record, rangeStart, rangeEnd) {
  const start = new Date(record.start).getTime();
  const end = new Date(record.end).getTime();
  return Math.max(0, Math.round((Math.min(end, rangeEnd.getTime()) - Math.max(start, rangeStart.getTime())) / 60000));
}
function startOfDay(date) { const result = new Date(date); result.setHours(0, 0, 0, 0); return result; }

function setupIdentity() {
  const saved = readStore();
  if (saved.memberId && members[saved.memberId]) {
    $("memberSelect").value = saved.memberId;
  }
  $("identityForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const pin = $("pinInput").value.trim();
    if (pin !== "123456") { $("identityError").textContent = "PIN 不正确，请输入演示 PIN：123456。"; return; }
    state.memberId = $("memberSelect").value;
    const data = readStore();
    state.activeByMember = data.activeByMember || (data.active ? { [data.memberId]: data.active } : {});
    state.active = state.activeByMember[state.memberId] || null;
    state.records = data.records || [];
    state.showAllRecords = false;
    $("identityError").textContent = "";
    $("identityView").classList.add("hidden"); $("dashboard").classList.remove("hidden");
    render();
  });
}

function render() {
  const member = currentMember();
  if (!member) return;
  $("profileName").textContent = member.name;
  $("welcomeTitle").textContent = `你好，${member.name}`;
  $("workshopLabel").textContent = `${member.workshop} · 安全规范，记录真实`;
  $("todayLabel").textContent = formatDate(new Date());
  renderTrainingHero(); renderStats(); renderRecords();
}

function renderTrainingHero() {
  const active = state.active && state.active.memberId === state.memberId ? state.active : null;
  const hero = $("trainingHero"); const action = $("heroAction");
  hero.classList.toggle("training", Boolean(active));
  if (active) {
    $("statusBadge").textContent = "实训中"; $("statusMeta").textContent = `开始于 ${formatClock(new Date(active.start))}`;
    $("trainingStatusTitle").textContent = "当前正在实训"; $("heroDescription").textContent = "结束时上传现场照片，系统会自动计算本次有效时长。";
    action.innerHTML = '<button id="endTraining" class="primary-button" type="button">结束实训</button>';
    $("endTraining").addEventListener("click", () => openSheet("end"));
  } else {
    $("statusBadge").textContent = "准备就绪"; $("statusMeta").textContent = "尚未开始实训";
    $("trainingStatusTitle").textContent = "今天还没有实训记录"; $("heroDescription").textContent = "开始实训后，请上传现场照片作为本次记录凭证。";
    $("timer").textContent = "00:00:00";
    action.innerHTML = '<button id="startTraining" class="primary-button" type="button">开始实训</button>';
    $("startTraining").addEventListener("click", () => openSheet("start"));
  }
}

function renderTimer() {
  if (!state.active || state.active.memberId !== state.memberId) return;
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(state.active.start).getTime()) / 1000));
  const time = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map((value) => String(value).padStart(2, "0")).join(":");
  $("timer").textContent = time;
}

function renderStats() {
  const member = currentMember(); const records = completedRecords(); const sessions = sessionRecords(); const now = new Date();
  const todayStart = startOfDay(now); const tomorrow = new Date(todayStart); tomorrow.setDate(tomorrow.getDate() + 1);
  const monday = new Date(todayStart); monday.setDate(todayStart.getDate() - ((todayStart.getDay() + 6) % 7));
  const nextMonday = new Date(monday); nextMonday.setDate(nextMonday.getDate() + 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1); const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const totalFor = (start, end) => sessions.reduce((sum, record) => sum + minutesInRange(record, start, end), 0);
  const today = totalFor(todayStart, tomorrow);
  const addedMonth = totalFor(monthStart, nextMonth);
  const addedWeek = totalFor(monday, nextMonday);
  const total = member.baseline + addedMonth; const target = 960; const ratio = Math.min(total / target, 1); const complete = total >= target;
  const monthlyCount = records.filter((record) => new Date(record.start) < nextMonth && new Date(record.end) > monthStart).length;
  $("todayTime").textContent = formatMinutes(today); $("weekTime").textContent = formatMinutes(member.week + addedWeek); $("monthCount").textContent = `${member.count + monthlyCount} 次`;
  $("progressText").innerHTML = `${formatMinutes(total)} <span>/ 16小时</span>`; $("completedTime").textContent = formatMinutes(total); $("remainingTime").textContent = complete ? "已完成" : formatMinutes(target - total);
  const status = $("goalStatus"); status.textContent = complete ? "已达标" : "未达标"; status.className = complete ? "success-text" : "warning-text";
  $("progressBar").style.setProperty("--progress", ratio);
}

function renderRecords() {
  const records = completedRecords().sort((a, b) => new Date(b.start) - new Date(a.start));
  const initial = [
    { start: new Date(Date.now() - 2 * 86400000).setHours(9, 10), end: new Date(Date.now() - 2 * 86400000).setHours(10, 25), placeholder: true },
    { start: new Date(Date.now() - 5 * 86400000).setHours(14, 32), end: new Date(Date.now() - 5 * 86400000).setHours(16, 18), placeholder: true },
  ];
  const allRecords = [...records, ...initial];
  const visible = state.showAllRecords ? allRecords : allRecords.slice(0, 4);
  $("showAllRecords").textContent = state.showAllRecords ? "收起记录" : `查看全部 (${allRecords.length})`;
  $("recordList").innerHTML = visible.map((record) => {
    const start = new Date(record.start); const end = new Date(record.end); const day = `${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    const proof = record.endPhoto ? `<div class="record-media"><img src="${record.startPhoto}" alt="开始现场照片" /><img src="${record.endPhoto}" alt="结束现场照片" /></div>` : '<div class="record-media" aria-label="示例照片凭证"><span>开始</span><span>结束</span></div>';
    return `<article class="record-item"><span class="record-date">${day}</span><div class="record-main"><strong>${record.placeholder ? "历史实训记录（示例）" : "本次实训记录"}</strong><p>${formatClock(start)} 开始 · ${formatClock(end)} 结束</p></div><div class="record-times"><span>${formatMinutes((end - start) / 60000)}</span><span class="record-status">正常</span></div>${proof}</article>`;
  }).join("");
}

function openSheet(action) {
  state.action = action; state.photoData = null; const member = currentMember(); const active = state.active;
  $("sheetEyebrow").textContent = action === "start" ? "开始签到" : "结束签到";
  $("sheetTitle").textContent = action === "start" ? "上传实训现场照片" : "上传结束现场照片";
  $("checkinContext").innerHTML = action === "start" ? `<strong>${member.name}</strong><span>${member.workshop} · ${formatClock(new Date())}</span>` : `<strong>${member.name}</strong><span>开始于 ${formatClock(new Date(active.start))} · ${$("timer").textContent}</span>`;
  $("photoTitle").textContent = action === "start" ? "拍摄或上传开始现场照片" : "拍摄或上传结束现场照片";
  $("photoHint").textContent = "照片为本次签到的必填凭证，可重新选择";
  $("confirmCheckin").textContent = action === "start" ? "确认开始实训" : "确认结束实训";
  $("photoInput").value = ""; $("photoPreview").src = ""; $("photoPreview").classList.add("hidden"); $("photoError").textContent = "";
  $("checkinSheet").classList.remove("hidden"); $("photoInput").focus();
}
function closeSheet() { $("checkinSheet").classList.add("hidden"); state.action = null; state.photoData = null; }
async function handlePhoto(event) {
  const file = event.target.files[0]; if (!file) return;
  if (!file.type.startsWith("image/")) { $("photoError").textContent = "请选择图片文件后再提交。"; return; }
  try {
    const preview = await compressPhoto(file);
    state.photoData = preview; $("photoPreview").src = preview; $("photoPreview").classList.remove("hidden"); $("photoError").textContent = "";
  } catch { $("photoError").textContent = "照片处理失败，请重新选择一张图片。"; }
}
function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const image = new Image(); const source = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(image.width, image.height)); const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(source);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    image.onerror = () => { URL.revokeObjectURL(source); reject(new Error("image-load-failed")); }; image.src = source;
  });
}
function confirmCheckin() {
  if (!state.photoData) { $("photoError").textContent = "请先拍摄或上传一张现场照片。"; return; }
  const now = new Date().toISOString();
  const nextActiveByMember = { ...state.activeByMember }; const nextRecords = [...state.records];
  if (state.action === "start") {
    nextActiveByMember[state.memberId] = { memberId: state.memberId, start: now, startPhoto: state.photoData };
  } else if (state.active) {
    nextRecords.push({ ...state.active, end: now, endPhoto: state.photoData }); delete nextActiveByMember[state.memberId];
  }
  if (!writeStore(nextActiveByMember, nextRecords)) { $("photoError").textContent = "照片存储空间不足，请选择更小的照片后重试。"; return; }
  state.activeByMember = nextActiveByMember; state.records = nextRecords; state.active = nextActiveByMember[state.memberId] || null;
  showToast(state.action === "start" ? "开始实训已记录，计时已开始。" : "结束实训已记录，统计已更新。"); closeSheet(); render();
}

$("switchMember").addEventListener("click", () => { $("dashboard").classList.add("hidden"); $("identityView").classList.remove("hidden"); $("pinInput").value = ""; $("pinInput").focus(); });
$("closeSheet").addEventListener("click", closeSheet); $("sheetBackdrop").addEventListener("click", closeSheet); $("photoInput").addEventListener("change", handlePhoto); $("confirmCheckin").addEventListener("click", confirmCheckin);
$("showAllRecords").addEventListener("click", () => { state.showAllRecords = !state.showAllRecords; renderRecords(); });
setupIdentity(); window.setInterval(() => { renderTimer(); }, 1000);
