console.log("script.js loaded");

const API_BASE = "http://127.0.0.1:5000";
const LIMITS = {
  fetchEvents: 2000, fetchAlerts: 2000, dashboardEvents: 50, dashboardAlerts: 50,
  alertsPage: 2000, drSuspicious: 300, drResponses: 2000, drWindow: 5000
};

let currentUser = null, pollTimer = null, demoRunning = false;
let chartTimeline = null, chartAttackDist = null, chartConfidence = null, chartEUSBanner = null;
window._socActions = [];

const USERS = {
  soc:   { pass: "Soc@12345!",   role: "SOC", email: "youremail@gmail.com" },
  cmp:   { pass: "Cmp@12345!",   role: "CMP", email: "youremail@gmail.com" },
  euser: { pass: "Euser@12345!", role: "EUS", email: "youremail@gmail.com" },
}; //write your email 

// ── EUS AWARENESS CAROUSEL ──────────────────────────────────────────────────
const EUS_AWARENESS_CARDS = [
  { cls:"ddos",     icon:"🌐", title:"DDoS Attack — What You Should Know",    text:"If the service feels slow or unavailable, it may be under a traffic overload attack. This is a system-level issue — not your device. Our team is handling it. No action needed from you." },
  { cls:"brute",    icon:"🔐", title:"Brute Force Attack — Protect Your Account", text:"Someone may be trying to guess passwords on the network. Make sure your password is strong (at least 12 characters, mixed case, numbers & symbols). Enable MFA if available." },
  { cls:"phishing", icon:"📧", title:"Phishing Threat — Stay Alert",           text:"Be cautious of suspicious emails or links asking for your credentials. Never click unknown attachments. When in doubt, contact IT before opening anything unusual." },
  { cls:"malware",  icon:"🦠", title:"Malware Risk — Keep Your System Safe",   text:"Avoid downloading files or software from unknown sources. Keep your OS and apps updated. If your device behaves strangely, report it to IT immediately." },
  { cls:"sql",      icon:"💾", title:"Web Attack Detected — Be Careful Online",text:"A backend system is under attack. Avoid entering sensitive information into web forms until the all-clear is given by the security team." },
  { cls:"default",  icon:"🛡️", title:"Security Monitoring Active",             text:"Our systems are running 24/7 to detect and respond to threats automatically. If you notice anything unusual — unexpected logouts, slow systems, strange messages — report it to IT." }
];
let eusCarouselIndex = 0, eusCarouselTimer = null;
const EUS_CARD_DURATION = 12000;

function initEUSCarousel() {
  const carousel = document.getElementById("eusCarousel");
  const dotsEl   = document.getElementById("eusDots");
  if (!carousel || !dotsEl) return;
  carousel.innerHTML = EUS_AWARENESS_CARDS.map((card, i) => `
    <div class="eus-awareness-slide${i===0?" active":""}">
      <div class="eus-awareness-card ${card.cls}">
        <span class="card-icon">${card.icon}</span>
        <div class="card-title">${card.title}</div>
        <div class="card-text">${card.text}</div>
      </div>
    </div>`).join("");
  dotsEl.innerHTML = EUS_AWARENESS_CARDS.map((_,i) =>
    `<span class="${i===0?"active":""}" onclick="goToEUSSlide(${i})"></span>`).join("");
  eusCarouselIndex = 0;
  startEUSCarouselTimer();
}

window.goToEUSSlide = function(index) {
  document.querySelectorAll(".eus-awareness-slide").forEach((s,i) => s.classList.toggle("active", i===index));
  document.querySelectorAll(".eus-carousel-dots span").forEach((d,i) => d.classList.toggle("active", i===index));
  eusCarouselIndex = index;
  startEUSCarouselTimer();
};

function startEUSCarouselTimer() {
  if (eusCarouselTimer) clearInterval(eusCarouselTimer);
  const bar = document.getElementById("eusTimerBar");
  if (bar) {
    bar.style.transition = "none"; bar.style.width = "0%";
    bar.getBoundingClientRect();
    bar.style.transition = `width ${EUS_CARD_DURATION}ms linear`; bar.style.width = "100%";
  }
  eusCarouselTimer = setTimeout(() => window.goToEUSSlide((eusCarouselIndex+1) % EUS_AWARENESS_CARDS.length), EUS_CARD_DURATION);
}

// ── SANITIZE ────────────────────────────────────────────────────────────────
function sanitize(s) {
  return String(s??"").replace(/[&<>"'`;\\]/g, m =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;","`":"&#096;",";":"&#059;","\\":"&#092;"}[m]));
}
const escapeHtml = sanitize;

// ── AUTH ─────────────────────────────────────────────────────────────────────
window.login = async function() {
  const user = document.getElementById("username").value.trim().toLowerCase();
  const pass = document.getElementById("password").value;
  const u = USERS[user];
  if (!u || u.pass !== pass) { alert("Invalid credentials"); return; }
  window._pendingUser = user;
  try {
    const data = await (await fetch(`${API_BASE}/send_otp`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({username:user, email:u.email})
    })).json();
    if (data.status !== "success") { alert("Could not send OTP: " + data.message); return; }
    const demoEl = document.getElementById("mfaDemoCode");
    if (demoEl && data.otp) {
      demoEl.textContent = data.otp;
      let secs = 300;
      const timerEl = document.getElementById("otpTimer");
      if (timerEl) {
        clearInterval(window._otpCountdown);
        window._otpCountdown = setInterval(() => {
          secs--;
          const m = Math.floor(secs/60), s = secs%60;
          timerEl.textContent = `(expires in ${m}:${String(s).padStart(2,"0")})`;
          if (secs <= 0) { clearInterval(window._otpCountdown); timerEl.textContent = "(expired)"; }
        }, 1000);
      }
    }
  } catch(e) { alert("Server error sending OTP."); return; }
  document.getElementById("mfaEmailAddr").textContent = u.email;
  document.getElementById("loginStep1").classList.add("d-none");
  document.getElementById("loginStep2").classList.remove("d-none");
};

window.verifyOTP = async function() {
  const entered = document.getElementById("otpCode").value.trim();
  const username = window._pendingUser;
  try {
    const data = await (await fetch(`${API_BASE}/verify_otp`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({username, otp:entered})
    })).json();
    if (data.status !== "success") { alert(data.message || "Invalid OTP"); return; }
  } catch(e) { alert("Server error verifying OTP."); return; }
  clearInterval(window._otpCountdown);
  const u = USERS[username];
  currentUser = { username, role: u.role };
  document.getElementById("loginPage").classList.add("d-none");
  document.getElementById("app").classList.remove("d-none");
  document.getElementById("roleLabel").textContent = `[${currentUser.role}] ${currentUser.username}`;
  applyRBAC(currentUser.role);
  initCharts();
  startPolling();
};

window.resendOTP = async function() {
  const username = window._pendingUser, u = USERS[username];
  if (!u) { alert("Session lost — please log in again."); return; }
  try {
    const data = await (await fetch(`${API_BASE}/send_otp`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({username, email:u.email})
    })).json();
    if (data.status !== "success") { alert("Resend failed: " + data.message); return; }
    const demoEl = document.getElementById("mfaDemoCode");
    if (demoEl && data.otp) demoEl.textContent = data.otp;
    alert("New code sent to " + u.email);
  } catch(e) { alert("Server error."); }
};

function logout() { stopPolling(); stopDemoGeneratorAPI(); location.reload(); }
window.logout = logout;

// ── RBAC ─────────────────────────────────────────────────────────────────────
function applyRBAC(role) {
  const navMap = { SOC:["dashboard","alerts","reports","dr"], CMP:["reports"], EUS:["dashboard","reports"] };
  const allowed = navMap[role] || ["dashboard"];
  document.querySelectorAll(".sidebar .list-group-item").forEach(btn =>
    btn.classList.toggle("d-none", !allowed.includes(btn.getAttribute("data-page"))));

  if (role !== "SOC")
    ["demoStartBtn","demoStopBtn","btnDataset","btnExportAlerts","btnExportResponses","btnPrintAllAttacks","socConsoleLabel"]
      .forEach(id => document.getElementById(id)?.classList.add("d-none"));

  if (role === "CMP") document.getElementById("cmpConsoleLabel")?.classList.remove("d-none");
  if (role === "EUS") document.getElementById("eusConsoleLabel")?.classList.remove("d-none");

  if (role === "CMP") document.getElementById("btnExportAuditLog")?.classList.remove("d-none");

  if (role === "EUS") {
    ["dashCharts","dashEventsTables","dashSystemOverview"].forEach(id => document.getElementById(id)?.classList.add("d-none"));
    document.getElementById("dashEUSBanner")?.classList.remove("d-none");
    initEUSCarousel();
  }

  if (role === "CMP") {
    ["dashCharts","dashEventsTables","dashSystemOverview","dashEUSBanner"].forEach(id => document.getElementById(id)?.classList.add("d-none"));
    document.getElementById("dashCMPBanner")?.classList.remove("d-none");
  }

  if (role !== "SOC") document.getElementById("btnPrintReport")?.classList.remove("d-none");

  if (role !== "SOC") {
    const style = document.createElement("style");
    style.id = "rbac-col-hide";
    style.textContent = `
      #alertsTableBody tr td:nth-child(8), #alertsTableBody tr td:nth-child(9),
      #alertsPageBody  tr td:nth-child(8), #alertsPageBody  tr td:nth-child(9),
      table th.col-ip-status, table th.col-last-action { display:none !important; }`;
    document.head.appendChild(style);
  }

  // Attach filter change listeners so filters work without relying on HTML onchange
  ["alertsIpFilter","alertsTypeFilter","alertsSeverityFilter","alertsStatusFilter"]
    .forEach(id => document.getElementById(id)?.addEventListener("input",  renderAlertsPage));
  ["alertsSeverityFilter","alertsStatusFilter"]
    .forEach(id => document.getElementById(id)?.addEventListener("change", renderAlertsPage));

  showPage(allowed[0]);
}

// ── DEMO GENERATOR ───────────────────────────────────────────────────────────
function _setDemoUI(running) {
  demoRunning = running;
  document.getElementById("demoStartBtn")?.classList.toggle("d-none",  running);
  document.getElementById("demoStopBtn") ?.classList.toggle("d-none", !running);
}

window.startDemoGeneratorAPI = async function() {
  try {
    const data = await (await fetch(`${API_BASE}/start_demo`, {method:"POST"})).json();
    if (data.status === "success") {
      _setDemoUI(true);
      if (!pollTimer) startPolling();
    } else { alert("Error starting demo: " + data.message); }
  } catch(e) { alert("Could not connect to the backend server."); }
};

// FIX: stop demo always resets UI, even on network error


function stopDemoGeneratorAPI() {
  fetch(API_BASE + "/stop_demo", { method: "POST" })
    .then(res => res.json())
    .then(() => {
      demoRunning = false;
      document.getElementById("demoStartBtn").classList.remove("d-none");
      document.getElementById("demoStopBtn").classList.add("d-none");
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    })
    .catch(err => console.error(err));
}
window.stopDemoGeneratorAPI = stopDemoGeneratorAPI;
// ── PAGE NAV ─────────────────────────────────────────────────────────────────
window.showPage = function(pageName) {
  document.querySelectorAll(".page").forEach(el => el.classList.add("d-none"));
  document.getElementById(`page-${pageName}`)?.classList.remove("d-none");
  document.querySelectorAll(".sidebar .list-group-item").forEach(btn => btn.classList.remove("active"));
  document.querySelector(`.sidebar .list-group-item[data-page="${pageName}"]`)?.classList.add("active");
  if (pageName === "dr")      refreshDR();
  if (pageName === "alerts")  renderAlertsPage();
  if (pageName === "reports") { applyReportHeaders(); applyReportFilters(); }
};

// ── HELPERS ──────────────────────────────────────────────────────────────────
async function fetchJSON(url, opts={}) {
  const r = await fetch(url, opts);
  if (!r.ok) { const t = await r.text(); throw new Error(t || `HTTP ${r.status}`); }
  return r.json();
}

function badgeRisk(risk) {
  const cls = risk==="Critical"?"bg-danger":risk==="High"?"bg-warning text-dark":risk==="Medium"?"bg-info text-dark":"bg-success";
  return `<span class="badge ${cls}">${escapeHtml(risk)}</span>`;
}
function shortTime(ts) { const t = Date.parse(ts); return isNaN(t) ? ts : new Date(t).toLocaleTimeString(); }
function statusBadge(s) {
  return s==="Blocked"
    ? '<span class="badge bg-danger">Blocked</span>'
    : '<span class="badge bg-success">Active</span>';
}
function setApiStatus(ok, text) {
  const b = document.getElementById("apiStatus"); if (!b) return;
  b.classList.remove("bg-secondary","bg-success","bg-danger");
  b.classList.add(ok?"bg-success":"bg-danger");
  b.innerHTML = `<i class="bi bi-circle-fill me-1"></i>${escapeHtml(text)}`;
}
function _dlBlob(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}
function getProtocol(prediction) {
  const p = (prediction||"").toLowerCase();
  if (p.includes("ddos")||p.includes("dos"))           return "TCP/UDP";
  if (p.includes("portscan")||p.includes("port scan")) return "TCP";
  if (p.includes("web attack")||p.includes("sql")||p.includes("xss")) return "HTTP/HTTPS";
  if (p.includes("brute"))                             return "SSH/FTP/HTTP";
  if (p.includes("botnet"))                            return "TCP/HTTP";
  if (p.includes("ftp"))                               return "FTP";
  if (p.includes("smtp")||p.includes("phishing"))      return "SMTP";
  if (p.includes("dns"))                               return "DNS";
  return "TCP/IP";
}

// ── MERGE LOCAL SOC ACTIONS ──────────────────────────────────────────────────
function mergeLocalActions(alerts) {
  if (!window._socActions?.length) return alerts;
  const byIp = {};
  window._socActions.forEach(a => { if (!byIp[a.ip]) byIp[a.ip] = a; });
  return alerts.map(a => {
    const local = byIp[a.src_ip]; if (!local) return a;
    const backendHasAction = a.last_action?.trim();
    const backendTime = Date.parse(a.last_action_time) || 0;
    if (backendHasAction && backendTime >= local.ts) return a;
    return {...a, last_action: local.action, last_action_time: new Date(local.ts).toISOString(),
      ip_status: local.action==="block" ? "Blocked" : a.ip_status||"Active"};
  });
}
function formatLastAction(e) {
  return e.last_action ? (e.last_action + (e.last_action_time ? " ("+shortTime(e.last_action_time)+")" : "")) : "";
}

// ── SHARED: EUS response label ───────────────────────────────────────────────
// FIX: "Auto-Mitigated" replaced with "Flagged — Awaiting SOC Review" everywhere
function eusResponseLabel(a) {
  if (a.last_action === "block")       return "Threat Blocked by SOC";
  if (a.last_action === "rate_limit")  return "Traffic Rate-Limited";
  if (a.last_action === "investigate") return "Under Investigation";
  if (a.last_action === "allow")       return "Reviewed — Marked Safe";
  return "Flagged — Awaiting SOC Review";
}
function eusStatusLabel(a) {
  if (a.ip_status==="Blocked" || a.last_action==="block") return "Resolved";
  if (a.last_action) return "In Progress";
  return "Monitoring";
}

window.manualRefresh = () => pollOnce();

window.exportAlerts = function() {
  const rows = window._lastAlerts || [];
  if (!rows.length) {
    alert("No alerts to export yet.");
    return;
  }

  const cols = [
    "id",
    "timestamp",
    "src_ip",
    "dst_ip",
    "prediction",
    "protocol",          // ✅ NEW
    "confidence",
    "risk",
    "is_attack"
  ];

  const csv = [
    cols.join(","),
    ...rows.map(r =>
      cols.map(c => {
        if (c === "protocol") {
          return JSON.stringify(getProtocol(r.prediction) || "");
        }
        return JSON.stringify(r[c] ?? "");
      }).join(",")
    )
  ].join("\n");

  _dlBlob(
    new Blob([csv], { type: "text/csv" }),
    `alerts_${new Date().toISOString().slice(0,10)}.csv`
  );
};

window.exportResponses = function() {
  const rows = window._lastResponses||[]; if (!rows.length){alert("No response actions to export yet.");return;}
  const cols = ["id","timestamp","ip","action","status","note"];
  const csv  = [cols.join(","),...rows.map(r=>cols.map(c=>JSON.stringify(r[c]??'')).join(","))].join("\n");
  _dlBlob(new Blob([csv],{type:"text/csv"}),`responses_${new Date().toISOString().slice(0,10)}.csv`);
};

window.exportAuditLog = function() {
  const alerts    = mergeLocalActions(window._lastAlerts||[]);
  const responses = window._lastResponses||[];
  const entries = [
    ...alerts.filter(a=>a.last_action?.trim()).map(a=>({
      type:"Alert+Action", timestamp:a.last_action_time||a.timestamp, ip:a.src_ip,
      event:a.prediction, action:a.last_action, severity:a.risk, status:a.ip_status||"Active", framework:"ISO 27001 / NIST"
    })),
    ...responses.map(r=>{
      const rel = alerts.find(a=>a.src_ip===r.ip);
      return {type:"Response",timestamp:r.timestamp,ip:r.ip,event:rel?.prediction||"-",
        action:r.action,severity:rel?.risk||"-",status:r.status,framework:"ISO 27001 / NIST"};
    })
  ].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
  if (!entries.length){alert("No audit entries to export yet.");return;}
  const cols=["type","timestamp","ip","event","action","severity","status","framework"];
  const csv=[cols.join(","),...entries.map(r=>cols.map(c=>JSON.stringify(r[c]??'')).join(","))].join("\n");
  _dlBlob(new Blob([csv],{type:"text/csv"}),`audit_log_${new Date().toISOString().slice(0,10)}.csv`);
};

window.downloadDataset = async function() {
  try { const r = await fetch(`${API_BASE}/live_dataset`); if (r.ok){_dlBlob(await r.blob(),"dataset.csv");return;} } catch(e){}
  const rows = window._lastEvents||[]; if (!rows.length){alert("No data yet — start the Demo Generator first.");return;}
  const cols=["id","timestamp","src_ip","dst_ip","prediction","confidence","risk","is_attack","ip_status"];
  _dlBlob(new Blob([[cols.join(","),...rows.map(r=>cols.map(c=>JSON.stringify(r[c]??'')).join(","))].join("\n")],{type:"text/csv"}),"dataset.csv");
};

// ── CHARTS ───────────────────────────────────────────────────────────────────
function destroyCharts() {
  [chartTimeline,chartAttackDist,chartConfidence,chartEUSBanner].forEach(c=>c?.destroy());
}
function initCharts() {
  destroyCharts();
  const mk = (id,cfg)=>{ const c=document.getElementById(id)?.getContext("2d"); return c?new Chart(c,cfg):null; };
  chartTimeline = mk("chartTimeline",{type:"line",data:{labels:[],datasets:[{label:"Normal",data:[],tension:.25,fill:true},{label:"Threats",data:[],tension:.25,fill:true}]},options:{responsive:true,maintainAspectRatio:false,animation:false,scales:{x:{type:"time",time:{unit:"minute"}},y:{beginAtZero:true}},plugins:{legend:{position:"bottom"},zoom:{zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:"x"},pan:{enabled:true,mode:"x"}}}}});
  chartAttackDist = mk("chartAttackDist",{type:"doughnut",data:{labels:[],datasets:[{label:"Attacks",data:[]}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom"}}}});
  chartConfidence = mk("chartConfidence",{type:"bar",data:{labels:["0-65","65-80","80-90","90-100"],datasets:[{label:"Threat count",data:[0,0,0,0]}]},options:{responsive:true,maintainAspectRatio:false,animation:false,scales:{y:{beginAtZero:true}},plugins:{legend:{position:"bottom"}}}});
  chartEUSBanner = mk("chartBannerTrend",{type:"bar",data:{labels:["Critical","High","Medium","Low"],datasets:[{label:"Threats Detected",data:[0,0,0,0],backgroundColor:["#dc3545","#ffc107","#17a2b8","#28a745"],borderRadius:6,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:400},scales:{y:{beginAtZero:true,ticks:{precision:0,color:"#aaa"},grid:{color:"#333"}},x:{ticks:{color:"#aaa"},grid:{display:false}}},plugins:{legend:{display:false},title:{display:true,text:"Threats by Severity — Live",color:"#eee",font:{size:14}}}}});
}
function updateBannerChart() {
  if (!chartEUSBanner) return;
  const a = window._lastAlerts||[];
  chartEUSBanner.data.datasets[0].data = ["Critical","High","Medium","Low"].map(r=>a.filter(x=>x.risk===r).length);
  chartEUSBanner.update("none");
}

// ── CMP BANNER ───────────────────────────────────────────────────────────────
const CMP_BREACH_THRESHOLD = 10;
function updateCMPBanner(alerts) {
  if (currentUser?.role !== "CMP") return;
  const total=alerts.length, critical=alerts.filter(a=>a.risk==="Critical").length,
        high=alerts.filter(a=>a.risk==="High").length,
        resolved=alerts.filter(a=>a.last_action?.trim()).length, pending=total-resolved;
  const mttrVals = alerts.filter(a=>a.last_action&&a.last_action_time&&a.timestamp)
    .map(a=>{ const d=Date.parse(a.last_action_time)-Date.parse(a.timestamp); return d>0?d/60000:null; })
    .filter(v=>v!==null);
  const avgMTTR = mttrVals.length ? (mttrVals.reduce((s,v)=>s+v,0)/mttrVals.length).toFixed(1) : null;
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  set("cmpKpiTotal",total); set("cmpKpiCritical",critical); set("cmpKpiResolved",resolved);
  set("cmpKpiPending",pending); set("cmpKpiMTTR",avgMTTR?`${avgMTTR}m`:"—");
  const hEl=document.getElementById("cmpHealthStatus"), hIco=document.getElementById("cmpHealthIcon");
  if (hEl && hIco) {
    if (critical > CMP_BREACH_THRESHOLD) {
      hEl.textContent="Critical — Escalation Required"; hEl.className="fw-bold text-danger";
      hIco.className="bi bi-x-octagon-fill text-danger fs-4";
    } else if (critical>0||high>3) {
      hEl.textContent="Elevated Risk — Active Review"; hEl.className="fw-bold text-warning";
      hIco.className="bi bi-exclamation-triangle-fill text-warning fs-4";
    } else {
      hEl.textContent="Compliant — All Systems Normal"; hEl.className="fw-bold text-success";
      hIco.className="bi bi-shield-fill-check text-success fs-4";
    }
  }
  const last24h=Date.now()-86400000, recentCrit=alerts.filter(a=>a.risk==="Critical"&&Date.parse(a.timestamp)>last24h).length;
  const bAlert=document.getElementById("cmpBreachAlert"), bMsg=document.getElementById("cmpBreachMsg");
  if (bAlert && bMsg) {
    if (recentCrit >= CMP_BREACH_THRESHOLD) {
      bAlert.classList.remove("d-none");
      bMsg.textContent=` ${recentCrit} critical incidents in the last 24 hours (threshold: ${CMP_BREACH_THRESHOLD}). Immediate escalation required.`;
    } else bAlert.classList.add("d-none");
  }
  updateBannerChart();
}

// ── KPIs + TABLES ────────────────────────────────────────────────────────────
function updateKPIs(stats) {
  document.getElementById("kpiTotalFlows").textContent   = stats.total_events  ?? 0;
  document.getElementById("kpiThreats").textContent      = stats.total_threats  ?? 0;
  document.getElementById("kpiDevices").textContent      = stats.unique_devices ?? 0;
  document.getElementById("kpiLatestThreat").textContent = stats.latest_threat  ?? "None";

  // ── System Overview ──
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText("modelDevice",   stats.model_device   || stats.device   || "CPU");
  setText("modelLoadedAt", stats.model_loaded_at ? new Date(stats.model_loaded_at).toLocaleString() : (stats.loaded_at ? new Date(stats.loaded_at).toLocaleString() : new Date().toLocaleString()));
}

function renderTables(events, alerts) {
  const isSoc = currentUser?.role === "SOC";
  const mergedAlerts = mergeLocalActions(alerts);

  const eb = document.getElementById("eventsTableBody");
  if (eb) {
    eb.innerHTML = "";
    events.slice(0, LIMITS.dashboardEvents).forEach(e =>
      eb.insertAdjacentHTML("beforeend", `<tr>
        <td>#${e.id}</td><td>${escapeHtml(shortTime(e.timestamp))}</td>
        <td>${escapeHtml(e.src_ip)}</td><td>${escapeHtml(e.dst_ip)}</td>
        <td class="${e.is_attack?"text-danger":"text-success"} fw-semibold">${escapeHtml(e.prediction)}</td>
        <td>${escapeHtml(e.confidence)}%</td><td>${badgeRisk(e.risk)}</td>
      </tr>`));
  }

  const ab = document.getElementById("alertsTableBody");
  if (ab) {
    ab.innerHTML = "";
    mergedAlerts.slice(0, LIMITS.dashboardAlerts).forEach(a =>
      ab.insertAdjacentHTML("beforeend", `<tr>
        <td>#${a.id}</td><td>${escapeHtml(shortTime(a.timestamp))}</td>
        <td>${escapeHtml(a.src_ip)}</td>
        <td class="text-danger fw-semibold">${escapeHtml(a.prediction)}</td>
        <td>${escapeHtml(a.confidence)}%</td><td>${badgeRisk(a.risk)}</td>
        ${isSoc ? `<td>${statusBadge(resolveIpStatus(a))}</td><td>${escapeHtml(formatLastAction(a))}</td>` : ""}
      </tr>`));
  }

  renderAlertsPage();
  renderCMPActions(mergedAlerts);
  renderEUSActions(mergedAlerts);
}

// ── ALERTS PAGE ──────────────────────────────────────────────────────────────
function resolveIpStatus(a) {
  if (a.ip_status?.trim()) return a.ip_status.trim();
  if (a.last_action === "block") return "Blocked";
  return "Active";
}

window.renderAlertsPage = function() {
  const isSoc = currentUser?.role === "SOC";
  let rows = mergeLocalActions(window._lastAlerts || []);

  const ipQ     = (document.getElementById("alertsIpFilter")?.value     || "").trim().toLowerCase();
  const typeQ   = (document.getElementById("alertsTypeFilter")?.value    || "").trim().toLowerCase();
  // FIX: severity filter — compare lowercase both sides for reliable matching
  const sevQ    = (document.getElementById("alertsSeverityFilter")?.value|| "").trim().toLowerCase();
  const statusQ = (document.getElementById("alertsStatusFilter")?.value  || "").trim().toLowerCase();

  if (ipQ) {
  rows = rows.filter(a =>
    (a.src_ip || "").toLowerCase().includes(ipQ) ||
    (a.dst_ip || "").toLowerCase().includes(ipQ)
  );
}

if (typeQ) {
  rows = rows.filter(a =>
    (a.prediction || "").toLowerCase().includes(typeQ)
  );
}

if (sevQ) {
  rows = rows.filter(a =>
    (a.risk || "").toLowerCase().trim().includes(sevQ)
  );
}

if (statusQ) {
  rows = rows.filter(a =>
    resolveIpStatus(a).toLowerCase().trim().includes(statusQ)
  );
}
  const countEl = document.getElementById("alertsFilterCount");
  if (countEl) countEl.textContent = `${rows.length} result${rows.length!==1?"s":""}`;

  const apb = document.getElementById("alertsPageBody"); if (!apb) return;
  if (!rows.length) {
    apb.innerHTML = `<tr><td colspan="${isSoc?9:7}" class="text-center text-secondary py-4">
      <i class="bi bi-funnel me-2"></i>No alerts match the current filters.</td></tr>`;
    return;
  }
  apb.innerHTML = "";
  rows.slice(0, LIMITS.alertsPage).forEach(a =>
    apb.insertAdjacentHTML("beforeend", `<tr>
      <td>#${a.id}</td><td>${escapeHtml(a.timestamp)}</td>
      <td>${escapeHtml(a.src_ip)}</td><td>${escapeHtml(a.dst_ip)}</td>
      <td class="text-danger fw-semibold">${escapeHtml(a.prediction)}</td>
      <td>${escapeHtml(a.confidence)}%</td><td>${badgeRisk(a.risk)}</td>
      ${isSoc ? `<td>${statusBadge(resolveIpStatus(a))}</td><td>${escapeHtml(formatLastAction(a))}</td>` : ""}
    </tr>`));
};
const renderAlertsPage = window.renderAlertsPage;

window.clearAlertsFilters = function() {
  ["alertsIpFilter","alertsTypeFilter","alertsSeverityFilter","alertsStatusFilter"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  renderAlertsPage();
};

// ── CMP ACTION FEED ──────────────────────────────────────────────────────────
function renderCMPActions(alerts) {
  const el = document.getElementById("cmpActionFeed"); if (!el) return;
  const fromBackend = alerts.filter(a=>a.last_action?.trim()).map(a=>({time:shortTime(a.timestamp),ip:a.src_ip,action:a.last_action,note:"",threat:a.prediction,status:a.ip_status}));
  const seen = new Set(fromBackend.map(a=>a.ip+"|"+a.action));
  const fromLocal = (window._socActions||[]).filter(a=>!seen.has(a.ip+"|"+a.action))
    .map(a=>({time:a.time,ip:a.ip,action:a.action,note:a.note,threat:"—",status:a.action==="block"?"Blocked":"Active"}));
  const merged = [...fromBackend,...fromLocal].slice(0,50);
  if (!merged.length) { el.innerHTML=`<div class="text-secondary small p-3">No SOC actions recorded yet.</div>`; return; }
  const badgeAction = a=>a==="block"?"bg-danger":a==="rate_limit"?"bg-warning text-dark":a==="investigate"?"bg-info text-dark":"bg-secondary";
  el.innerHTML = `<div class="table-responsive"><table class="table table-dark table-sm table-hover mb-0"><thead><tr><th>Time</th><th>IP</th><th>Threat</th><th>SOC Action</th><th>Note</th><th>Status</th></tr></thead><tbody>
    ${merged.map(a=>`<tr><td>${escapeHtml(a.time)}</td><td class="fw-semibold">${escapeHtml(a.ip)}</td><td class="text-danger small">${escapeHtml(a.threat)}</td><td><span class="badge ${badgeAction(a.action)}">${escapeHtml(a.action)}</span></td><td class="text-secondary small">${escapeHtml(a.note||"—")}</td><td>${statusBadge(a.status)}</td></tr>`).join("")}
  </tbody></table></div>`;
}

// ── EUS ACTION FEED ──────────────────────────────────────────────────────────
function renderEUSActions(alerts) {
  const el = document.getElementById("eusActionFeed"); if (!el) return;
  if (!Array.isArray(alerts)) alerts = [];
  const total=alerts.length, critical=alerts.filter(a=>a.risk==="Critical").length,
        high=alerts.filter(a=>a.risk==="High").length,
        blocked=alerts.filter(a=>(a.ip_status||"").toLowerCase()==="blocked").length;
  const recent=[...alerts].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)).slice(0,8);
  let statusIcon="✅",statusLabel="System Secure",statusColor="#28a745",statusBg="rgba(40,167,69,0.12)";
  if (critical>0){ statusIcon="🚨"; statusLabel="Critical Threats Active"; statusColor="#dc3545"; statusBg="rgba(220,53,69,0.12)"; }
  else if (high>0){ statusIcon="⚠️"; statusLabel="High-Risk Activity Detected"; statusColor="#ffc107"; statusBg="rgba(255,193,7,0.12)"; }
  else if (total>0){ statusIcon="🔍"; statusLabel="Monitoring — Low Risk Activity"; statusColor="#17a2b8"; statusBg="rgba(23,162,184,0.12)"; }
  const iconMap = {
    block:      {icon:"🛡️",label:"Threat Blocked",     cls:"text-danger", desc:"Our security team has blocked this threat."},
    rate_limit: {icon:"⏱️",label:"Traffic Slowed",     cls:"text-warning",desc:"Suspicious traffic has been rate-limited."},
    investigate:{icon:"🔍",label:"Under Investigation",cls:"text-info",   desc:"Our team is actively investigating this activity."},
    allow:      {icon:"✅",label:"Marked Safe",         cls:"text-success",desc:"This activity has been reviewed and allowed."},
  };
  const timelineRows = recent.map(a=>{
    const m=iconMap[a.last_action]||{icon:"📋",label:"Flagged — Awaiting SOC Review",cls:"text-secondary",desc:"Security event recorded and queued for review."};
    const ts=Date.parse(a.timestamp), diff=isNaN(ts)?NaN:Date.now()-ts;
    const ago=isNaN(diff)||diff<0?"just now":diff<60000?`${Math.floor(diff/1000)}s ago`:diff<3600000?`${Math.floor(diff/60000)}m ago`:`${Math.floor(diff/3600000)}h ago`;
    const sc=a.risk==="Critical"?"#dc3545":a.risk==="High"?"#ffc107":a.risk==="Medium"?"#17a2b8":"#28a745";
    return `<div style="display:flex;align-items:flex-start;gap:14px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
      <div style="font-size:22px;margin-top:2px;flex-shrink:0">${m.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="${m.cls}" style="font-weight:600;font-size:13px">${m.label}</span>
          <span style="background:${sc}22;color:${sc};border:1px solid ${sc}44;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:600">${escapeHtml(a.risk||"")}</span>
          <span style="color:#6c757d;font-size:11px;margin-left:auto">${ago}</span>
        </div>
        <div style="color:#adb5bd;font-size:12px;margin-top:3px">${m.desc} — Threat type: <b style="color:#dee2e6">${escapeHtml(a.prediction||"Unknown")}</b></div>
      </div></div>`;
  }).join("");
  el.innerHTML = `
    <div style="background:${statusBg};border:1px solid ${statusColor}44;border-radius:10px;padding:16px 20px;margin-bottom:18px;display:flex;align-items:center;gap:14px">
      <span style="font-size:32px">${statusIcon}</span>
      <div><div style="font-size:16px;font-weight:700;color:${statusColor}">${statusLabel}</div>
      <div style="color:#adb5bd;font-size:12px;margin-top:2px">Last updated: ${new Date().toLocaleTimeString()}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px">
      <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:#dee2e6">${total}</div><div style="font-size:11px;color:#868e96;text-transform:uppercase;margin-top:2px">Total Events</div></div>
      <div style="background:rgba(220,53,69,0.1);border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:#dc3545">${critical}</div><div style="font-size:11px;color:#868e96;text-transform:uppercase;margin-top:2px">Critical</div></div>
      <div style="background:rgba(255,193,7,0.1);border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:#ffc107">${high}</div><div style="font-size:11px;color:#868e96;text-transform:uppercase;margin-top:2px">High Risk</div></div>
      <div style="background:rgba(220,53,69,0.1);border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:#dc3545">${blocked}</div><div style="font-size:11px;color:#868e96;text-transform:uppercase;margin-top:2px">Blocked</div></div>
    </div>
    <div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#adb5bd;line-height:1.6">
      <span style="color:#dee2e6;font-weight:600">What does this mean for you?</span><br>
      ${critical>0?"⚠️ Critical threats detected. SOC analysts are responding. No action required from you.":high>0?"Elevated activity detected. Automated defenses are active. Your data is protected.":total>0?"All detected events are being monitored automatically. Everything is normal.":"No threats detected. Your network environment is clean and secure."}
    </div>
    ${recent.length
      ? `<div style="font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:#6c757d;margin-bottom:8px;font-weight:600">Recent Security Activity</div><div>${timelineRows}</div>`
      : `<div style="text-align:center;color:#6c757d;padding:20px;font-size:13px"><span style="font-size:28px;display:block;margin-bottom:6px">🛡️</span>No security actions recorded yet.</div>`}`;
}

// ── CHARTS UPDATE ────────────────────────────────────────────────────────────
function updateCharts(events, stats, alerts) {
  if (!chartTimeline) return;
  const now=Date.now(), minutes=30, bucketMs=60000;
  const buckets=[];for(let i=minutes-1;i>=0;i--)buckets.push(now-i*bucketMs);
  const nc=new Array(minutes).fill(0), tc=new Array(minutes).fill(0);
  events.forEach(e=>{ const t=Date.parse(e.timestamp);if(isNaN(t))return;const age=now-t;if(age<0||age>minutes*bucketMs)return;const idx=Math.min(minutes-1,Math.floor((minutes*bucketMs-age-1)/bucketMs));if(e.is_attack)tc[idx]++;else nc[idx]++; });
  chartTimeline.data.labels=buckets.map(ms=>new Date(ms));
  chartTimeline.data.datasets[0].data=nc; chartTimeline.data.datasets[1].data=tc;
  chartTimeline.update("none");
  const dist=stats.attack_counts_all||stats.attack_counts||[];
  chartAttackDist.data.labels=dist.map(x=>x.label); chartAttackDist.data.datasets[0].data=dist.map(x=>x.count);
  chartAttackDist.update("none");
  const bands=[0,0,0,0];
  alerts.forEach(a=>{const c=Number(a.confidence)||0;if(c<65)bands[0]++;else if(c<80)bands[1]++;else if(c<90)bands[2]++;else bands[3]++;});
  chartConfidence.data.datasets[0].data=bands; chartConfidence.update("none");
}

// ── REPORTS TABLE ─────────────────────────────────────────────────────────────
function renderReports(stats) {
  const el = document.getElementById("reportTopAttacks"); if (!el) return;
  const dist = stats.attack_counts_all||stats.attack_counts_alerts||stats.attack_counts||[];
  if (!dist.length) { el.innerHTML=`<div class="text-secondary">No alerts yet.</div>`; return; }
  window._lastAttackDist = dist;
  el.innerHTML = `<div class="table-responsive"><table class="table table-dark table-hover align-middle mb-0"><thead><tr><th>Attack Type</th><th>Count</th><th style="min-width:160px">Download</th></tr></thead><tbody>
    ${dist.map((d,i)=>`<tr><td class="text-info fw-semibold">${escapeHtml(d.label)}</td><td>${d.count}</td><td><div class="d-flex gap-2 flex-nowrap"><button type="button" class="btn btn-sm btn-info rpt-pdf" data-idx="${i}">&#128196; PDF</button><button type="button" class="btn btn-sm btn-secondary rpt-csv" data-idx="${i}">&#128196; CSV</button></div></td></tr>`).join("")}
  </tbody></table></div>`;
  el.onclick = e => {
    const pdfBtn=e.target.closest(".rpt-pdf"), csvBtn=e.target.closest(".rpt-csv");
    if (pdfBtn){ const l=(window._lastAttackDist||[])[+pdfBtn.dataset.idx]?.label; if(l) window.downloadAttackReport(l); }
    if (csvBtn){ const l=(window._lastAttackDist||[])[+csvBtn.dataset.idx]?.label; if(l) window.downloadAttackEvidence(l); }
  };
}

// ── SOC ADVICE ────────────────────────────────────────────────────────────────
function getSOCAdvice(label="") {
  const key = label.toLowerCase().trim();
  const adviceMap = {
    "portscan":    {icon:"🔭",title:"Port Scan Detected",severity:"medium",what:"Attacker is probing open ports to map your network — typically reconnaissance before an attack.",immediate:["Block the source IP if multiple high-confidence scans detected.","Check firewall logs for scan scope.","Cross-reference source IP with threat intel (AbuseIPDB, Shodan)."],medium:["Audit and close any unexpected exposed ports.","Enable port-scan rate limiting on border routers.","Escalate to Tier 2 if production servers were targeted."],longterm:["Implement network segmentation to reduce exposed attack surface.","Deploy honeypots on unused IPs.","Tune IDS/IPS thresholds to match your baseline."]},
    "ddos":        {icon:"💥",title:"DDoS Attack",severity:"critical",what:"Flood of traffic aiming to exhaust bandwidth or CPU — making services unavailable.",immediate:["Activate upstream scrubbing — contact ISP or CDN (Cloudflare/Akamai).","Rate-limit traffic at the network edge by source IP.","Identify attack vector: volumetric, protocol, or application layer.","Null-route the most aggressive source IPs if ISP mitigation isn't available."],medium:["Scale horizontally behind a load balancer if app resources are targeted.","Enable geo-blocking if attack is geographically concentrated.","Capture a 10–30s packet sample for forensic analysis."],longterm:["Procure dedicated DDoS protection with guaranteed SLAs.","Configure anycast routing to distribute traffic across PoPs.","Establish and rehearse a DDoS runbook."]},
    "dos":         {icon:"⚡",title:"DoS Attack",severity:"high",what:"Single-source attack exhausting target CPU, memory, or connection capacity.",immediate:["Block the source IP at the firewall immediately.","Determine method: connection flood, bandwidth, Slowloris, or resource exhaustion.","Restart affected services; verify failover is active."],medium:["Enable SYN cookies on affected servers.","Apply per-IP connection-rate limiting at host and network layer.","Confirm it's not a scanner generating a false DoS signature."],longterm:["Set up automatic IP reputation blocking with a blacklist feed.","Audit service timeout and connection-queue configs.","Test failover and auto-scaling under simulated load."]},
    "web attack":  {icon:"🕸️",title:"Web Application Attack",severity:"high",what:"Exploiting web vulnerabilities — SQLi, XSS, LFI, or command injection.",immediate:["Identify attack type from payload signature (SQLi, XSS, path traversal).","Block the IP at WAF or reverse proxy.","Check logs for signs of successful exploitation (unexpected 200 OK responses).","If SQLi suspected, audit DB query logs for unauthorized queries."],medium:["Enable WAF blocking rules for the detected category (OWASP CRS).","Review the targeted code path for parameterized query enforcement.","Scan for similar vulnerable endpoints across the application."],longterm:["Schedule a penetration test or DAST scan.","Enforce parameterized queries in code review requirements.","Implement CSP headers to mitigate XSS impact."]},
    "brute force": {icon:"🔑",title:"Brute Force Attack",severity:"high",what:"Systematically attempting password combinations to gain unauthorized access.",immediate:["Lock accounts after 5–10 failed attempts in a rolling 5-minute window.","Block the source IP immediately.","Check for any successful login after repeated failures — this is a compromise indicator.","Force password reset for any compromised account."],medium:["Enforce MFA on all internet-facing login interfaces immediately.","Deploy CAPTCHA or progressive delay on login endpoints.","Check affected usernames against leaked credential databases (HIBP)."],longterm:["Implement account lockout policies across all auth services.","Migrate SSH to key-based auth only — disable password auth.","Subscribe to threat intelligence feeds for leaked credential monitoring."]},
    "botnet":      {icon:"🤖",title:"Botnet Activity",severity:"critical",what:"A host may be compromised and communicating with a C2 server.",immediate:["Isolate the flagged internal host from the network immediately.","Block all outbound traffic from the host to known C2 indicators.","Identify the physical device via DHCP/DNS logs.","Capture a memory image and disk snapshot for forensics."],medium:["Run a full EDR scan on the isolated host.","Search for lateral movement: unusual internal port scans, SMB traffic, new admin accounts.","Correlate C2 domains with threat intel to identify the malware family."],longterm:["Deploy DNS-layer security (Cisco Umbrella, Cloudflare Gateway) to block C2 callbacks.","Monitor network traffic baseline — botnets exhibit regular beacon intervals.","Enforce application whitelisting on endpoints."]},
  };
  const matched = Object.keys(adviceMap).find(k=>key.includes(k)||k.includes(key));
  if (matched) return adviceMap[matched];
  return {icon:"🔐",title:`Security Alert: ${label}`,severity:"medium",what:`Anomalous network activity matching the "${label}" signature detected by the ML classifier. Manual review required.`,immediate:["Review source IP and destination in the full alert log.","Cross-reference against known threat intel feeds.","Apply a temporary block on the source IP while investigating."],medium:["Escalate to Tier 2 if confidence is above 90%.","Collect and preserve relevant logs: network flows, firewall, application logs."],longterm:["Document the incident and update playbooks.","Review detection rules for tuning opportunities."]};
}

// ── DOWNLOAD ATTACK REPORT (PDF) ─────────────────────────────────────────────
window.downloadAttackReport = function(label) {
  const all = window._lastAlerts || [];
  const f = mergeLocalActions(all).filter(a => a.prediction === label);
  if (!f.length) { alert("No alerts found for: " + label); return; }

  const advice     = getSOCAdvice(label);
  const now        = new Date().toLocaleString();
  const total      = f.length;
  const crit       = f.filter(a => a.risk === "Critical").length;
  const high       = f.filter(a => a.risk === "High").length;

  // Severity banner colour — matches your severityColorMap in the HTML popup
  const severityColorMap = {
    critical: [192, 57,  43],
    high:     [214,137,  16],
    medium:   [ 26,127, 107],
    low:      [ 26,127,  55],
  };
  const bannerRGB = severityColorMap[advice.severity] || [26, 60, 94];
  const navyRGB   = [26, 60, 94];   // your #1a3c5e used everywhere

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  // A4 landscape: 297 × 210 mm

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PAGE 1 — Summary + Evidence Table
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ── Severity-coloured top banner ──────────
doc.setFillColor(...navyRGB);
  doc.rect(0, 0, 297, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  doc.text("SOC Report", 10, 9);
  doc.setFontSize(17); doc.setFont("helvetica", "bold");
  doc.text(label, 10, 20);
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${now}`, 297 - 10, 9,  { align: "right" });
  doc.text(`Records: ${Math.min(total, 500)} of ${total}`, 297 - 10, 16, { align: "right" });
  doc.text("Adversary Shield  |  Confidential", 297 - 10, 22, { align: "right" });

  // ── KPI boxes (total=blue, critical=red, high=amber) ──
  const kpis = [
    { label: "TOTAL ALERTS",   value: total,  bg: [238,242,255], fg: [30,30,180]  },
    { label: "CRITICAL",       value: crit,   bg: [255,240,240], fg: [192,57,43]  },
    { label: "HIGH RISK",      value: high,   bg: [255,248,220], fg: [160,100,0]  },
  ];
  kpis.forEach(({ label: lbl, value: val, bg, fg }, i) => {
    const x = 10 + i * 60;
    doc.setFillColor(...bg); doc.roundedRect(x, 28, 55, 17, 2, 2, "F");
    doc.setTextColor(...fg); doc.setFontSize(19); doc.setFont("helvetica", "bold");
    doc.text(String(val), x + 27.5, 40, { align: "center" });
    doc.setFontSize(7); doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 120);
    doc.text(lbl, x + 27.5, 44, { align: "center" });
  });

  // ── Thin navy divider ─────────────────────
  doc.setDrawColor(...navyRGB); doc.setLineWidth(0.4);
  doc.line(10, 49, 287, 49);

  // ── Section label ─────────────────────────
  doc.setTextColor(...navyRGB); doc.setFontSize(10); doc.setFont("helvetica", "bold");
  doc.text("Alert Evidence Log", 10, 55);

  // ── Evidence table ────────────────────────
  doc.autoTable({
    startY: 58,
    head: [["Report ID", "Timestamp", "Source IP", "Attack Type", "Protocol", "Detection", "Target", "Confidence"]],
    body: f.slice(0, 500).map((a, i) => [
      `SOC-${String(i + 1).padStart(4, "0")}`,
      new Date(a.timestamp).toLocaleString(),
      a.src_ip,
      a.prediction,
      getProtocol(a.prediction),
      "ML-Classifier",
      a.dst_ip || "N/A",
      `${a.confidence}%`,
    ]),
    styles:            { fontSize: 7.5, cellPadding: 2, textColor: [30, 30, 30] },
    headStyles:        { fillColor: navyRGB, textColor: [255,255,255], fontStyle: "bold" },
    alternateRowStyles:{ fillColor: [247, 249, 252] },
    margin:            { left: 10, right: 10 },
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PAGE 2 — SOC Advice (coloured sections)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  doc.addPage();

  // ── Navy top banner for advice page ──────
doc.setFillColor(...navyRGB);
  doc.rect(0, 0, 297, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  doc.text("SOC Report  —  Analyst Recommendations", 10, 9);
  doc.setFontSize(17); doc.setFont("helvetica", "bold");
  doc.text(label, 10, 20);
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  doc.text("Adversary Shield  |  Confidential", 297 - 10, 9,  { align: "right" });
  doc.text(`Generated: ${now}`, 297 - 10, 16, { align: "right" });

  // ── "What is this attack?" block ─────────
  doc.setFillColor(...bannerRGB);
  doc.roundedRect(10, 24, 277, 6, 1, 1, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text("What is this attack?", 14, 28.5);

  doc.setFillColor(250, 245, 245);
  const whatLines = doc.splitTextToSize(advice.what, 269);
  const whatH = whatLines.length * 5 + 6;
  doc.rect(10, 30, 277, whatH, "F");
  doc.setTextColor(40, 40, 40); doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(whatLines, 14, 35);

  // ── Three coloured action sections ───────
  // Immediate = red, Medium-Term = amber, Long-Term = green
  const sections = [
    { title: "Immediate Actions",   items: advice.immediate, headerRGB: [192,57,43],  bodyBg: [255,245,245] },
    { title: "Medium-Term Actions", items: advice.medium,    headerRGB: [160,100,0],  bodyBg: [255,250,235] },
    { title: "Long-Term Actions",   items: advice.longterm,  headerRGB: [26,127,55],  bodyBg: [240,255,245] },
  ];

  let y = 30 + whatH + 6;

  sections.forEach(({ title, items, headerRGB, bodyBg }) => {
    // Coloured section header bar
    doc.setFillColor(...headerRGB);
    doc.roundedRect(10, y, 277, 6, 1, 1, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text(title, 14, y + 4.5);
    y += 6;

    // Tinted body background — calculate height first
    const allLines = items.flatMap(item => doc.splitTextToSize(`• ${item}`, 269));
    const bodyH = allLines.length * 5 + 4;
    doc.setFillColor(...bodyBg);
    doc.rect(10, y, 277, bodyH, "F");

    // Item text
    doc.setTextColor(40, 40, 40); doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
    let ty = y + 5;
    items.forEach(item => {
      const lines = doc.splitTextToSize(`• ${item}`, 269);
      doc.text(lines, 14, ty);
      ty += lines.length * 5;
    });
    y += bodyH + 5;
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Footer on every page
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(200, 200, 210); doc.setLineWidth(0.3);
    doc.line(10, 204, 287, 204);
    doc.setFontSize(7.5); doc.setTextColor(150, 150, 160);
    doc.text("Adversary Shield  |  Confidential  |  SOC Analyst Report", 10, 208);
    doc.text(`Page ${p} of ${pageCount}`, 287, 208, { align: "right" });
  }

  doc.save(`${label.replace(/\s+/g, "_")}_attack_report.pdf`);
};
// ── REPORT HEADERS + ROLE RENDERING ─────────────────────────────────────────
function applyReportHeaders() {
  if (!currentUser) return;
  const role=currentUser.role;
  ["socReportHead","cmpReportHead","eusReportHead"].forEach(id=>document.getElementById(id)?.classList.add("d-none"));
  document.getElementById({SOC:"socReportHead",CMP:"cmpReportHead",EUS:"eusReportHead"}[role])?.classList.remove("d-none");
  const t=document.getElementById("roleReportTitle");
  if(t) t.textContent={SOC:"SOC Analyst Report (Table 5.3)",CMP:"Compliance & Regulatory Report (Table 5.6)",EUS:"End-User Report (Table 5.7)"}[role]||"Report";
  document.getElementById("socReportSection")?.classList.toggle("d-none",role!=="SOC");
  document.getElementById("reportFilters")?.classList.toggle("d-none",role==="SOC");
  const socThead=document.getElementById("socReportThead"); if (!socThead) return;
  if (role==="SOC") {
    socThead.innerHTML=`<tr><th>Report ID</th><th>Timestamp</th><th>Source IP</th><th>Attack Type</th><th>Protocol</th><th>Detection Type</th><th>Target System</th><th>Confidence Score</th></tr>`;
  } else if (role==="CMP") {
    socThead.innerHTML=`<tr><th>Report ID</th><th>Timestamp</th><th>Detection Category</th><th>Applied Security Policy</th><th>Action Taken</th><th>Action Status</th></tr>`;
  } else {
    socThead.innerHTML=`<tr><th>Report ID</th><th>Timestamp</th><th>Threat Summary</th><th>System Response</th><th>Final Status</th></tr>`;
  }
  const sel=document.getElementById("filterAttackType"); if (!sel) return;
  sel.innerHTML=`<option value="">All Types</option>`+["DoS","DDoS","PortScan","Web Attack","Brute Force","Botnet"].map(o=>`<option value="${o}">${o}</option>`).join("");

  const sevSel=document.getElementById("filterSeverity"); if (!sevSel) return;
  sevSel.innerHTML=`<option value="">All Severities</option>`+["Critical","High","Medium","Low"].map(o=>`<option value="${o}">${o}</option>`).join("");
}

window.downloadAllAttacksReport = function() {
  const all = mergeLocalActions(window._lastAlerts || []);
  if (!all.length) { alert("No alert data available yet."); return; }

  const navyRGB = [26, 60, 94];
  const now     = new Date().toLocaleString();
  const total   = all.length;
  const crit    = all.filter(a => a.risk === "Critical").length;
  const high    = all.filter(a => a.risk === "High").length;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // ── Collect unique attack types ──
  const types = [...new Set(all.map(a => a.prediction).filter(Boolean))];

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PAGE 1 — Master Summary
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  doc.setFillColor(...navyRGB);
  doc.rect(0, 0, 297, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  doc.text("SOC Report", 10, 9);
  doc.setFontSize(17); doc.setFont("helvetica", "bold");
  doc.text("All Attacks — Full Summary", 10, 20);
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${now}`, 287, 9,  { align: "right" });
  doc.text(`Total Records: ${total}`, 287, 16, { align: "right" });
  doc.text("Adversary Shield  |  Confidential", 287, 22, { align: "right" });

  // ── KPI boxes ──
  const kpis = [
    { label: "TOTAL ALERTS",   value: total,        bg: [238,242,255], fg: [30,30,180] },
    { label: "CRITICAL",       value: crit,         bg: [255,240,240], fg: [192,57,43] },
    { label: "HIGH RISK",      value: high,         bg: [255,248,220], fg: [160,100,0] },
    { label: "ATTACK TYPES",   value: types.length, bg: [240,255,245], fg: [26,127,55] },
  ];
  kpis.forEach(({ label: lbl, value: val, bg, fg }, i) => {
    const x = 10 + i * 55;
    doc.setFillColor(...bg); doc.roundedRect(x, 28, 50, 17, 2, 2, "F");
    doc.setTextColor(...fg); doc.setFontSize(18); doc.setFont("helvetica", "bold");
    doc.text(String(val), x + 25, 39, { align: "center" });
    doc.setFontSize(7); doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 120);
    doc.text(lbl, x + 25, 43, { align: "center" });
  });

  // ── Breakdown by attack type ──
  doc.setTextColor(...navyRGB); doc.setFontSize(10); doc.setFont("helvetica", "bold");
  doc.text("Breakdown by Attack Type", 10, 53);

  const typeCounts = {};
  all.forEach(a => { typeCounts[a.prediction] = (typeCounts[a.prediction] || 0) + 1; });
  const typeRows = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [k, v, ((v / total) * 100).toFixed(1) + "%",
      all.filter(a => a.prediction === k && a.risk === "Critical").length,
      all.filter(a => a.prediction === k && a.risk === "High").length,
    ]);

  doc.autoTable({
    startY: 56,
    head: [["Attack Type", "Count", "% of Total", "Critical", "High"]],
    body: typeRows,
    styles:             { fontSize: 8.5, textColor: [30,30,30] },
    headStyles:         { fillColor: navyRGB, textColor: [255,255,255] },
    alternateRowStyles: { fillColor: [247,249,252] },
    margin:             { left: 10, right: 10 },
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ONE SECTION PER ATTACK TYPE
  // Each type: evidence table page + advice page
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
types.forEach(label => {
    const f     = all.filter(a => a.prediction === label);
    const tCrit = f.filter(a => a.risk === "Critical").length;
    const tHigh = f.filter(a => a.risk === "High").length;
    // ── Evidence page ──
    doc.addPage();
    doc.setFillColor(...navyRGB);
    doc.rect(0, 0, 297, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text("SOC Report", 10, 9);
    doc.setFontSize(17); doc.setFont("helvetica", "bold");
    doc.text(label, 10, 20);
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${now}`, 287, 9,  { align: "right" });
    doc.text(`Records: ${f.length}`, 287, 16, { align: "right" });
    doc.text("Adversary Shield  |  Confidential", 287, 22, { align: "right" });

    // KPIs
    const kpisT = [
      { label: "ALERTS",   value: f.length, bg: [238,242,255], fg: [30,30,180]  },
      { label: "CRITICAL", value: tCrit,    bg: [255,240,240], fg: [192,57,43]  },
      { label: "HIGH",     value: tHigh,    bg: [255,248,220], fg: [160,100,0]  },
    ];
    kpisT.forEach(({ label: lbl, value: val, bg, fg }, i) => {
      const x = 10 + i * 60;
      doc.setFillColor(...bg); doc.roundedRect(x, 28, 55, 17, 2, 2, "F");
      doc.setTextColor(...fg); doc.setFontSize(18); doc.setFont("helvetica", "bold");
      doc.text(String(val), x + 27.5, 39, { align: "center" });
      doc.setFontSize(7); doc.setFont("helvetica", "normal");
      doc.setTextColor(100,100,120);
      doc.text(lbl, x + 27.5, 43, { align: "center" });
    });

    doc.setTextColor(...navyRGB); doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text("Alert Evidence Log", 10, 55);

    doc.autoTable({
      startY: 58,
      head: [["Report ID","Timestamp","Source IP","Attack Type","Protocol","Detection","Target","Confidence"]],
      body: f.slice(0, 500).map((a, i) => [
        `SOC-${String(i+1).padStart(4,"0")}`,
        new Date(a.timestamp).toLocaleString(),
        a.src_ip, a.prediction, getProtocol(a.prediction),
        "ML-Classifier", a.dst_ip || "N/A", `${a.confidence}%`,
      ]),
      styles:             { fontSize: 7.5, cellPadding: 2, textColor: [30,30,30] },
      headStyles:         { fillColor: navyRGB, textColor: [255,255,255] },
      alternateRowStyles: { fillColor: [247,249,252] },
      margin:             { left: 10, right: 10 },
    });

});
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Footer on every page
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(200,200,210); doc.setLineWidth(0.3);
    doc.line(10, 204, 287, 204);
    doc.setFontSize(7.5); doc.setTextColor(150,150,160);
    doc.text("Adversary Shield  |  Confidential  |  SOC Analyst Report", 10, 208);
    doc.text(`Page ${p} of ${pageCount}`, 287, 208, { align: "right" });
  }

  doc.save(`SOC_All_Attacks_${new Date().toISOString().slice(0,10)}.pdf`);
};
// ── CMP helpers ───────────────────────────────────────────────────────────────
function cmpCategory(pred) {
  const p=(pred||"").toLowerCase();
  if(p.includes("ddos"))    return "DDoS Attack";
  if(p.includes("dos"))     return "Service Disruption";
  if(p.includes("botnet"))  return "Malware / Botnet Activity";
  if(p.includes("portscan"))return "Reconnaissance (Port Scanning)";
  if(p.includes("web"))     return "Web Application Attack";
  if(p.includes("brute"))   return "Credential Attack (Brute Force)";
  return "Security Event";
}
function cmpPolicy(cat) {
  if(cat.includes("DDoS"))         return "Incident Response Policy (NIST IR-6)";
  if(cat.includes("Service"))      return "Network Protection Policy";
  if(cat.includes("Botnet"))       return "Endpoint Protection Policy";
  if(cat.includes("Reconn"))       return "Network Monitoring Policy";
  if(cat.includes("Web"))          return "Application Security Policy (OWASP)";
  if(cat.includes("Credential"))   return "Access Control Policy (ISO 27001 A.9)";
  return "Security Operations Policy";
}
function cmpAction(a) {
  if(a.last_action==="block")       return "IP Blocked";
  if(a.last_action==="rate_limit")  return "Traffic Rate-Limited";
  if(a.last_action==="investigate") return "Investigation Initiated";
  if(a.last_action)                 return "Monitored";
  return "Reviewed";
}
function cmpStatus(a) {
  if(a.ip_status==="Blocked"||a.last_action==="block") return "Completed";
  if(a.last_action) return "In Progress";
  return "Pending";
}

window.applyReportFilters = function() {
  let f=mergeLocalActions(window._lastAlerts||[]);
  const dF=document.getElementById("filterDateFrom")?.value;
  const dT=document.getElementById("filterDateTo")?.value;
  const ty=(document.getElementById("filterAttackType")?.value||"").toLowerCase();
  const sv=document.getElementById("filterSeverity")?.value||"";
  if (dF) f=f.filter(a=>new Date(a.timestamp)>=new Date(dF));
  if (dT) f=f.filter(a=>new Date(a.timestamp)<=new Date(dT+"T23:59:59"));
  if (ty) f=f.filter(a=>(a.prediction||"").toLowerCase().includes(ty));
  if (sv) f=f.filter(a=>(a.risk||"").toLowerCase()===sv.toLowerCase());
  renderRoleReport(f);
};

function renderRoleReport(alerts=mergeLocalActions(window._lastAlerts||[])) {
  const role=currentUser?.role, el=document.getElementById("roleReportBody"); if (!el) return;
  if (role==="SOC") {
    el.innerHTML=alerts.map((a,i)=>`<tr>
      <td>SOC-${String(i+1).padStart(4,"0")}</td>
      <td>${new Date(a.timestamp).toLocaleString()}</td>
      <td>${escapeHtml(a.src_ip)}</td>
      <td class="text-danger fw-semibold">${escapeHtml(a.prediction)}</td>
      <td class="text-white">${escapeHtml(getProtocol(a.prediction))}</td>
      <td>ML-Classifier</td>
      <td>${escapeHtml(a.dst_ip||"N/A")}</td>
      <td>${escapeHtml(a.confidence)}%</td>
    </tr>`).join("");
  } else if (role==="CMP") {
    el.innerHTML=alerts.map((a,i)=>{ const cat=cmpCategory(a.prediction); return `<tr>
      <td>CMP-${String(i+1).padStart(3,"0")}</td><td>${new Date(a.timestamp).toLocaleString()}</td>
      <td>${escapeHtml(cat)}</td><td>${escapeHtml(cmpPolicy(cat))}</td>
      <td>${escapeHtml(cmpAction(a))}</td><td>${escapeHtml(cmpStatus(a))}</td></tr>`;}).join("");
  } else {
    // FIX: use shared eusResponseLabel — no more "Auto-Mitigated"
    el.innerHTML=alerts.map((a,i)=>`<tr>
      <td>EUS-${String(i+1).padStart(3,"0")}</td><td>${new Date(a.timestamp).toLocaleString()}</td>
      <td>${escapeHtml(a.prediction||"Unknown Threat")}</td>
      <td>${escapeHtml(eusResponseLabel(a))}</td><td>${escapeHtml(eusStatusLabel(a))}</td></tr>`).join("");
  }
}

// ── PRINT REPORT ──────────────────────────────────────────────────────────────
window.printReport = function() {
  const role = currentUser?.role;
  const now  = new Date().toLocaleString();
  const dF   = document.getElementById("filterDateFrom")?.value   || "";
  const dT   = document.getElementById("filterDateTo")?.value     || "";
  const ty   = document.getElementById("filterAttackType")?.value || "";
  const sv   = document.getElementById("filterSeverity")?.value   || "";

  // SOC — still hits your backend endpoint, unchanged
  if (role === "SOC") {
    window.open(`${API_BASE}/generate_report?${new URLSearchParams({ role, dateFrom: dF, dateTo: dT, type: ty, severity: sv })}`, "_blank");
    return;
  }

  let f = mergeLocalActions(window._lastAlerts || []);
  if (!f.length) { alert("No alert data available yet."); return; }
  if (dF) f = f.filter(a => new Date(a.timestamp) >= new Date(dF));
  if (dT) f = f.filter(a => new Date(a.timestamp) <= new Date(dT + "T23:59:59"));
  if (ty) f = f.filter(a => (a.prediction || "").toLowerCase().includes(ty.toLowerCase()));
  if (sv) f = f.filter(a => a.risk === sv);

  const total    = f.length;
  const critical = f.filter(a => a.risk === "Critical").length;
  const high     = f.filter(a => a.risk === "High").length;
  const navyRGB  = [26, 60, 94];  // your #1a3c5e
  const prefix   = role === "CMP" ? "CMP" : "EUS";
  const roleTitle = role === "CMP"
    ? "Compliance & Regulatory Report"
    : "End-User Security Report";

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  // A4 portrait: 210 × 297 mm

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PAGE 1
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ── Navy header banner ────────────────────
  doc.setFillColor(...navyRGB);
  doc.rect(0, 0, 210, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7); doc.setFont("helvetica", "normal");
  doc.text("ADVERSARY SHIELD", 10, 8);
  doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.text(roleTitle, 10, 16);
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  if (dF || dT) doc.text(`Period: ${dF || "—"}  →  ${dT || "—"}`, 10, 21);
  doc.text(`Generated: ${now}`, 200, 9,  { align: "right" });
  doc.text(`Role: ${role}`,     200, 14, { align: "right" });
  doc.text(`Records: ${Math.min(total, 300)} of ${total}`, 200, 19, { align: "right" });

  // ── KPI boxes ─────────────────────────────
  const kpis = [
    { label: "TOTAL ALERTS", value: total,    bg: [238,242,255], fg: [30,30,180]  },
    { label: "CRITICAL",     value: critical, bg: [255,240,240], fg: [192,57,43]  },
    { label: "HIGH RISK",    value: high,     bg: [255,248,220], fg: [160,100,0]  },
  ];
  kpis.forEach(({ label: lbl, value: val, bg, fg }, i) => {
    const x = 10 + i * 64;
    doc.setFillColor(...bg); doc.roundedRect(x, 26, 58, 16, 2, 2, "F");
    doc.setTextColor(...fg); doc.setFontSize(18); doc.setFont("helvetica", "bold");
    doc.text(String(val), x + 29, 37, { align: "center" });
    doc.setFontSize(7); doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 120);
    doc.text(lbl, x + 29, 41, { align: "center" });
  });

  // ── Threat Breakdown ──────────────────────
  const typeCounts = {};
  f.forEach(a => { typeCounts[a.prediction] = (typeCounts[a.prediction] || 0) + 1; });
  const typeRows = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [k, v, ((v / total) * 100).toFixed(1) + "%"]);

  doc.setTextColor(...navyRGB); doc.setFontSize(10); doc.setFont("helvetica", "bold");
  doc.text("Threat Breakdown", 10, 50);

  doc.autoTable({
    startY: 53,
    head: [["Threat Type", "Count", "%"]],
    body: typeRows,
    styles:             { fontSize: 8.5, textColor: [30,30,30] },
    headStyles:         { fillColor: navyRGB, textColor: [255,255,255] },
    alternateRowStyles: { fillColor: [247,249,252] },
    margin:             { left: 10, right: 10 },
    tableWidth:         190,
  });

  // ── Role detail table ─────────────────────
  let detailHead, detailBody;
  if (role === "CMP") {
    detailHead = [["Report ID", "Timestamp", "Detection Category", "Applied Security Policy", "Action Taken", "Status"]];
    detailBody = f.map((a, i) => {
      const cat = cmpCategory(a.prediction);
      return [
        `CMP-${String(i + 1).padStart(4, "0")}`,
        new Date(a.timestamp).toLocaleString(),
        cat, cmpPolicy(cat), cmpAction(a), cmpStatus(a),
      ];
    });
  } else {
    detailHead = [["Report ID", "Timestamp", "Threat Summary", "System Response", "Final Status"]];
    detailBody = f.map((a, i) => [
      `EUS-${String(i + 1).padStart(4, "0")}`,
      new Date(a.timestamp).toLocaleString(),
      a.prediction, eusResponseLabel(a), eusStatusLabel(a),
    ]);
  }

  const sectionLabel = role === "CMP" ? "Compliance Detail" : "Security Event Log";
  doc.setTextColor(...navyRGB); doc.setFontSize(10); doc.setFont("helvetica", "bold");
  doc.text(sectionLabel, 10, doc.lastAutoTable.finalY + 8);

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 11,
    head:   detailHead,
    body:   detailBody,
    styles:             { fontSize: 7.5, cellPadding: 2, textColor: [30,30,30] },
    headStyles:         { fillColor: navyRGB, textColor: [255,255,255] },
    alternateRowStyles: { fillColor: [247,249,252] },
    margin:             { left: 10, right: 10 },
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Footer on every page
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(200, 200, 210); doc.setLineWidth(0.3);
    doc.line(10, 287, 200, 287);
    doc.setFontSize(7.5); doc.setTextColor(150,150,160);
    doc.text(`Adversary Shield  |  Confidential  |  ${roleTitle}`, 10, 291);
    doc.text(`Page ${p} of ${pageCount}  |  Generated by ${role} — ${now}`, 200, 291, { align: "right" });
  }

  doc.save(`${prefix}_report_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ── POLLING ───────────────────────────────────────────────────────────────────
async function pollOnce() {
  try {
    await fetchJSON(`${API_BASE}/health`); setApiStatus(true,"Online");
    const [stats,events,alerts] = await Promise.all([
      fetchJSON(`${API_BASE}/stats?top=20&events_window=5000&alerts_window=5000`),
      fetchJSON(`${API_BASE}/events?limit=${LIMITS.fetchEvents}`),
      fetchJSON(`${API_BASE}/alerts?limit=${LIMITS.fetchAlerts}`)
    ]);
    window._lastEvents=events; window._lastAlerts=alerts;
    try { window._lastResponses=await fetchJSON(`${API_BASE}/responses?limit=2000`); } catch(e){}
    updateKPIs(stats); updateCharts(events,stats,alerts);
    renderTables(events,alerts); renderReports(stats);
    updateBannerChart(); updateCMPBanner(mergeLocalActions(alerts));
    if (!document.getElementById("page-dr")?.classList.contains("d-none"))      refreshDR();
    if (!document.getElementById("page-reports")?.classList.contains("d-none")) applyReportFilters();
  } catch(e) { console.error(e); setApiStatus(false,"Offline"); }
}
function startPolling() { stopPolling(); pollOnce(); pollTimer=setInterval(pollOnce,2000); }
function stopPolling()  { clearInterval(pollTimer); pollTimer=null; }

// ── DETECTION & RESPONSE ─────────────────────────────────────────────────────
window.refreshDR = async function() {
  try {
    const minCount       = Number(document.getElementById("drMinCount")?.value || 1);
    const minConf        = Number(document.getElementById("drMinConf")?.value || 0);
    const risksVal       = document.getElementById("drRisks")?.value || "";
    const includeBlocked = document.getElementById("drIncludeBlocked")?.checked;
    const ipQ            = (document.getElementById("drIpFilter")?.value || "").trim().toLowerCase();

    const [sus, resp] = await Promise.all([
      fetchJSON(`${API_BASE}/suspicious_ips?limit=${LIMITS.drSuspicious}&window=${LIMITS.drWindow}&min_count=${encodeURIComponent(minCount)}&min_conf=${encodeURIComponent(minConf)}&risks=${encodeURIComponent(risksVal)}&include_blocked=${includeBlocked ? "1" : "0"}`),
      fetchJSON(`${API_BASE}/responses?limit=${LIMITS.drResponses}`)
    ]);

    // Front-end safety filtering (in case backend ignores query params)
    let filtered = Array.isArray(sus) ? [...sus] : [];

    // Min count filter
    filtered = filtered.filter(r => Number(r.count) >= minCount);

    // Min confidence filter
    filtered = filtered.filter(r => Number(r.max_confidence) >= minConf);

    // Risk level filter
    if (risksVal) {
      const allowedRisks = risksVal.split(",").map(s => s.trim().toLowerCase());
      filtered = filtered.filter(r => allowedRisks.includes((r.latest_risk || "").toLowerCase()));
    }

    // Include blocked filter
    if (!includeBlocked) {
      filtered = filtered.filter(r => {
        const status = (r.ip_status || r.status || "").toLowerCase();
        return status !== "blocked";
      });
    }

    // IP search filter
    if (ipQ) {
      filtered = filtered.filter(r => (r.ip || "").toLowerCase().includes(ipQ));
    }

    const countEl = document.getElementById("drResultCount");
    if (countEl) countEl.textContent = `${filtered.length} IP${filtered.length !== 1 ? "s" : ""}`;

    renderSuspiciousIPs(filtered);
    renderResponseLog(resp);
  } catch(e) { console.error("refreshDR:", e); }
};
const refreshDR = window.refreshDR;

window.clearDRFilters = function() {
  ({drMinCount:"1",drMinConf:"0",drRisks:"",drIpFilter:""})
  Object.entries({drMinCount:"1",drMinConf:"0",drRisks:"",drIpFilter:""})
    .forEach(([id,val])=>{ const el=document.getElementById(id);if(el)el.value=val; });
  const cb=document.getElementById("drIncludeBlocked"); if(cb) cb.checked=false;
  refreshDR();
};

function renderSuspiciousIPs(rows) {
  const body=document.getElementById("suspiciousTableBody"); if (!body) return;
  if (!rows.length){ body.innerHTML=`<tr><td colspan="7" class="text-center text-secondary py-3">No suspicious IPs match the current filters.</td></tr>`; return; }
  body.innerHTML=rows.map(r=>`<tr>
    <td class="fw-semibold">${escapeHtml(r.ip)}</td><td>${r.count}</td>
    <td class="text-danger">${escapeHtml(r.latest_prediction)}</td>
    <td>${badgeRisk(r.latest_risk)}</td><td>${Number(r.max_confidence).toFixed(2)}%</td>
    <td>${statusBadge(r.ip_status||r.status)}</td>
    <td><div class="d-flex flex-wrap gap-2">
      <button class="btn btn-sm btn-outline-danger"  data-ip="${escapeHtml(r.ip)}" data-action="block">Block</button>
      <button class="btn btn-sm btn-outline-warning" data-ip="${escapeHtml(r.ip)}" data-action="rate_limit">Rate-limit</button>
      <button class="btn btn-sm btn-outline-info"    data-ip="${escapeHtml(r.ip)}" data-action="investigate">Investigate</button>
      <button class="btn btn-sm btn-outline-light"   data-ip="${escapeHtml(r.ip)}" data-action="allow">Allow</button>
    </div></td></tr>`).join("");
  body.onclick = e => { const btn=e.target.closest("button[data-action]"); if(btn) takeAction(btn.dataset.ip,btn.dataset.action); };
}

function renderResponseLog(rows) {
  const body=document.getElementById("responseLogBody"); if (!body) return;
  body.innerHTML=rows.slice(0,LIMITS.drResponses).map(r=>`<tr>
    <td>#${r.id}</td><td>${escapeHtml(shortTime(r.timestamp))}</td>
    <td>${escapeHtml(r.ip)}</td><td class="fw-semibold">${escapeHtml(r.action)}</td>
    <td>${statusBadge(r.status)}</td></tr>`).join("");
}

window.takeAction = async function(ip, action) {
  try {
    const note=prompt(`Optional note for "${action}" on ${ip}:`,"")??"";
    const ts=Date.now();
    window._socActions.unshift({time:new Date(ts).toLocaleTimeString(),ip,action,note,ts});
    await fetchJSON(`${API_BASE}/response_action`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ip,action,note})});
    await refreshDR(); await pollOnce();
  } catch(e){ console.error(e); alert("Action failed."); }
};
const takeAction = window.takeAction;

// ── KEYBOARD SHORTCUTS ────────────────────────────────────────────────────────
window.addEventListener("keydown", e => {
  const lp=document.getElementById("loginPage");
  if (e.key==="Enter" && lp && !lp.classList.contains("d-none"))
    document.getElementById("loginStep2")?.classList.contains("d-none")===false ? verifyOTP() : login();
});