// script.js
import { supabase } from "../supabaseClient.js";



// =========================
// Provision temp-password accounts (teacher/supervisor)
// Uses Edge Function: provision_account
// =========================
const TEMP_PASSWORD = "12345678";

async function provisionAccount({ type, name, email, profileId = null, userid = null }) {
  const payload = {
    type,
    name: name || null,
    email,
    profileId,
    userid,
    tempPassword: TEMP_PASSWORD,
  };
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    alert("You are not authenticated.");
    return;
  }
  const { data, error } = await supabase.functions.invoke("provision_account", {
    body: payload,
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
// =========================
// Admin helpers (role cache)
// =========================
let adminEmailSet = new Set();

async function refreshAdminEmailSet() {
  try {
    const { data, error } = await supabase
      .from("admin_info")
      .select("admin_email")
      .limit(10000);
    if (error) throw error;

    adminEmailSet = new Set(
      (data || [])
        .map((r) => (r?.admin_email || "").toLowerCase().trim())
        .filter(Boolean)
    );
  } catch (e) {
    adminEmailSet = new Set();
  }
}

/* =========================
   ADMIN: create profile row only
   ========================= */

async function adminCreateUser(type, email, _password, profile) {
  if (!type) throw new Error("Missing type");
  if (!email) throw new Error("Missing email");

  const lowerType = String(type).toLowerCase();

  if (lowerType === "teacher" || lowerType === "supervisor") {
    const name =
      lowerType === "teacher" ? profile?.teachername :
        lowerType === "supervisor" ? profile?.supervisorname :
          null;

    const profileId =
      lowerType === "teacher" ? (profile?.teacherid ?? null) :
        lowerType === "supervisor" ? (profile?.supervisorid ?? null) :
          null;

    const userid = profile?.userid ?? null;

    await provisionAccount({ type: lowerType, name, email, profileId, userid });
    return;
  }

  if (lowerType === "student") {
    const row = {
      studentno: profile?.studentno,
      studentname: profile?.studentname,
      studentemail: email,
      userid: profile?.userid ?? null,
    };
    const { error } = await supabase.from("student_info").insert(row);
    if (error) throw error;
    return;
  }

  throw new Error("Unsupported type: " + type);
}


/* =========================
   0) Session Guard
   ========================= */
const {
  data: { session },
  error: sessionError,
} = await supabase.auth.getSession();
if (sessionError) console.error("getSession error:", sessionError);
if (!session) {
  window.location.href = "/loginpage/";
}

/* =========================
   ROLE PICKER MODAL
   ========================= */
function injectRolePickerModal() {
  if (document.getElementById("rolePickerModal")) return;
  const modal = document.createElement("div");
  modal.id = "rolePickerModal";
  modal.style.cssText = `
    position:fixed; inset:0; z-index:9999;
    background:rgba(0,0,0,0.75); backdrop-filter:blur(6px);
    display:flex; align-items:center; justify-content:center;
  `;
  modal.innerHTML = `
    <div style="
      background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);
      border:1px solid rgba(255,255,255,0.12);
      border-radius:20px; padding:40px 36px; min-width:340px; max-width:440px;
      box-shadow:0 25px 60px rgba(0,0,0,0.6);
      text-align:center;
    ">
      <div style="font-size:48px; margin-bottom:12px;">👤</div>
      <h2 style="color:#f1f5f9; font-size:22px; font-weight:800; margin:0 0 8px 0;">Choose Your View</h2>
      <p style="color:#94a3b8; font-size:14px; margin:0 0 28px 0;">
        Your account has multiple roles. Which view would you like to use this session?
      </p>
      <div id="rolePickerButtons" style="display:flex; flex-direction:column; gap:12px;"></div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

const ROLE_DISPLAY = {
  admin: { label: "Admin Panel", icon: "🛡️", desc: "Manage users, classes, exams & system settings" },
  supervisor: { label: "Supervisor View", icon: "👔", desc: "Oversee teachers and review exam results" },
  teacher: { label: "Teacher View", icon: "🧑‍🏫", desc: "Upload marks, manage classes & videos" },
};

function showRolePicker(roles) {
  return new Promise((resolve) => {
    const modal = injectRolePickerModal();
    const btnContainer = document.getElementById("rolePickerButtons");
    btnContainer.innerHTML = "";

    roles.forEach((role) => {
      const cfg = ROLE_DISPLAY[role] || { label: role, icon: "👤", desc: "" };
      const btn = document.createElement("button");
      btn.style.cssText = `
        background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15);
        border-radius:12px; padding:16px 20px; cursor:pointer; text-align:left;
        transition:all 0.2s; color:#f1f5f9; display:flex; align-items:center; gap:14px;
        width:100%;
      `;
      btn.innerHTML = `
        <span style="font-size:28px;">${cfg.icon}</span>
        <div>
          <div style="font-weight:700; font-size:16px;">${cfg.label}</div>
          ${cfg.desc ? `<div style="font-size:12px; color:#94a3b8; margin-top:2px;">${cfg.desc}</div>` : ""}
        </div>
      `;
      btn.addEventListener("mouseenter", () => {
        btn.style.background = "rgba(99,102,241,0.25)";
        btn.style.borderColor = "rgba(99,102,241,0.6)";
        btn.style.transform = "translateY(-1px)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "rgba(255,255,255,0.06)";
        btn.style.borderColor = "rgba(255,255,255,0.15)";
        btn.style.transform = "none";
      });
      btn.addEventListener("click", () => {
        modal.remove();
        resolve(role);
      });
      btnContainer.appendChild(btn);
    });
  });
}

/* =========================
   1) Detect user role
   ========================= */
const authUUID = session?.user?.id || "";
const userEmail = (session?.user?.email || "").trim().toLowerCase();
const KNOWN_ADMIN_UUID = "8fd69fbb-90c4-4bf4-bf72-2f8ce7193401";

async function getAdminByEmail(email) {
  try {
    const { data, error } = await supabase
      .from("admin_info")
      .select("adminid, admin_name, admin_email, userid")
      .ilike("admin_email", email)
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

async function getSupervisorRow(uuid, email) {
  try {
    if (uuid) {
      const { data, error } = await supabase
        .from("supervisor_info")
        .select("supervisorid, supervisorname, supervisoremail, userid")
        .eq("auth_user_id", uuid)
        .maybeSingle();
      if (!error && data) return data;
    }
    if (email) {
      const { data, error } = await supabase
        .from("supervisor_info")
        .select("supervisorid, supervisorname, supervisoremail, userid")
        .ilike("supervisoremail", email)
        .maybeSingle();
      if (!error && data) return data;
    }
    return null;
  } catch {
    return null;
  }
}

async function getTeacherRow(uuid, email) {
  try {
    if (uuid) {
      const { data, error } = await supabase
        .from("teacher_info")
        .select("teacherid, teachername, teacheremail, userid")
        .eq("auth_user_id", uuid)
        .maybeSingle();
      if (!error && data) return data;
    }
    if (email) {
      const { data, error } = await supabase
        .from("teacher_info")
        .select("teacherid, teachername, teacheremail, userid")
        .ilike("teacheremail", email)
        .maybeSingle();
      if (!error && data) return data;
    }
    return null;
  } catch {
    return null;
  }
}

const [adminRow, supervisorRow, teacherRow] = await Promise.all([
  getAdminByEmail(userEmail),
  getSupervisorRow(authUUID, userEmail),
  getTeacherRow(authUUID, userEmail),
]);

let allUserRoles = [];
if (authUUID === KNOWN_ADMIN_UUID) allUserRoles.push("admin");
if (adminRow) allUserRoles.push("admin");
if (supervisorRow) allUserRoles.push("supervisor");
if (teacherRow) allUserRoles.push("teacher");

const ROLE_PRIORITY = ["admin", "supervisor", "teacher"];
allUserRoles = [...new Set(allUserRoles)].filter((r) => ROLE_PRIORITY.includes(r));
allUserRoles.sort((a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b));

if (!allUserRoles.length) {
  console.error("Auth debug:", { authUUID, userEmail, adminRow, supervisorRow, teacherRow });
  alert("Your account is not linked to a teacher, supervisor, or admin. Check console for details.");
  await supabase.auth.signOut();
  window.location.href = "/loginpage/";
}

const _forcedRole = sessionStorage.getItem("forceRole");
const _validForced = _forcedRole && allUserRoles.includes(_forcedRole) ? _forcedRole : null;
if (_validForced) sessionStorage.removeItem("forceRole");

let chosenRole;
if (_validForced) {
  chosenRole = _validForced;
} else if (allUserRoles.length > 1) {
  chosenRole = await showRolePicker(allUserRoles);
} else {
  chosenRole = allUserRoles[0];
}

let currentUser = null;
const _lookupUserid = adminRow?.userid || supervisorRow?.userid || teacherRow?.userid;

if (chosenRole === "admin") {
  currentUser = {
    role: "admin",
    id: adminRow?.adminid || null,
    userid: adminRow?.userid || _lookupUserid || null,
    name: adminRow?.admin_name || supervisorRow?.supervisorname || teacherRow?.teachername || "Admin",
    email: userEmail,
    allRoles: allUserRoles,
  };
} else if (chosenRole === "supervisor") {
  if (!supervisorRow) {
    alert("Could not find your supervisor profile. Please contact an admin.");
    await supabase.auth.signOut();
    window.location.href = "/loginpage/";
  }
  currentUser = {
    role: "supervisor",
    id: supervisorRow.supervisorid,
    userid: supervisorRow.userid,
    name: supervisorRow.supervisorname,
    email: supervisorRow.supervisoremail,
    allRoles: allUserRoles,
  };
} else if (chosenRole === "teacher") {
  if (!teacherRow) {
    alert("Could not find your teacher profile. Please contact an admin.");
    await supabase.auth.signOut();
    window.location.href = "/loginpage/";
  }
  currentUser = {
    role: "teacher",
    id: teacherRow.teacherid,
    userid: teacherRow.userid,
    name: teacherRow.teachername,
    email: teacherRow.teacheremail,
    allRoles: allUserRoles,
  };
} else {
  console.error("Unhandled role state:", { chosenRole, adminRow, supervisorRow, teacherRow });
  alert("Something went wrong determining your role. Check console.");
  await supabase.auth.signOut();
  window.location.href = "/loginpage/";
}

/* =========================
   FORCE PASSWORD CHANGE
   ========================= */
function injectForcePasswordModal() {
  if (document.getElementById("forcePasswordModal")) return;
  const modal = document.createElement("div");
  modal.id = "forcePasswordModal";
  modal.style.cssText = `
    position:fixed; inset:0; z-index:10000;
    background:rgba(0,0,0,0.78); backdrop-filter:blur(6px);
    display:flex; align-items:center; justify-content:center;
  `;
  modal.innerHTML = `
    <div style="
      background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);
      border:1px solid rgba(255,255,255,0.12);
      border-radius:20px; padding:26px 22px; width:min(420px,92vw);
      box-shadow:0 25px 60px rgba(0,0,0,0.6);
      color:#f1f5f9;
    ">
      <div style="font-size:34px; margin-bottom:10px;">🔒</div>
      <div style="font-size:18px; font-weight:900; margin-bottom:6px;">Change your password</div>
      <div style="color:#94a3b8; font-size:13px; margin-bottom:14px;">
        This is your first login. You must set a new password to continue.
      </div>
      <div style="display:grid; gap:10px;">
        <input id="fp_new1" type="password" placeholder="New password"
          style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,0.12);
          background:rgba(255,255,255,0.06); color:#f1f5f9; outline:none;" />
        <input id="fp_new2" type="password" placeholder="Confirm new password"
          style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,0.12);
          background:rgba(255,255,255,0.06); color:#f1f5f9; outline:none;" />
        <button id="fp_save"
          style="margin-top:6px; width:100%; padding:10px 12px; border-radius:12px;
          border:none; cursor:pointer; font-weight:900; background:#6366f1; color:white;">
          Save new password
        </button>
        <div id="fp_msg" style="font-size:12px; color:#fca5a5; min-height:16px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

async function fetchMustChangeFlag() {
  const uid = session?.user?.id || "";
  const email = (session?.user?.email || "").trim().toLowerCase();

  if (currentUser.role === "teacher") {
    let q = supabase.from("teacher_info").select("must_change_password, auth_user_id").limit(1);
    if (uid) q = q.eq("auth_user_id", uid);
    else q = q.ilike("teacheremail", email);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return !!data?.must_change_password;
  }

  if (currentUser.role === "supervisor") {
    let q = supabase.from("supervisor_info").select("must_change_password, auth_user_id").limit(1);
    if (uid) q = q.eq("auth_user_id", uid);
    else q = q.ilike("supervisoremail", email);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return !!data?.must_change_password;
  }

  return false;
}

async function setMustChangeFalse() {
  const uid = session?.user?.id || "";

  if (currentUser.role === "supervisor") {
    const { error } = await supabase
      .from("supervisor_info")
      .update({ must_change_password: false, auth_user_id: uid })
      .eq("supervisorid", currentUser.id);
    if (error) throw error;
  }

  if (currentUser.role === "teacher") {
    const { error } = await supabase
      .from("teacher_info")
      .update({ must_change_password: false, auth_user_id: uid })
      .eq("teacherid", currentUser.id);
    if (error) throw error;
  }
}

async function enforcePasswordChangeIfNeeded() {
  if (!(currentUser?.role === "teacher" || currentUser?.role === "supervisor")) return;

  const mustChange = await fetchMustChangeFlag();
  if (!mustChange) return;

  const modal = injectForcePasswordModal();
  const saveBtn = document.getElementById("fp_save");
  const msgEl = document.getElementById("fp_msg");
  const p1 = document.getElementById("fp_new1");
  const p2 = document.getElementById("fp_new2");

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") e.preventDefault();
  }, { capture: true });

  saveBtn.addEventListener("click", async () => {
    msgEl.textContent = "";
    const a = (p1.value || "").trim();
    const b = (p2.value || "").trim();

    if (a.length < 8) { msgEl.textContent = "Password must be at least 8 characters."; return; }
    if (a !== b) { msgEl.textContent = "Passwords do not match."; return; }

    saveBtn.disabled = true;
    const old = saveBtn.textContent;
    saveBtn.textContent = "Saving...";

    try {
      const { error: passErr } = await supabase.auth.updateUser({ password: a });
      if (passErr) throw passErr;
      await setMustChangeFalse();
      modal.remove();
      alert("Password changed ✅ Please log in again.");
      await supabase.auth.signOut();
      window.location.href = "/loginpage/";
    } catch (e) {
      console.error("force password change error:", e);
      msgEl.textContent = "Failed to change password: " + (e?.message || e);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = old;
    }
  });
}

try {
  await enforcePasswordChangeIfNeeded();
} catch (e) {
  console.warn("enforcePasswordChangeIfNeeded failed:", e);
}

/* =========================
   "Switch Role" button
   ========================= */
function injectRoleSwitcher() {
  if (allUserRoles.length <= 1) return;
  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;
  const btn = document.createElement("button");
  btn.id = "switchRoleBtn";
  btn.className = logoutBtn.className;
  btn.innerHTML = `🔄 Switch Role <span style="font-size:11px;opacity:0.7;">(${ROLE_DISPLAY[currentUser.role]?.label || currentUser.role})</span>`;
  btn.style.marginBottom = "8px";
  logoutBtn.parentNode.insertBefore(btn, logoutBtn);
  btn.addEventListener("click", async () => {
    const newRole = await showRolePicker(allUserRoles);
    sessionStorage.setItem("forceRole", newRole);
    window.location.reload();
  });
}

/* =========================
   1.1) Greeting
   ========================= */
const helloTitle = document.getElementById("helloTitle");
if (helloTitle && currentUser) {
  const roleBadge =
    allUserRoles.length > 1
      ? ` <span style="font-size:13px;opacity:0.6;">(${ROLE_DISPLAY[currentUser.role]?.label || currentUser.role})</span>`
      : "";
  helloTitle.innerHTML = `Hi, ${currentUser.name}!${roleBadge}`;
}

/* =========================
   Loading helpers
   ========================= */
const classesLoading = document.getElementById("classesLoading");
const sectionsLoading = document.getElementById("sectionsLoading");
const studentsLoading = document.getElementById("studentsLoading");
const teachersLoading = document.getElementById("teachersLoading");
const teachersGrid = document.getElementById("teachersGrid");
function showLoading(el, text) {
  if (!el) return;
  if (text) el.textContent = text;
  el.classList.remove("hidden");
  el.style.display = "block";
}
function hideLoading(el) {
  if (!el) return;
  el.classList.add("hidden");
  el.style.display = "none";
}

/* =========================
   2) Load classes/sections
   ========================= */
const classesGrid = document.getElementById("classesGrid");
function groupByClass(rows) {
  const map = new Map();
  for (const r of rows) {
    const classId = r.classid;
    const className = r.class_info?.classname ?? `Class ${classId}`;
    const sectionId = r.sectionid;
    const sectionName = r.section_info?.sectionname ?? `Section ${sectionId}`;
    if (!map.has(classId)) map.set(classId, { classId, className, sections: [] });
    const entry = map.get(classId);
    if (!entry.sections.some((s) => s.sectionId === sectionId)) {
      entry.sections.push({ sectionId, sectionName });
    }
  }
  return Array.from(map.values()).map((x) => ({
    ...x,
    sections: x.sections.sort((a, b) => String(a.sectionName).localeCompare(String(b.sectionName))),
  }));
}
async function loadTeacherClasses(teacherId) {
  const { data, error } = await supabase
    .from("teacher_class_section")
    .select(`classid, sectionid, class_info ( classname ), section_info ( sectionname )`)
    .eq("teacherid", teacherId);
  if (error) throw error;
  return data || [];
}
async function loadSupervisorClasses(supervisorId) {
  const { data: links, error: linkErr } = await supabase
    .from("supervisor_teacher")
    .select("teacherid")
    .eq("supervisorid", supervisorId);
  if (linkErr) throw linkErr;
  const teacherIds = (links || []).map((x) => x.teacherid);
  if (!teacherIds.length) return [];
  const { data, error } = await supabase
    .from("teacher_class_section")
    .select(`teacherid, classid, sectionid, class_info ( classname ), section_info ( sectionname )`)
    .in("teacherid", teacherIds);
  if (error) throw error;
  return data || [];
}
async function loadAllClassesSections() {
  const { data, error } = await supabase
    .from("teacher_class_section")
    .select(`teacherid, classid, sectionid, class_info ( classname ), section_info ( sectionname )`);
  if (error) throw error;
  return data || [];
}
function renderClasses(grouped) {
  if (!classesGrid) return;
  classesGrid.innerHTML = "";
  if (!grouped.length) {
    classesGrid.innerHTML = `<div style="color:white; font-weight:700;">No classes found for your account.</div>`;
    return;
  }
  grouped.forEach((g) => {
    const sectionPills = g.sections.map((s) => `<span class="section-pill">${s.sectionName}</span>`).join("");
    const card = document.createElement("article");
    card.className = "class-card clickable";
    card.innerHTML = `
      <div class="card-body">
        <h3 class="card-title">${g.className}</h3>
        <p class="card-subtitle">Sections:</p>
        <div class="sections">${sectionPills}</div>
      </div>
      <div class="card-footer">
        <span class="muted">${g.sections.length} sections</span>
      </div>
    `;
    card.addEventListener("click", () => showSections(g.className, g.classId, g.sections));
    classesGrid.appendChild(card);
  });
}



/* =========================
   Supervisor: My Teachers view
   ========================= */
async function loadSupervisorTeachers(supervisorId) {
  const { data: links, error: linkErr } = await supabase
    .from("supervisor_teacher")
    .select("teacherid")
    .eq("supervisorid", supervisorId);

  if (linkErr) throw linkErr;

  const teacherIds = (links || []).map((x) => x.teacherid).filter(Boolean);
  if (!teacherIds.length) return [];

  const { data: teachers, error: tErr } = await supabase
    .from("teacher_info")
    .select("teacherid, teachername, teacheremail")
    .in("teacherid", teacherIds)
    .order("teachername", { ascending: true });

  if (tErr) throw tErr;
  return teachers || [];
}

// ─── Supervisor: render classes into the dedicated supervisor classes panel ───
function renderSupervisorTeacherClasses(grouped, teacherName) {
  const panel = document.getElementById("supervisorClassesPanel");
  const teachersPanel = document.getElementById("supervisorTeachersPanel");
  const titleEl = document.getElementById("supervisorClassesTitle");
  const grid = document.getElementById("classesGrid2");
  const loadingEl = document.getElementById("classesLoading2");

  if (!panel || !teachersPanel || !grid) return;

  if (titleEl) titleEl.textContent = `${teacherName}'s Classes`;
  teachersPanel.classList.add("hidden");
  panel.classList.remove("hidden");

  grid.innerHTML = "";
  if (!grouped.length) {
    grid.innerHTML = `<div style="color:white; font-weight:700;">No classes found for this teacher.</div>`;
    return;
  }

  grouped.forEach((g) => {
    const sectionPills = g.sections.map((s) => `<span class="section-pill">${s.sectionName}</span>`).join("");
    const card = document.createElement("article");
    card.className = "class-card clickable";
    card.innerHTML = `
      <div class="card-body">
        <h3 class="card-title">${g.className}</h3>
        <p class="card-subtitle">Sections:</p>
        <div class="sections">${sectionPills}</div>
      </div>
      <div class="card-footer">
        <span class="muted">${g.sections.length} sections</span>
      </div>
    `;
    card.addEventListener("click", () => {
      // For supervisors, switch to dashboard view so the sections/students flow is visible
      if (currentUser.role === "supervisor") {
        showView("dashboard");
      }
      showSections(g.className, g.classId, g.sections);
    });
    grid.appendChild(card);
  });
}

function renderSupervisorTeachers(list) {
  if (!teachersGrid) return;
  teachersGrid.innerHTML = "";

  if (!list.length) {
    teachersGrid.innerHTML =
      `<div style="color:white; font-weight:700;">No teachers assigned to your supervisor account.</div>`;
    return;
  }

  list.forEach((t) => {
    const card = document.createElement("article");
    card.className = "class-card clickable";
    card.innerHTML = `
      <div class="card-body">
        <h3 class="card-title">${t.teachername || "Teacher"}</h3>
        <p class="card-subtitle" style="opacity:0.9;">ID: ${t.teacherid}</p>
        <div style="color:#94a3b8; font-size:13px; margin-top:8px;">
          ${t.teacheremail || ""}
        </div>
      </div>
      <div class="card-footer">
        <span class="muted">Open classes</span>
      </div>
    `;

    card.addEventListener("click", async () => {
      try {
        const loadingEl = document.getElementById("classesLoading2");
        showLoading(loadingEl, "Loading teacher classes...");
        const rows = await loadTeacherClasses(t.teacherid);
        hideLoading(loadingEl);
        const grouped = groupByClass(rows);
        renderSupervisorTeacherClasses(grouped, t.teachername || "Teacher");
      } catch (e) {
        console.error("Open teacher classes failed:", e);
        const loadingEl = document.getElementById("classesLoading2");
        hideLoading(loadingEl);
        alert("Failed to load this teacher's classes.");
      }
    });

    teachersGrid.appendChild(card);
  });
}

let _teachersLoadedOnce = false;

async function initSupervisorTeachersView() {
  if (currentUser.role !== "supervisor") return;
  if (_teachersLoadedOnce) return;

  try {
    showLoading(teachersLoading, "Loading teachers...");
    const list = await loadSupervisorTeachers(currentUser.id);
    renderSupervisorTeachers(list);
  } catch (e) {
    console.error("Load supervisor teachers failed:", e);
    if (teachersGrid) {
      teachersGrid.innerHTML = `<div style="color:white; font-weight:900;">Failed to load teachers. Check console.</div>`;
    }
  } finally {
    hideLoading(teachersLoading);
    _teachersLoadedOnce = true;
  }
}
/* =========================
   3) Load students
   ========================= */
async function loadStudents(classId, sectionId) {
  const { data: links, error: linkErr } = await supabase
    .from("student_class_section")
    .select("studentno, classid, sectionid")
    .eq("classid", classId)
    .eq("sectionid", sectionId);
  if (linkErr) throw linkErr;
  const studentNos = (links || []).map((x) => x.studentno).filter(Boolean);
  if (!studentNos.length) return [];
  const { data: students, error: stuErr } = await supabase
    .from("student_info")
    .select("studentno, studentname, studentemail")
    .in("studentno", studentNos);
  if (stuErr) throw stuErr;
  return (students || []).sort((a, b) => Number(a.studentno) - Number(b.studentno));
}

/* =========================
   DOM refs
   ========================= */
const gradesView = document.getElementById("gradesView");
const sectionsView = document.getElementById("sectionsView");
const sectionsGrid = document.getElementById("sectionsGrid");
const sectionsTitle = document.getElementById("sectionsTitle");
const backToGrades = document.getElementById("backToGrades");
const studentsView = document.getElementById("studentsView");
const studentsGrid = document.getElementById("studentsGrid");
const studentsTitle = document.getElementById("studentsTitle");
const backToSections = document.getElementById("backToSections");
const studentSearch = document.getElementById("studentSearch");
const startBtn = document.getElementById("startBtn");
const enterMarksBtn = document.getElementById("enterMarksBtn");
const marksPanel = document.getElementById("marksPanel");
const closeMarksBtn = document.getElementById("closeMarksBtn");
const saveMarksBtn = document.getElementById("saveMarksBtn");
const csvFile = document.getElementById("csvFile");
const csvText = document.getElementById("csvText");
const tabBtns = document.querySelectorAll(".tab-btn[data-stab]");
const stabs = {
  list: document.getElementById("stab-list"),
  history: document.getElementById("stab-history"),
  marks: document.getElementById("stab-marks"),
};
const historyLoading = document.getElementById("historyLoading");
const historyList = document.getElementById("historyList");
const prevMarksLoading = document.getElementById("prevMarksLoading");
const prevMarksList = document.getElementById("prevMarksList");
const views = {
  dashboard: document.getElementById("view-dashboard"),
  schedule: document.getElementById("view-schedule"),
  teachers: document.getElementById("view-teachers"),
  marks: document.getElementById("view-marks"),
  videos: document.getElementById("view-videos"),
  admin: document.getElementById("view-admin"),
};

/* =========================
   State
   ========================= */
let lastStudents = [];
let lastStudentsTitle = "";
let currentSelection = {
  classId: null,
  sectionId: null,
  className: "",
  sectionName: "",
};
let lastRunId = null;
let lastExamId = null;

/* =========================
   n8n Webhook
   ========================= */
const N8N_URL = "https://n8n.srv1133195.hstgr.cloud/webhook/teacher-start";
function createRunId() {
  if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
async function postWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}
async function readResponseMessage(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    return data?.message || "";
  }
  const txt = await res.text().catch(() => "");
  return txt || "";
}

/* =========================
   Start button
   ========================= */
if (startBtn) {
  startBtn.addEventListener("click", async () => {
    if (!currentSelection.classId || !currentSelection.sectionId) {
      alert("Please open a section first.");
      return;
    }
    if (!lastRunId || !lastExamId) {
      alert("Upload CSV first, then press Start (so n8n runs on the correct runid/examid).");
      return;
    }
    startBtn.disabled = true;
    const oldText = startBtn.textContent;
    startBtn.textContent = "Starting...";
    try {
      const payload = {
        event: "teacher_start",
        runid: lastRunId,
        examid: lastExamId,
        role: currentUser.role,
        teacherId: currentUser.role === "teacher" ? currentUser.id : null,
        supervisorId: currentUser.role === "supervisor" ? currentUser.id : null,
        classId: currentSelection.classId,
        sectionId: currentSelection.sectionId,
        className: currentSelection.className,
        sectionName: currentSelection.sectionName,
        userEmail: session.user.email,
        ts: new Date().toISOString(),
      };
      const res = await postWithTimeout(
        N8N_URL,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
        30000
      );
      if (!res.ok) {
        const msg = await readResponseMessage(res);
        throw new Error(`n8n error ${res.status}: ${msg}`);
      }
      const msg = await readResponseMessage(res);
      alert(msg || "Workflow started successfully ✅");
    } catch (e) {
      console.error(e);
      if (String(e?.name || "").toLowerCase().includes("abort")) {
        alert("n8n request timed out. Check n8n executions/logs.");
      } else {
        alert("Failed to start workflow. Check console + n8n execution logs.");
      }
    } finally {
      startBtn.disabled = false;
      startBtn.textContent = oldText;
    }
  });
}

/* =========================
   Render students list
   ========================= */
function renderStudents(titleText, students) {
  if (!studentsGrid || !studentsTitle) return;
  lastStudents = students || [];
  lastStudentsTitle = titleText;
  studentsTitle.textContent = titleText;
  studentsGrid.classList.add("students-list");
  studentsGrid.innerHTML = "";
  if (!lastStudents.length) {
    studentsGrid.innerHTML = `<div style="color:white; font-weight:700;">No students found in this class/section.</div>`;
    return;
  }
  lastStudents.forEach((s) => {
    const row = document.createElement("div");
    row.className = "student-row";
    row.innerHTML = `
      <div class="student-left">
        <div class="student-name">${s.studentname ?? "Student"}</div>
        <div class="student-email">${s.studentemail ?? ""}</div>
      </div>
      <div class="student-no">No: ${s.studentno}</div>
    `;
    studentsGrid.appendChild(row);
  });
}
if (studentSearch) {
  studentSearch.addEventListener("input", () => {
    const q = (studentSearch.value || "").trim().toLowerCase();
    if (!q) { renderStudents(lastStudentsTitle, lastStudents); return; }
    const filtered = lastStudents.filter((s) => {
      return (s.studentname || "").toLowerCase().includes(q) || (s.studentemail || "").toLowerCase().includes(q);
    });
    studentsTitle.textContent = `${lastStudentsTitle} (${filtered.length}/${lastStudents.length})`;
    studentsGrid.classList.add("students-list");
    studentsGrid.innerHTML = "";
    if (!filtered.length) {
      studentsGrid.innerHTML = `<div style="color:white; font-weight:700;">No matching students.</div>`;
      return;
    }
    filtered.forEach((s) => {
      const row = document.createElement("div");
      row.className = "student-row";
      row.innerHTML = `
        <div class="student-left">
          <div class="student-name">${s.studentname ?? "Student"}</div>
          <div class="student-email">${s.studentemail ?? ""}</div>
        </div>
        <div class="student-no">No: ${s.studentno}</div>
      `;
      studentsGrid.appendChild(row);
    });
  });
}

/* =========================
   Sections view
   ========================= */
async function refreshStudentsSideTabs() {
  if (!currentSelection.classId || !currentSelection.sectionId) return;
  await loadExamHistoryForSelection(currentSelection.classId, currentSelection.sectionId);
  await loadPreviousMarksForSelection(currentSelection.classId, currentSelection.sectionId);
}
function showSections(className, classId, sectionsArr) {
  sectionsTitle.textContent = className;
  sectionsGrid.innerHTML = "";
  hideLoading(sectionsLoading);
  sectionsArr.forEach((sec) => {
    const card = document.createElement("article");
    card.className = "class-card clickable";
    card.innerHTML = `
      <div class="card-body">
        <h3 class="card-title">${sec.sectionName}</h3>
        <p class="card-subtitle">Click to view students</p>
      </div>
      <div class="card-footer">
        <span class="muted">Continue</span>
      </div>
    `;
    card.addEventListener("click", async () => {
      try {
        if (studentSearch) studentSearch.value = "";
        currentSelection = { classId, sectionId: sec.sectionId, className, sectionName: sec.sectionName };
        sectionsView.classList.add("hidden");
        studentsView.classList.remove("hidden");
        setStudentsTab("list");
        studentsGrid.innerHTML = "";
        showLoading(studentsLoading, "Loading students...");
        const students = await loadStudents(classId, sec.sectionId);
        hideLoading(studentsLoading);
        renderStudents(`${className} - ${sec.sectionName}`, students);
        if (marksPanel) marksPanel.classList.add("hidden");
        await refreshStudentsSideTabs();
      } catch (e) {
        console.error("Load students error:", e);
        hideLoading(studentsLoading);
        alert("Failed to load students. Check console.");
      }
    });
    sectionsGrid.appendChild(card);
  });
  gradesView.classList.add("hidden");
  sectionsView.classList.remove("hidden");
}
if (backToGrades) {
  backToGrades.addEventListener("click", () => {
    sectionsView.classList.add("hidden");
    gradesView.classList.remove("hidden");
  });
}
if (backToSections) {
  backToSections.addEventListener("click", () => {
    if (studentSearch) studentSearch.value = "";
    hideLoading(studentsLoading);
    currentSelection = { classId: null, sectionId: null, className: "", sectionName: "" };
    if (marksPanel) marksPanel.classList.add("hidden");
    studentsView.classList.add("hidden");
    sectionsView.classList.remove("hidden");
  });
}

/* =========================
   Sidebar
   ========================= */
const sidebar = document.getElementById("sidebar");
const backdrop = document.getElementById("backdrop");
const openBtn = document.getElementById("openSidebar");
const closeBtn = document.getElementById("closeSidebar");
function openSidebar() {
  sidebar.classList.add("open");
  backdrop.classList.add("show");
}
function closeSidebar() {
  sidebar.classList.remove("open");
  backdrop.classList.remove("show");
}
if (openBtn) openBtn.addEventListener("click", openSidebar);
if (closeBtn) closeBtn.addEventListener("click", closeSidebar);
if (backdrop) backdrop.addEventListener("click", closeSidebar);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSidebar(); });

/* =========================
   Logout
   ========================= */
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    sessionStorage.removeItem("forceRole");
    try { await supabase.auth.signOut(); } catch (e) { console.error("Logout error:", e); } finally {
      window.location.href = "/loginpage/";
    }
  });
}

/* =========================
   SPA Navigation
   ========================= */
const navBtns = document.querySelectorAll(".side-link[data-view]");
function setActiveLink(viewName) {
  navBtns.forEach((b) => b.classList.remove("active"));
  const current = document.querySelector(`.side-link[data-view="${viewName}"]`);
  if (current) current.classList.add("active");
}
function showView(viewName) {
  Object.keys(views).forEach((k) => { if (views[k]) views[k].classList.add("hidden"); });
  if (views[viewName]) {
    views[viewName].classList.remove("hidden");
    setActiveLink(viewName);
  } else {
    setActiveLink(viewName);
  }
  if (viewName === "videos") {
    initVideosPage();
  }
  if (viewName === "teachers") {
    initSupervisorTeachersView();
  }
  if (viewName === "schedule") {
    initSchedulePage();
  }
  closeSidebar();
}
navBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.getAttribute("data-view");
    showView(view);
  });
});

/* Role-based nav visibility */
const navAdmin = document.getElementById("navAdmin");
const navTeachers = document.getElementById("navTeachers");
const adminSubLinks = document.querySelectorAll(".admin-sub-link");
if (navAdmin) navAdmin.style.display = currentUser.role === "admin" ? "flex" : "none";
if (navTeachers) navTeachers.style.display = currentUser.role === "supervisor" ? "flex" : "none";
adminSubLinks.forEach((el) => {
  el.style.display = currentUser.role === "admin" ? "flex" : "none";
});
if (currentUser.role === "admin") {
  document.querySelectorAll('.side-link[data-view="dashboard"], .side-link[data-view="schedule"], .side-link[data-view="marks"], .side-link[data-view="videos"], .side-link[data-view="teachers"]').forEach((el) => {
    el.style.display = "none";
  });
  const teacherOnlyIds = ["enterMarksBtn", "startBtn", "csvFile", "csvText", "saveMarksBtn"];
  teacherOnlyIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}

if (currentUser.role === "supervisor") {
  // Hide all nav links except "My Teachers" and "Class Schedule" — but keep the logout button visible
  document.querySelectorAll('.side-link').forEach((el) => {
    const view = el.getAttribute("data-view");
    if (view !== "teachers" && view !== "schedule" && el.id !== "logoutBtn") el.style.display = "none";
  });

  // Supervisors: remove CSV/marks upload controls
  ["enterMarksBtn", "csvFile", "csvText", "saveMarksBtn"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}
if (currentUser.role === "admin") {
  const titleEl = document.getElementById("sidebarTitle") || document.getElementById("panelTitle") || document.querySelector(".sidebar-title") || document.querySelector(".panel-title");
  if (titleEl) titleEl.textContent = "Admin Panel";
}

injectRoleSwitcher();

/* =========================
   Admin sub-navigation
   ========================= */
const adminSubViews = {
  "admin-overview": document.getElementById("admin-view-overview"),
  "admin-supervisors": document.getElementById("admin-view-supervisors"),
  "admin-teachers": document.getElementById("admin-view-teachers"),
  "admin-students": document.getElementById("admin-view-students"),
  "admin-classes": document.getElementById("admin-view-classes"),
  "admin-exams": document.getElementById("admin-view-exams"),
};
const adminSubBtns = document.querySelectorAll(".admin-sub-btn[data-admin-view]");
function showAdminSubView(viewName) {
  Object.keys(adminSubViews).forEach((k) => {
    if (adminSubViews[k]) adminSubViews[k].classList.add("hidden");
  });
  adminSubBtns.forEach((b) => b.classList.remove("active"));
  if (adminSubViews[viewName]) adminSubViews[viewName].classList.remove("hidden");
  const btn = document.querySelector(`.admin-sub-btn[data-admin-view="${viewName}"]`);
  if (btn) btn.classList.add("active");
}
adminSubBtns.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const v = btn.getAttribute("data-admin-view");
    showAdminSubView(v);
    if (v === "admin-overview") await loadAdminOverview();
    else if (v === "admin-supervisors") await loadAdminSupervisors();
    else if (v === "admin-teachers") await loadAdminTeachers();
    else if (v === "admin-students") await loadAdminStudents();
    else if (v === "admin-classes") await loadAdminClasses();
    else if (v === "admin-exams") await loadAdminExams();
  });
});

/* =========================
   Students Tabs
   ========================= */
function setStudentsTab(tabName) {
  tabBtns.forEach((b) => b.classList.remove("active"));
  const current = document.querySelector(`.tab-btn[data-stab="${tabName}"]`);
  if (current) current.classList.add("active");
  Object.keys(stabs).forEach((k) => stabs[k]?.classList.add("hidden"));
  stabs[tabName]?.classList.remove("hidden");
}
tabBtns.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const tab = btn.getAttribute("data-stab");
    setStudentsTab(tab);
    if (tab === "history") await refreshStudentsSideTabs();
    if (tab === "marks") await refreshStudentsSideTabs();
  });
});

/* =========================
   MARKS: CSV -> DB
   ========================= */
const ANSWER_COLS = Array.from({ length: 50 }, (_, i) => `Q${i + 1}`);
const REQUIRED_HEADERS = ["examid", "studentno"];
function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else { inQ = !inQ; }
      continue;
    }
    if (ch === "," && !inQ) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}
function parseCSVObjects(csvString) {
  const raw = (csvString || "").trim();
  if (!raw) return { headers: [], rows: [] };
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCSVLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    const obj = {};
    for (let c = 0; c < headers.length; c++) { obj[headers[c]] = (values[c] ?? "").trim(); }
    rows.push(obj);
  }
  return { headers, rows };
}
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
function normalizeKeyMap(headers) {
  const map = new Map();
  headers.forEach((h) => map.set(String(h).toLowerCase(), h));
  return map;
}
function pick(obj, keyMap, name) {
  const realKey = keyMap.get(String(name).toLowerCase());
  if (!realKey) return undefined;
  return obj[realKey];
}
function toNullableText(v) {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}
function toIntOrNull(v) {
  const n = Number((v ?? "").toString().trim());
  return Number.isFinite(n) ? n : null;
}
async function verifyExamForTeacher(examid) {
  const { data, error } = await supabase.from("exam_info").select("examid, teacherid, classid, sectionid").eq("examid", examid).maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, reason: "Exam not found in exam_info." };
  if (data.teacherid !== currentUser.id) return { ok: false, reason: "This examid is not assigned to your teacher account." };
  if (data.classid !== currentSelection.classId || data.sectionid !== currentSelection.sectionId) {
    return { ok: false, reason: "This examid does not match the selected class/section." };
  }
  return { ok: true };
}

/* =========================
   UPSERT (robust multi-candidate onConflict)
   — FROM FRIEND'S CODE —
   ========================= */
async function upsertAnswersToDB(items) {
  const BATCH = 50;
  const conflictCandidates = [
    "runid,examid,studentno",
    "runid,examid,studentno,teacherid,classid,sectionid",
    "examid,studentno,teacherid,classid,sectionid,runid",
  ];
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    let lastErr = null;
    for (const onConflict of conflictCandidates) {
      const { error } = await supabase.from("Student_Exam_answer").upsert(chunk, { onConflict });
      if (!error) { lastErr = null; break; }
      lastErr = error;
      const msg = String(error?.message || "").toLowerCase();
      const code = String(error?.code || "");
      const isConflictSpecProblem =
        code === "42P10" ||
        msg.includes("no unique or exclusion constraint") ||
        msg.includes("on conflict");
      if (!isConflictSpecProblem) break;
    }
    if (lastErr) {
      console.error("UPSERT ERROR:", lastErr);
      alert("UPSERT ERROR:\n" + JSON.stringify({ message: lastErr.message, details: lastErr.details, hint: lastErr.hint, code: lastErr.code }, null, 2));
      throw lastErr;
    }
  }
}

async function insertExamRunHistory(runid, examid) {
  const payload = {
    runid,
    examid,
    teacherid: currentUser.id,
    classid: currentSelection.classId,
    sectionid: currentSelection.sectionId,
    submitted_by_email: session.user.email,
  };
  const { error } = await supabase.from("exam_runs").insert(payload);
  if (error) console.warn("exam_runs insert failed:", error);
}
if (enterMarksBtn && marksPanel) {
  enterMarksBtn.addEventListener("click", () => {
    if (currentUser.role !== "teacher") {
      alert("Only teachers can enter/upload marks.");
      return;
    }
    if (!currentSelection.classId || !currentSelection.sectionId) {
      alert("Please open a class/section first.");
      return;
    }
    marksPanel.classList.remove("hidden");
    marksPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
if (closeMarksBtn && marksPanel) {
  closeMarksBtn.addEventListener("click", () => marksPanel.classList.add("hidden"));
}
if (saveMarksBtn) {
  saveMarksBtn.addEventListener("click", async () => {
    if (currentUser.role !== "teacher") { alert("Only teachers can upload CSV marks."); return; }
    if (!currentSelection.classId || !currentSelection.sectionId) { alert("Please open a class/section first."); return; }
    saveMarksBtn.disabled = true;
    const oldText = saveMarksBtn.textContent;
    saveMarksBtn.textContent = "Saving...";
    try {
      const file = csvFile?.files?.[0];
      let csvContent = "";
      if (file) csvContent = await readFileAsText(file);
      else csvContent = (csvText?.value || "").trim();
      const { headers, rows } = parseCSVObjects(csvContent);
      if (!headers.length || !rows.length) { alert("CSV is empty or invalid."); return; }
      const keyMap = normalizeKeyMap(headers);
      for (const need of REQUIRED_HEADERS) {
        if (!keyMap.has(need)) { alert(`CSV missing required header: ${need}`); return; }
      }
      const examIdsSet = new Set();
      for (const r of rows) {
        const ex = toIntOrNull(pick(r, keyMap, "examid"));
        if (ex) examIdsSet.add(ex);
      }
      if (examIdsSet.size !== 1) { alert("CSV must contain exactly ONE examid (same for all rows)."); return; }
      const [onlyExamId] = Array.from(examIdsSet);
      const verify = await verifyExamForTeacher(onlyExamId);
      if (!verify.ok) { alert(`Exam verification failed: ${verify.reason}`); return; }
      const runId = createRunId();
      const payload = [];
      let skipped = 0;
      for (const r of rows) {
        const examid = toIntOrNull(pick(r, keyMap, "examid"));
        const studentno = toIntOrNull(pick(r, keyMap, "studentno"));
        if (!examid || !studentno) { skipped++; continue; }
        const obj = {
          runid: runId, examid, studentno,
          teacherid: currentUser.id,
          classid: currentSelection.classId,
          sectionid: currentSelection.sectionId,
        };
        for (const q of ANSWER_COLS) obj[q] = toNullableText(pick(r, keyMap, q));
        payload.push(obj);
      }
      if (!payload.length) { alert("No valid rows found. Check examid/studentno values."); return; }
      await upsertAnswersToDB(payload);
      await insertExamRunHistory(runId, onlyExamId);
      lastRunId = runId;
      lastExamId = onlyExamId;
      alert(`Saved ${payload.length} rows ✅${skipped ? ` (Skipped ${skipped})` : ""}\nRunID: ${runId}\nNow press Start to run the workflow ✅`);
      if (csvFile) csvFile.value = "";
      if (csvText) csvText.value = "";
      await refreshStudentsSideTabs();
    } catch (e) {
      console.error(e);
      alert(`Failed to save. Check console. Error: ${e.message || e}`);
    } finally {
      saveMarksBtn.disabled = false;
      saveMarksBtn.textContent = oldText;
    }
  });
}

/* =========================
   Exam History tab
   ========================= */
function fmtDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString(); } catch { return String(iso); }
}
async function loadExamHistoryForSelection(classId, sectionId) {
  if (!historyList) return;
  showLoading(historyLoading, "Loading history...");
  historyList.innerHTML = "";
  try {
    let q = supabase.from("exam_runs").select("runid, examid, teacherid, submitted_at")
      .eq("classid", classId).eq("sectionid", sectionId)
      .order("submitted_at", { ascending: false }).limit(100);
    if (currentUser.role === "teacher") q = q.eq("teacherid", currentUser.id);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    if (!rows.length) { historyList.innerHTML = `<div style="color:white; font-weight:800;">No exam submissions yet.</div>`; return; }
    rows.forEach((r) => {
      const card = document.createElement("div");
      card.className = "list-card";
      card.innerHTML = `
        <div class="list-row">
          <div>
            <div style="font-weight:900;">Exam ID: ${r.examid}</div>
            <div style="color:#475569; font-size:13px;">RunID: ${r.runid}</div>
            <div style="color:#475569; font-size:13px;">Submitted: ${fmtDate(r.submitted_at)}</div>
          </div>
          <div class="actions-inline"><span class="badge">history</span></div>
        </div>
      `;
      historyList.appendChild(card);
    });
  } catch (e) {
    console.error("history load error:", e);
    historyList.innerHTML = `<div style="color:white; font-weight:800;">Failed to load history.</div>`;
  } finally {
    hideLoading(historyLoading);
  }
}

/* =========================
   Previous Marks tab
   ========================= */
const prevExamSelect = document.getElementById("prevExamSelect");
const loadPrevMarksBtn = document.getElementById("loadPrevMarksBtn");

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n > 0 ? 1 : 0;
}

async function detectQuestionCount(runid, examid) {
  const Q_COLS = Array.from({ length: 50 }, (_, i) => `Q${i + 1}`).join(",");
  const { data, error } = await supabase
    .from("Student_Exam_answer")
    .select(Q_COLS)
    .eq("runid", runid)
    .eq("examid", examid)
    .limit(10);
  if (error || !data?.length) return 0;
  let max = 0;
  for (const row of data) {
    for (let i = 50; i >= 1; i--) {
      if (row[`Q${i}`] != null && String(row[`Q${i}`]).trim() !== "") {
        if (i > max) max = i;
        break;
      }
    }
  }
  return max;
}

async function fetchStudentsForClassSection(classId, sectionId) {
  const { data: links, error: linkErr } = await supabase
    .from("student_class_section")
    .select("studentno")
    .eq("classid", classId)
    .eq("sectionid", sectionId);
  if (linkErr) throw linkErr;
  const nos = (links || []).map(x => x.studentno).filter(Boolean);
  if (!nos.length) return [];
  const { data, error } = await supabase
    .from("student_info")
    .select("studentno, studentname, studentemail")
    .in("studentno", nos);
  if (error) throw error;
  return (data || []).sort((a, b) => Number(a.studentno) - Number(b.studentno));
}

async function getLatestRunIdForExam({ examid, classId, sectionId }) {
  let q = supabase
    .from("exam_runs")
    .select("runid, submitted_at")
    .eq("examid", examid)
    .eq("classid", classId)
    .eq("sectionid", sectionId)
    .order("submitted_at", { ascending: false })
    .limit(1);
  if (currentUser.role === "teacher") q = q.eq("teacherid", currentUser.id);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data?.runid || null;
}

async function fetchTotalsFromStudentExamResult({ runid, examid, studentNos }) {
  if (!studentNos.length) return new Map();
  const { data, error } = await supabase
    .from("student_exam_result")
    .select("studentno, total")
    .eq("runid", runid)
    .eq("examid", examid)
    .in("studentno", studentNos);
  if (error) throw error;
  return new Map((data || []).map(r => [Number(r.studentno), String(r.total || "")]));
}

async function computeTotalsFromStudentExamAnswer({ runid, examid, studentNos }) {
  const qCount = await detectQuestionCount(runid, examid);
  const qc = Math.max(0, Math.min(50, Number(qCount || 0)));
  const out = new Map();
  if (!qc || !studentNos.length) return { totalsMap: out, qCount: qc };
  const qCols = Array.from({ length: qc }, (_, i) => `Q${i + 1}`).join(",");
  const { data, error } = await supabase
    .from("Student_Exam_answer")
    .select(`studentno, ${qCols}`)
    .eq("runid", runid)
    .eq("examid", examid)
    .in("studentno", studentNos);
  if (error) throw error;
  const rowMap = new Map((data || []).map(r => [Number(r.studentno), r]));
  for (const sno of studentNos) {
    const r = rowMap.get(Number(sno));
    let sum = 0;
    for (let i = 1; i <= qc; i++) { sum += clamp01(r ? r[`Q${i}`] : 0); }
    out.set(Number(sno), `${sum}/${qc}`);
  }
  return { totalsMap: out, qCount: qc };
}

function renderPrevMarksTable({ students, totalsMap, qCount }) {
  if (!prevMarksList) return;
  if (!students.length) {
    prevMarksList.innerHTML = `<div style="color:white; font-weight:900;">No students found.</div>`;
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "marks-table-wrap scroll-x";
  wrap.innerHTML = `
    <table class="marks-table">
      <thead>
        <tr>
          <th style="min-width:70px;">No</th>
          <th style="min-width:260px;">Student</th>
          <th style="min-width:110px; text-align:center;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${students.map(s => {
    const total = totalsMap.get(Number(s.studentno)) || `0/${qCount || 0}`;
    return `
            <tr>
              <td>${s.studentno}</td>
              <td>
                <div style="font-weight:900;">${escapeHtml(s.studentname || "Student")}</div>
                <div style="color:#475569; font-size:12px;">${escapeHtml(s.studentemail || "")}</div>
              </td>
              <td style="text-align:center;">
                <span class="total-pill">${escapeHtml(total)}</span>
              </td>
            </tr>
          `;
  }).join("")}
      </tbody>
    </table>
  `;
  prevMarksList.innerHTML = "";
  prevMarksList.appendChild(wrap);
}

async function loadExamsForPrevMarks(classId, sectionId) {
  const { rows } = await selectExamsCompat();
  let filtered = (rows || []).filter(
    r => Number(r.classid) === Number(classId) && Number(r.sectionid) === Number(sectionId)
  );
  if (currentUser.role === "teacher") {
    filtered = filtered.filter(r => Number(r.teacherid) === Number(currentUser.id));
  }
  return filtered
    .sort((a, b) => Number(b.examid) - Number(a.examid))
    .map(r => ({ examid: r.examid, classid: r.classid, sectionid: r.sectionid, teacherid: r.teacherid }));
}

async function loadPreviousMarksForSelection(classId, sectionId) {
  if (!prevMarksList) return;
  prevMarksList.innerHTML = "";
  hideLoading(prevMarksLoading);
  if (!prevExamSelect || !loadPrevMarksBtn) {
    prevMarksList.innerHTML = `<div style="color:white; font-weight:800;">Previous Marks UI elements not found.</div>`;
    return;
  }
  try {
    showLoading(prevMarksLoading, "Loading exams...");
    const exams = await loadExamsForPrevMarks(classId, sectionId);
    setSelectOptions(prevExamSelect, exams.map(e => ({ value: e.examid, label: `Exam ${e.examid}` })), "Select exam...");
    prevMarksList.innerHTML = exams.length
      ? `<div style="color:#e2e8f0; font-weight:800;">Select an exam then press "Show Totals".</div>`
      : `<div style="color:white; font-weight:800;">No exams found for this class/section.</div>`;
  } catch (e) {
    console.error("loadPreviousMarksForSelection error:", e);
    prevMarksList.innerHTML = `<div style="color:white; font-weight:800;">Failed to load exams.</div>`;
  } finally {
    hideLoading(prevMarksLoading);
  }
}

if (loadPrevMarksBtn) {
  loadPrevMarksBtn.addEventListener("click", async () => {
    if (!currentSelection?.classId) { alert("Please open a class/section first."); return; }
    const classId = currentSelection.classId;
    const sectionId = currentSelection.sectionId;
    const examid = Number(prevExamSelect?.value || 0) || null;
    if (!examid) { alert("Select an exam first."); return; }
    showLoading(prevMarksLoading, "Loading totals...");
    prevMarksList.innerHTML = "";
    try {
      const students = await fetchStudentsForClassSection(classId, sectionId);
      const studentNos = students.map(s => Number(s.studentno)).filter(Boolean);
      if (!students.length) {
        prevMarksList.innerHTML = `<div style="color:white; font-weight:900;">No students found.</div>`;
        return;
      }
      const runid = await getLatestRunIdForExam({ examid, classId, sectionId });
      if (!runid) {
        prevMarksList.innerHTML = `<div style="color:white; font-weight:900;">No runs found for this exam in this class/section.</div>`;
        return;
      }
      let totalsMap = await fetchTotalsFromStudentExamResult({ runid, examid, studentNos });
      let qCount = 0;
      if (!totalsMap.size) {
        const computed = await computeTotalsFromStudentExamAnswer({ runid, examid, studentNos });
        totalsMap = computed.totalsMap;
        qCount = computed.qCount;
      } else {
        qCount = await detectQuestionCount(runid, examid);
        qCount = Math.max(0, Math.min(50, Number(qCount || 0)));
      }
      renderPrevMarksTable({ students, totalsMap, qCount });
    } catch (e) {
      console.error("Show Totals error:", e);
      prevMarksList.innerHTML = `<div style="color:white; font-weight:900;">Failed to load totals. Check console.</div>`;
    } finally {
      hideLoading(prevMarksLoading);
    }
  });
}

/* =========================
   Marks page (Sidebar "Marks" tab)
   — REPLACED WITH FRIEND'S FULL Q1-Q50 IMPLEMENTATION —
   ========================= */
const marksClassSelect = document.getElementById("marksClassSelect");
const marksSectionSelect = document.getElementById("marksSectionSelect");
const marksExamSelect = document.getElementById("marksExamSelect");
const marksRunSelect = document.getElementById("marksRunSelect");
const marksLoading = document.getElementById("marksLoading");
const marksEditor = document.getElementById("marksEditor");
const saveEditedMarksBtn = document.getElementById("saveEditedMarksBtn");

let marksState = {
  classId: null, sectionId: null, examid: null, runid: null,
  rows: [], qCount: 0
};

/* ── Helpers ── */
function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* clamp any value to exactly 0 or 1 */
function clamp01Mark(v) {
  const n = num(v, 0);
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n >= 0.5 ? 1 : 0;
}

async function selectExamsCompat() {
  const { data, error } = await supabase.from("exam_info").select("*");
  if (error) return { rows: [], error };
  return { rows: data || [], error: null };
}

async function loadExamsForTeacher(teacherid) {
  const { rows } = await selectExamsCompat();
  return (rows || [])
    .filter((r) => Number(r.teacherid) === Number(teacherid))
    .sort((a, b) => Number(b.examid) - Number(a.examid))
    .map((r) => ({ examid: r.examid, classid: r.classid, sectionid: r.sectionid, teacherid: r.teacherid }));
}

async function loadRunsForTeacherAndExam(teacherid, examid) {
  const { data, error } = await supabase
    .from("exam_runs")
    .select("runid, submitted_at")
    .eq("teacherid", teacherid)
    .eq("examid", examid)
    .order("submitted_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

function setSelectOptions(selectEl, options, placeholder = "Select...") {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = placeholder;
  selectEl.appendChild(ph);
  options.forEach((opt) => {
    const o = document.createElement("option");
    o.value = String(opt.value);
    o.textContent = opt.label;
    selectEl.appendChild(o);
  });
}

async function initMarksSelectors() {
  if (!marksClassSelect || !marksSectionSelect || !marksExamSelect || !marksRunSelect) return;
  let rows = [];
  if (currentUser.role === "teacher") rows = await loadTeacherClasses(currentUser.id);
  else if (currentUser.role === "supervisor") rows = await loadSupervisorClasses(currentUser.id);
  else rows = await loadAllClassesSections();
  const grouped = groupByClass(rows);
  setSelectOptions(marksClassSelect, grouped.map((g) => ({ value: g.classId, label: g.className })), "Select class...");

  marksClassSelect.addEventListener("change", () => {
    const classId = Number(marksClassSelect.value || 0) || null;
    marksState.classId = classId;
    marksState.sectionId = null;
    marksState.examid = null;
    marksState.runid = null;
    marksState.rows = [];
    marksState.qCount = 0;
    setSelectOptions(marksSectionSelect, [], "Select section...");
    setSelectOptions(marksExamSelect, [], "Select exam...");
    setSelectOptions(marksRunSelect, [], "Select run...");
    if (marksEditor) marksEditor.innerHTML = "";
    if (!classId) return;
    const g = grouped.find((x) => x.classId === classId);
    setSelectOptions(
      marksSectionSelect,
      (g?.sections || []).map((s) => ({ value: s.sectionId, label: s.sectionName })),
      "Select section..."
    );
  });

  marksSectionSelect.addEventListener("change", async () => {
    const sectionId = Number(marksSectionSelect.value || 0) || null;
    marksState.sectionId = sectionId;
    marksState.examid = null;
    marksState.runid = null;
    marksState.rows = [];
    marksState.qCount = 0;
    setSelectOptions(marksExamSelect, [], "Select exam...");
    setSelectOptions(marksRunSelect, [], "Select run...");
    if (marksEditor) marksEditor.innerHTML = "";
    if (!marksState.classId || !sectionId) return;
    let exams = [];
    if (currentUser.role === "teacher") {
      exams = await loadExamsForTeacher(currentUser.id);
    } else {
      const { rows } = await selectExamsCompat();
      exams = (rows || [])
        .filter((r) => Number(r.classid) === Number(marksState.classId) && Number(r.sectionid) === Number(sectionId))
        .sort((a, b) => Number(b.examid) - Number(a.examid))
        .map((r) => ({ examid: r.examid, classid: r.classid, sectionid: r.sectionid, teacherid: r.teacherid }));
    }
    const filtered = exams.filter((e) => e.classid === marksState.classId && e.sectionid === sectionId);
    setSelectOptions(marksExamSelect, filtered.map((e) => ({ value: e.examid, label: `${e.examid}` })), "Select exam...");
  });

  marksExamSelect.addEventListener("change", async () => {
    const examid = Number(marksExamSelect.value || 0) || null;
    marksState.examid = examid;
    marksState.runid = null;
    marksState.rows = [];
    marksState.qCount = 0;
    setSelectOptions(marksRunSelect, [], "Select run...");
    if (marksEditor) marksEditor.innerHTML = "";
    if (!marksState.classId || !marksState.sectionId || !examid) return;
    let runs = [];
    if (currentUser.role === "teacher") {
      runs = await loadRunsForTeacherAndExam(currentUser.id, examid);
    } else {
      const { data, error } = await supabase
        .from("exam_runs")
        .select("runid, submitted_at")
        .eq("examid", examid)
        .eq("classid", marksState.classId)
        .eq("sectionid", marksState.sectionId)
        .order("submitted_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      runs = data || [];
    }
    setSelectOptions(marksRunSelect, runs.map((r) => ({ value: r.runid, label: `${r.runid} (${fmtDate(r.submitted_at)})` })), "Select run...");
  });

  marksRunSelect.addEventListener("change", async () => {
    const runid = marksRunSelect.value || null;
    marksState.runid = runid;
    marksState.rows = [];
    marksState.qCount = 0;
    if (marksEditor) marksEditor.innerHTML = "";
    if (!runid || !marksState.examid) return;
    await renderMarksEditor(runid, marksState.examid);
  });
}

/* ── Inject sticky CSS for the marks table ── */
function ensureMarksStickyCss() {
  if (document.getElementById("marksStickyCss")) return;
  const style = document.createElement("style");
  style.id = "marksStickyCss";
  style.textContent = `
    .marks-table-wrap { overflow: auto; }
    .marks-q-table th, .marks-q-table td { white-space: nowrap; }
    .marks-q-table .no-col { min-width: 70px; }
    .marks-q-table .student-col { min-width: 240px; }
    .marks-q-table .total-col { min-width: 90px; text-align: center; }
    .marks-q-table th.sticky-col,
    .marks-q-table td.sticky-col {
      position: sticky; left: 0; z-index: 3; background: #ffffff;
    }
    .marks-q-table th.sticky-col-2,
    .marks-q-table td.sticky-col-2 {
      position: sticky; left: 70px; z-index: 3; background: #ffffff;
    }
    .marks-q-table thead th.sticky-col,
    .marks-q-table thead th.sticky-col-2 { z-index: 6; background: #f8fafc; }
    .marks-q-table input.q-input {
      width: 52px; height: 36px; text-align: center;
      font-weight: 800; font-size: 14px;
      color: #0f172a !important;
      background: #ffffff !important;
      border: 1px solid #e2e8f0; border-radius: 10px; outline: none;
    }
    .marks-q-table input.q-input:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59,130,246,.15);
    }
  `;
  document.head.appendChild(style);
}

/* ── Render the Q1-Q50 marks editor (from friend's code) ── */
async function renderMarksEditor(runid, examid) {
  if (!marksEditor) return;
  ensureMarksStickyCss();
  showLoading(marksLoading, "Loading students & marks...");
  marksEditor.innerHTML = "";
  try {
    const classId = marksState.classId;
    const sectionId = marksState.sectionId;

    // 1) students
    const students = await fetchStudentsForClassSection(classId, sectionId);
    if (!students.length) {
      marksEditor.innerHTML = `<div style="color:white; font-weight:900;">No students found for this class/section.</div>`;
      return;
    }
    const studentNos = students.map((s) => s.studentno);

    // 2) detect question count
    const qCount = await detectQuestionCount(runid, examid);
    marksState.qCount = qCount;
    if (!qCount) {
      marksEditor.innerHTML = `<div style="color:white; font-weight:900;">No answers found for this run/exam yet.</div>`;
      return;
    }

    // 3) fetch saved per-question marks from student_question_marks
    const { data: qm, error: qmErr } = await supabase
      .from("student_question_marks")
      .select("studentno, qno, mark")
      .eq("runid", runid)
      .eq("examid", examid)
      .in("studentno", studentNos);
    if (qmErr) throw qmErr;

    const qMap = new Map();
    (qm || []).forEach((r) => {
      if (!qMap.has(r.studentno)) qMap.set(r.studentno, new Map());
      qMap.get(r.studentno).set(r.qno, clamp01Mark(r.mark));
    });

    // 4) fetch raw answers from Student_Exam_answer
    const qCols = Array.from({ length: qCount }, (_, i) => `Q${i + 1}`).join(",");
    const { data: rawAnswers, error: rawErr } = await supabase
      .from("Student_Exam_answer")
      .select(`studentno,${qCols}`)
      .eq("runid", runid)
      .eq("examid", examid)
      .in("studentno", studentNos);
    if (rawErr) throw rawErr;

    const rawMap = new Map((rawAnswers || []).map((r) => [r.studentno, r]));

    // 5) build rows — priority: student_question_marks > Student_Exam_answer
    marksState.rows = students.map((s) => {
      const savedMarks = qMap.get(s.studentno);
      const rawRow = rawMap.get(s.studentno);
      const perQ = [];
      let sum = 0;
      for (let q = 1; q <= qCount; q++) {
        let mark = 0;
        if (savedMarks && savedMarks.has(q)) {
          mark = clamp01Mark(savedMarks.get(q));
        } else if (rawRow) {
          mark = clamp01Mark(rawRow[`Q${q}`] ?? 0);
        }
        perQ.push({ qno: q, mark });
        sum += mark;
      }
      return {
        studentno: s.studentno,
        studentname: s.studentname,
        studentemail: s.studentemail,
        perQ,
        total: `${sum}/${qCount}`,
      };
    });

    // 6) render table
    const wrap = document.createElement("div");
    wrap.className = "marks-table-wrap scroll-x";
    wrap.innerHTML = `
      <table class="marks-table marks-q-table">
        <thead>
          <tr>
            <th class="sticky-col no-col">No</th>
            <th class="sticky-col-2 student-col">Student</th>
            <th class="total-col">Total</th>
            ${Array.from({ length: qCount }).map((_, i) => `<th class="q-col">Q${i + 1}</th>`).join("")}
          </tr>
        </thead>
        <tbody id="marksTbody"></tbody>
      </table>
    `;
    marksEditor.appendChild(wrap);

    const tbody = document.getElementById("marksTbody");
    tbody.innerHTML = "";

    marksState.rows.forEach((row, idx) => {
      const tr = document.createElement("tr");
      const qCells = row.perQ.map((qObj) => `
        <td class="q-cell">
          <input type="number" min="0" max="1" step="1" inputmode="numeric"
            class="mark-input q-input"
            data-idx="${idx}" data-qno="${qObj.qno}"
            value="${String(qObj.mark)}" />
        </td>
      `).join("");
      tr.innerHTML = `
        <td class="sticky-col no-col">${row.studentno}</td>
        <td class="sticky-col-2 student-col">
          <div style="font-weight:900;">${escapeHtml(row.studentname || "Student")}</div>
          <div style="color:#475569; font-size:12px;">${escapeHtml(row.studentemail || "")}</div>
        </td>
        <td class="total-col">
          <div class="total-pill" id="total-${idx}">${escapeHtml(row.total)}</div>
        </td>
        ${qCells}
      `;
      tbody.appendChild(tr);
    });

    // 7) input listeners — force 0 or 1 only
    const inputs = tbody.querySelectorAll("input.q-input");
    inputs.forEach((inp) => {
      const applyClamp = () => {
        const idx = Number(inp.getAttribute("data-idx"));
        const qno = Number(inp.getAttribute("data-qno"));
        const v = clamp01Mark(inp.value);
        inp.value = String(v);
        const qObj = marksState.rows[idx]?.perQ?.find((x) => x.qno === qno);
        if (qObj) qObj.mark = v;
        recomputeRowTotal(idx);
      };
      inp.addEventListener("input", applyClamp);
      inp.addEventListener("blur", applyClamp);
    });

  } catch (e) {
    console.error("renderMarksEditor error:", e);
    marksEditor.innerHTML = `<div style="color:white; font-weight:900;">Failed to load marks. Error: ${e.message}</div>`;
  } finally {
    hideLoading(marksLoading);
  }
}

function recomputeRowTotal(idx) {
  const row = marksState.rows?.[idx];
  if (!row) return;
  const sum = (row.perQ || []).reduce((a, q) => a + clamp01Mark(q.mark), 0);
  const maxSum = marksState.qCount || (row.perQ?.length || 0);
  row.total = `${sum}/${maxSum}`;
  const el = document.getElementById(`total-${idx}`);
  if (el) el.textContent = row.total;
}

/* ── Save marks to student_question_marks + student_exam_result + Student_Exam_answer ── */
async function saveMarksToStudentExamAnswer({ runid, examId, rows, questionCount, teacherid, classid, sectionid }) {
  if (!runid) throw new Error("Missing runid");
  if (!examId) throw new Error("Missing examId");
  if (!Array.isArray(rows) || !rows.length) throw new Error("No rows to save");
  const qc = Math.min(Number(questionCount || 0), 50);
  const payload = rows.map((r) => {
    const studentno = r.studentno ?? r.studentNo;
    if (studentno === undefined || studentno === null) throw new Error("Row is missing studentno");
    const obj = {
      runid: String(runid), examid: Number(examId), studentno: Number(studentno),
      teacherid: Number(teacherid), classid: Number(classid), sectionid: Number(sectionid),
    };
    for (let i = 1; i <= qc; i++) {
      const key = `Q${i}`;
      let v = (r && r[key]) ?? (r?.marks && r.marks[key]) ?? (r?.answers && r.answers[key]);
      if (v === undefined && Array.isArray(r?.perQ)) {
        const found = r.perQ.find((x) => Number(x.qno) === i);
        if (found) v = found.mark;
      }
      obj[key] = (v === undefined || v === null || v === "") ? null : String(Number(v) >= 1 ? 1 : 0);
    }
    return obj;
  });
  const conflictCandidates = [
    "runid,examid,studentno",
    "runid,examid,studentno,teacherid,classid,sectionid",
    "examid,studentno,teacherid,classid,sectionid,runid",
  ];
  let lastErr = null;
  for (const onConflict of conflictCandidates) {
    const { data, error } = await supabase
      .from("Student_Exam_answer")
      .upsert(payload, { onConflict })
      .select("runid,examid,studentno");
    if (!error) return data;
    lastErr = error;
    const msg = String(error?.message || "").toLowerCase();
    const code = String(error?.code || "");
    const isConflictSpecProblem =
      code === "42P10" ||
      msg.includes("no unique or exclusion constraint") ||
      msg.includes("on conflict");
    if (!isConflictSpecProblem) break;
  }
  throw new Error("Student_Exam_answer sync failed: " + JSON.stringify({ message: lastErr?.message, code: lastErr?.code }, null, 2));
}

async function saveEditedMarks() {
  if (!marksState.runid || !marksState.examid) return;
  const runid = marksState.runid;
  const examid = marksState.examid;
  const qCount = marksState.qCount || 0;
  showLoading(marksLoading, "Saving edited marks...");
  try {
    const userEmail = (currentUser?.email || "").trim().toLowerCase();

    // 1) upsert per-question marks
    const upsertsQ = [];
    for (const row of marksState.rows) {
      for (const q of row.perQ) {
        upsertsQ.push({
          runid, examid, studentno: row.studentno,
          qno: q.qno, mark: clamp01Mark(q.mark), max_mark: 1,
          updated_by_email: userEmail,
          updated_at: new Date().toISOString(),
        });
      }
    }
    if (upsertsQ.length) {
      const { error: upErr } = await supabase
        .from("student_question_marks")
        .upsert(upsertsQ, { onConflict: "runid,examid,studentno,qno" });
      if (upErr) throw upErr;
    }

    // 2) update student_exam_result totals
    const studentNos = marksState.rows.map((r) => r.studentno);
    const { data: existingRes, error: exErr } = await supabase
      .from("student_exam_result")
      .select("studentno, didnottakeexam")
      .eq("runid", runid).eq("examid", examid)
      .in("studentno", studentNos);
    if (exErr) throw exErr;

    const didMap = new Map((existingRes || []).map((r) => [r.studentno, !!r.didnottakeexam]));

    const upsertsR = marksState.rows.map((row) => {
      const sum = row.perQ.reduce((a, q) => a + clamp01Mark(q.mark), 0);
      const maxSum = qCount || row.perQ.length || 0;
      const didnottakeexam = didMap.get(row.studentno) || false;
      const totalStr = didnottakeexam ? `0/${maxSum}` : `${sum}/${maxSum}`;
      return {
        runid, examid, studentno: row.studentno,
        teacherid: currentUser.id,
        classid: marksState.classId,
        sectionid: marksState.sectionId,
        total: totalStr,
        didnottakeexam,
        gotfullmark: (!didnottakeexam && maxSum > 0 && sum >= maxSum),
        hasmistakes: (!didnottakeexam && sum < maxSum),
        updated_by_email: userEmail,
        updated_at: new Date().toISOString(),
      };
    });

    const { error: resUpErr } = await supabase
      .from("student_exam_result")
      .upsert(upsertsR, { onConflict: "runid,examid,studentno" });
    if (resUpErr) throw resUpErr;

    // 3) sync back to Student_Exam_answer
    await saveMarksToStudentExamAnswer({
      runid, examId: examid, rows: marksState.rows, questionCount: qCount,
      teacherid: currentUser.id, classid: marksState.classId, sectionid: marksState.sectionId,
    });

    alert("✅ Marks saved successfully!");
  } catch (e) {
    console.error("saveEditedMarks error:", e);
    alert("❌ Failed to save marks:\n\n" + (e?.message || e));
  } finally {
    hideLoading(marksLoading);
  }
}

if (saveEditedMarksBtn) {
  saveEditedMarksBtn.addEventListener("click", saveEditedMarks);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   Videos manager
   ========================= */
async function initVideosPage() {
  const Q_COUNT = 50;
  const Q_COLS = Array.from({ length: Q_COUNT }, (_, i) => `Q${i + 1}`);
  const Q_SELECT = Q_COLS.join(",");
  const BASE_SEL = `classid,subjectid,teacherid,${Q_SELECT}`;

  const viewEl = document.getElementById("view-videos");
  if (!viewEl) return;

  viewEl.innerHTML = `
    <h1 class="hello">Videos</h1>
    <div class="subcard" id="videos-subcard">
      <div class="subcard-title">Add / Update a Video</div>
      <div class="subcard-note">
        Choose the class, subject, <strong>question number</strong>, then paste the YouTube URL.
      </div>
      <div class="form-grid">
        <div class="field"><label>Class</label><select id="vidAddClass"></select></div>
        <div class="field"><label>Subject</label><select id="vidAddSubject"></select></div>
        <div class="field">
          <label>Question Number</label>
          <select id="vidAddQuestion">
            <option value="">Select question...</option>
            ${Array.from({ length: Q_COUNT }, (_, i) =>
    `<option value="Q${i + 1}">Question ${i + 1}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>YouTube URL</label>
          <input id="vidAddUrl" placeholder="https://www.youtube.com/watch?v=..." />
        </div>
      </div>
      <div class="marks-actions">
        <button class="save-marks-btn" id="vidAddBtn" type="button">
          <i class="fa-solid fa-plus"></i> Save Video
        </button>
      </div>
      <div id="vidAddMsg" style="margin-top:6px; font-size:13px; font-weight:700;"></div>
      <div class="divider soft" style="margin:18px 0;"></div>
      <div class="subcard-title">My Videos</div>
      <div class="subcard-note">All videos assigned to your questions.</div>
      <div id="videosLoading" class="white-loading hidden">Loading videos...</div>
      <div id="videosList"></div>
    </div>
  `;

  const { data: tcsRows, error: tcsErr } = await supabase
    .from("teacher_class_section")
    .select("classid, subjectid")
    .eq("teacherid", currentUser.id);

  const listEl = document.getElementById("videosList");
  const loadingEl = document.getElementById("videosLoading");

  if (tcsErr) {
    listEl.innerHTML = `<div style="color:#f87171;">Error loading assignments: ${tcsErr.message}</div>`;
    return;
  }

  const assignments = tcsRows || [];
  if (!assignments.length) {
    listEl.innerHTML = `<div style="color:white;font-weight:700;">You have no class/subject assignments yet.</div>`;
    return;
  }

  const uniqueClassIds = [...new Set(assignments.map(a => a.classid))];
  const uniqueSubjectIds = [...new Set(assignments.map(a => a.subjectid).filter(Boolean))];

  const [classesRes, subjectsRes] = await Promise.all([
    supabase.from("class_info").select("classid,classname").in("classid", uniqueClassIds),
    uniqueSubjectIds.length
      ? supabase.from("subject_info").select("subjectid,subjectname").in("subjectid", uniqueSubjectIds)
      : Promise.resolve({ data: [] }),
  ]);

  const classMap = new Map((classesRes.data || []).map(c => [c.classid, c.classname]));
  const subjectMap = new Map((subjectsRes.data || []).map(s => [s.subjectid, s.subjectname]));

  const addClassEl = document.getElementById("vidAddClass");
  const addSubjectEl = document.getElementById("vidAddSubject");

  addClassEl.innerHTML = `<option value="">Select class...</option>` +
    uniqueClassIds.map(id => `<option value="${id}">${classMap.get(id) || `Class ${id}`}</option>`).join("");
  addSubjectEl.innerHTML = `<option value="">Select subject...</option>` +
    uniqueSubjectIds.map(id => `<option value="${id}">${subjectMap.get(id) || `Subject ${id}`}</option>`).join("");

  async function loadVideos() {
    showLoading(loadingEl, "Loading videos...");
    listEl.innerHTML = "";
    try {
      const { data: videoRows, error: vidErr } = await supabase
        .from("videos").select(BASE_SEL).eq("teacherid", currentUser.id).order("classid", { ascending: true });
      if (vidErr) throw vidErr;
      const rows = videoRows || [];
      if (!rows.length) {
        listEl.innerHTML = `<div style="color:#94a3b8; padding:16px 0; font-size:14px;">No videos yet. Use the form above to add your first video.</div>`;
        return;
      }
      for (const row of rows) {
        const className = classMap.get(row.classid) || `Class ${row.classid}`;
        const subjectName = subjectMap.get(row.subjectid) || `Subject ${row.subjectid}`;
        const filled = Q_COLS.map((col, i) => ({ qNum: i + 1, col, url: row[col] }))
          .filter(e => e.url && String(e.url).trim() !== "");
        const section = document.createElement("div");
        section.style.cssText = "margin-bottom:28px;";
        section.innerHTML = `
          <div style="font-size:13px; font-weight:800; color:#818cf8; margin-bottom:12px;
            padding-bottom:8px; border-bottom:1px solid rgba(99,102,241,0.25);
            text-transform:uppercase; letter-spacing:0.05em;">
            📚 ${className} &nbsp;/&nbsp; ${subjectName}
            <span style="font-size:11px;color:#475569;font-weight:500;text-transform:none;letter-spacing:0;margin-left:8px;">
              (${filled.length} video${filled.length !== 1 ? "s" : ""})
            </span>
          </div>
        `;
        if (!filled.length) {
          section.innerHTML += `<div style="color:#475569;font-size:13px;font-style:italic;padding:6px 0;">No videos uploaded for this class/subject yet.</div>`;
        }
        for (const { qNum, col, url } of filled) {
          const ytMatch = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
          const vidId = ytMatch?.[1] || null;
          const thumbHtml = vidId ? `
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="flex-shrink:0; display:block;">
              <img src="https://img.youtube.com/vi/${vidId}/mqdefault.jpg"
                style="width:140px; height:79px; object-fit:cover; border-radius:8px;
                       border:1px solid rgba(255,255,255,0.08); display:block;"
                onerror="this.style.display='none'" alt="Q${qNum} thumbnail" />
            </a>` : "";
          const inputId = `vid-inp-${row.classid}-${row.subjectid}-${col}`;
          const card = document.createElement("div");
          card.className = "list-card";
          card.style.marginBottom = "10px";
          card.innerHTML = `
            <div style="display:flex; align-items:center; gap:14px; flex-wrap:nowrap;">
              ${thumbHtml}
              <div style="flex:1; min-width:0;">
                <div style="font-size:12px; font-weight:800; color:#a5b4fc; margin-bottom:5px;">
                  <span style="background:rgba(99,102,241,0.2);color:#818cf8;padding:2px 10px;border-radius:20px;font-size:11px;">Question ${qNum}</span>
                  <span style="color:#475569;font-size:11px;font-weight:500;">${className} / ${subjectName}</span>
                </div>
                <input class="mark-input" id="${inputId}" value="${escapeHtml(url)}" placeholder="YouTube URL" style="width:100%;" />
              </div>
              <div style="flex-shrink:0; display:flex; flex-direction:column; gap:6px;">
                <button class="small-btn" data-vsave data-classid="${row.classid}" data-subjectid="${row.subjectid}" data-col="${col}" data-inputid="${inputId}" type="button">💾 Save</button>
                <button class="small-btn danger" data-vdel data-classid="${row.classid}" data-subjectid="${row.subjectid}" data-col="${col}" type="button">🗑 Delete</button>
              </div>
            </div>
          `;
          section.appendChild(card);
        }
        listEl.appendChild(section);
      }
      listEl.querySelectorAll("[data-vsave]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const classid = Number(btn.dataset.classid);
          const subjectid = Number(btn.dataset.subjectid);
          const col = btn.dataset.col;
          const inputEl = document.getElementById(btn.dataset.inputid);
          const newUrl = (inputEl?.value || "").trim();
          if (!newUrl) { alert("URL cannot be empty."); return; }
          btn.disabled = true; btn.textContent = "Saving...";
          const { error } = await supabase.from("videos").update({ [col]: newUrl })
            .eq("classid", classid).eq("subjectid", subjectid).eq("teacherid", currentUser.id);
          btn.disabled = false; btn.innerHTML = "💾 Save";
          if (error) { alert("Save failed: " + error.message); return; }
          await loadVideos();
        });
      });
      listEl.querySelectorAll("[data-vdel]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const col = btn.dataset.col;
          const qNum = parseInt(col.replace("Q", ""), 10);
          if (!confirm(`Remove the video for Question ${qNum}?`)) return;
          btn.disabled = true; btn.textContent = "Removing...";
          const { error } = await supabase.from("videos").update({ [col]: null })
            .eq("classid", Number(btn.dataset.classid)).eq("subjectid", Number(btn.dataset.subjectid)).eq("teacherid", currentUser.id);
          if (error) { btn.disabled = false; btn.innerHTML = "🗑 Delete"; alert("Remove failed: " + error.message); return; }
          await loadVideos();
        });
      });
    } catch (e) {
      console.error("videos load error:", e);
      listEl.innerHTML = `<div style="color:#f87171;font-weight:700;">Failed to load videos: ${e.message}</div>`;
    } finally {
      hideLoading(loadingEl);
    }
  }

  document.getElementById("vidAddBtn")?.addEventListener("click", async () => {
    const classId = Number(addClassEl?.value || 0) || null;
    const subjectId = Number(addSubjectEl?.value || 0) || null;
    const col = document.getElementById("vidAddQuestion")?.value || "";
    const url = (document.getElementById("vidAddUrl")?.value || "").trim();
    const msgEl = document.getElementById("vidAddMsg");
    const showMsg = (txt, ok = true) => {
      if (!msgEl) return;
      msgEl.style.color = ok ? "#4ade80" : "#f87171";
      msgEl.textContent = txt;
      setTimeout(() => { if (msgEl) msgEl.textContent = ""; }, 4000);
    };
    if (!classId) { showMsg("Please select a class.", false); return; }
    if (!subjectId) { showMsg("Please select a subject.", false); return; }
    if (!col) { showMsg("Please select a question number.", false); return; }
    if (!url) { showMsg("Please paste a YouTube URL.", false); return; }
    try { new URL(url); } catch { showMsg("Invalid URL.", false); return; }
    const btn = document.getElementById("vidAddBtn");
    btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
    try {
      const { data: existing, error: fetchErr } = await supabase.from("videos").select("classid")
        .eq("classid", classId).eq("subjectid", subjectId).eq("teacherid", currentUser.id).maybeSingle();
      if (fetchErr) throw fetchErr;
      if (existing) {
        const { error } = await supabase.from("videos").update({ [col]: url })
          .eq("classid", classId).eq("subjectid", subjectId).eq("teacherid", currentUser.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("videos").insert({ classid: classId, subjectid: subjectId, teacherid: currentUser.id, [col]: url });
        if (error) throw error;
      }
      addClassEl.value = ""; addSubjectEl.value = "";
      document.getElementById("vidAddQuestion").value = "";
      document.getElementById("vidAddUrl").value = "";
      showMsg(`✅ Video saved for ${col.replace("Q", "Question ")}!`);
      await loadVideos();
    } catch (e) {
      console.error("add video error:", e);
      showMsg("Failed: " + (e.message || e), false);
    } finally {
      btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-plus"></i> Save Video`;
    }
  });

  await loadVideos();
}

/* =================================================================
   ADMIN PANEL
   ================================================================= */
function isAdmin() { return currentUser.role === "admin"; }
function adminEl(id) { return document.getElementById(id); }
function showAdminMsg(containerId, msg, isError = false) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="admin-msg ${isError ? "admin-msg-err" : "admin-msg-ok"}">${msg}</div>`;
  setTimeout(() => { if (el) el.innerHTML = ""; }, 4000);
}

/* ======================== OVERVIEW ======================== */
async function loadAdminOverview() {
  const container = adminEl("admin-overview-content");
  if (!container) return;
  container.innerHTML = `<div class="admin-loading">Loading overview...</div>`;
  try {
    const results = await Promise.all([
      supabase.from("supervisor_info").select("*", { count: "exact", head: true }),
      supabase.from("teacher_info").select("*", { count: "exact", head: true }),
      supabase.from("student_info").select("*", { count: "exact", head: true }),
      supabase.from("class_info").select("*", { count: "exact", head: true }),
      supabase.from("exam_info").select("*", { count: "exact", head: true }),
      supabase.from("supervisor_info").select("supervisorid, supervisorname, supervisoremail"),
    ]);
    const [supCountRes, teachCountRes, stuCountRes, classCountRes, examCountRes, supListRes] = results;
    const firstErr = [supCountRes, teachCountRes, stuCountRes, classCountRes, examCountRes, supListRes].map((r) => r?.error).find(Boolean);
    if (firstErr) throw firstErr;
    const stats = [
      { label: "Supervisors", value: supCountRes.count ?? 0, icon: "👔" },
      { label: "Teachers", value: teachCountRes.count ?? 0, icon: "🧑‍🏫" },
      { label: "Students", value: stuCountRes.count ?? 0, icon: "🎓" },
      { label: "Classes", value: classCountRes.count ?? 0, icon: "🏫" },
      { label: "Exams", value: examCountRes.count ?? 0, icon: "📋" },
    ];
    const { data: stLinks } = await supabase.from("supervisor_teacher").select("supervisorid, teacherid");
    const { data: allTeachers } = await supabase.from("teacher_info").select("teacherid, teachername, teacheremail");
    const { data: tcs } = await supabase.from("teacher_class_section").select("teacherid, classid, sectionid, class_info(classname), section_info(sectionname)");
    const teacherMap = new Map((allTeachers || []).map((t) => [t.teacherid, t]));
    const tcsMap = new Map();
    for (const r of tcs || []) {
      if (!tcsMap.has(r.teacherid)) tcsMap.set(r.teacherid, []);
      tcsMap.get(r.teacherid).push(r);
    }
    const supervisors = supListRes.data;
    let html = `
      <div class="admin-stats-grid">
        ${stats.map((s) => `
          <div class="admin-stat-card">
            <div class="admin-stat-icon">${s.icon}</div>
            <div class="admin-stat-value">${s.value}</div>
            <div class="admin-stat-label">${s.label}</div>
          </div>
        `).join("")}
      </div>
      <h3 class="admin-section-heading">Supervisor → Teacher Hierarchy</h3>
    `;
    const assignedTeacherIds = new Set((stLinks || []).map((l) => l.teacherid));
    for (const sup of supervisors || []) {
      const myTeacherIds = (stLinks || []).filter((l) => l.supervisorid === sup.supervisorid).map((l) => l.teacherid);
      html += `<div class="admin-hierarchy-card"><div class="admin-hierarchy-supervisor"><span class="admin-badge admin-badge-sup">SUPERVISOR</span><strong>${sup.supervisorname}</strong><span class="admin-hierarchy-email">${sup.supervisoremail || ""}</span></div>`;
      if (!myTeacherIds.length) {
        html += `<div class="admin-hierarchy-empty">No teachers assigned</div>`;
      } else {
        for (const tid of myTeacherIds) {
          const t = teacherMap.get(tid);
          if (!t) continue;
          const classes = tcsMap.get(tid) || [];
          const classStr = classes.length
            ? classes.map((c) => `${c.class_info?.classname || c.classid} / ${c.section_info?.sectionname || c.sectionid}`).join(", ")
            : "No classes assigned";
          html += `<div class="admin-hierarchy-teacher"><span class="admin-badge admin-badge-teach">TEACHER</span><strong>${t.teachername}</strong><span class="admin-hierarchy-email">${t.teacheremail || ""}</span><div class="admin-hierarchy-classes">${classStr}</div></div>`;
        }
      }
      html += `</div>`;
    }
    const unassigned = (allTeachers || []).filter((t) => !assignedTeacherIds.has(t.teacherid));
    if (unassigned.length) {
      html += `<h3 class="admin-section-heading" style="margin-top:24px;">Unassigned Teachers</h3><div class="admin-hierarchy-card">`;
      for (const t of unassigned) {
        html += `<div class="admin-hierarchy-teacher"><span class="admin-badge admin-badge-teach">TEACHER</span><strong>${t.teachername}</strong><span class="admin-hierarchy-email">${t.teacheremail || ""}</span></div>`;
      }
      html += `</div>`;
    }
    container.innerHTML = html;
  } catch (e) {
    console.error("overview error:", e);
    container.innerHTML = `<div class="admin-err">Failed to load overview.</div>`;
  }
}

/* ======================== SUPERVISORS ======================== */
async function loadAdminSupervisors() {
  const container = adminEl("admin-supervisors-content");
  if (!container) return;
  container.innerHTML = `<div class="admin-loading">Loading...</div>`;
  try {
    const { data: supervisors, error } = await supabase.from("supervisor_info").select("supervisorid, supervisorname, supervisoremail, userid").order("supervisorid").limit(10000);
    if (error) throw error;
    const { data: stLinks } = await supabase.from("supervisor_teacher").select("supervisorid, teacherid");
    const { data: allTeachers } = await supabase.from("teacher_info").select("teacherid, teachername, teacheremail");
    const teacherMap = new Map((allTeachers || []).map((t) => [t.teacherid, t]));
    let html = `<div class="admin-section-block"><h3 class="admin-section-heading">All Supervisors</h3><div id="admin-sup-msg"></div>`;
    for (const sup of supervisors || []) {
      const myLinks = (stLinks || []).filter((l) => l.supervisorid === sup.supervisorid);
      const teacherPills = myLinks.map((l) => {
        const t = teacherMap.get(l.teacherid);
        return t ? `<span class="admin-pill">${t.teachername} <button class="admin-pill-remove" data-sup="${sup.supervisorid}" data-teach="${l.teacherid}" title="Remove">✕</button></span>` : "";
      }).join("");
      const availableTeachers = (allTeachers || []).filter((t) => !myLinks.some((l) => l.teacherid === t.teacherid));
      const teacherOpts = availableTeachers.map((t) => `<option value="${t.teacherid}">${t.teachername}</option>`).join("");
      html += `
        <div class="admin-entity-card">
          <div class="admin-entity-header">
            <div><span class="admin-badge admin-badge-sup">SUP #${sup.supervisorid}</span><strong>${sup.supervisorname}</strong></div>
            <div class="admin-entity-actions">
              <button class="admin-btn-edit" data-sup-edit="${sup.supervisorid}">✏️</button>
              <button class="admin-btn-del" data-sup-del="${sup.supervisorid}">🗑️</button>
            </div>
          </div>
          <div class="admin-entity-email">${sup.supervisoremail || ""}</div>
          <div class="admin-edit-form hidden" id="sup-edit-form-${sup.supervisorid}">
            <div class="admin-inline-fields">
              <input class="admin-input" id="sup-edit-name-${sup.supervisorid}" value="${escapeHtml(sup.supervisorname || "")}" placeholder="Name" />
              <input class="admin-input" id="sup-edit-email-${sup.supervisorid}" value="${escapeHtml(sup.supervisoremail || "")}" placeholder="Email" />
              <button class="admin-btn-save" data-sup-save="${sup.supervisorid}">Save</button>
              <button class="admin-btn-cancel" data-sup-cancel="${sup.supervisorid}">Cancel</button>
            </div>
          </div>
          <div class="admin-assign-section">
            <div class="admin-assign-label">Teachers:</div>
            <div class="admin-pills">${teacherPills || "<span class='admin-none'>None</span>"}</div>
            ${availableTeachers.length ? `<div class="admin-assign-row"><select class="admin-input admin-select-sm" id="sup-assign-sel-${sup.supervisorid}"><option value="">Assign teacher...</option>${teacherOpts}</select><button class="admin-btn-assign" data-sup-assign="${sup.supervisorid}">+ Assign</button></div>` : ""}
          </div>
        </div>
      `;
    }
    html += `
      <div class="admin-add-card">
        <h4 class="admin-add-title">➕ Add New Supervisor</h4>
        <div class="admin-inline-fields">
          <input class="admin-input" id="new-sup-id" placeholder="SupervisorID" />
          <input class="admin-input" id="new-sup-name" placeholder="Name" />
          <input class="admin-input" id="new-sup-email" placeholder="Email" />
          <input class="admin-input" id="new-sup-userid" placeholder="UserID" />
          <button class="admin-btn-primary" id="btn-add-supervisor">Add</button>
        </div>
      </div></div>
    `;
    container.innerHTML = html;
    container.querySelectorAll("[data-sup-edit]").forEach((btn) => {
      const sid = Number(btn.getAttribute("data-sup-edit"));
      btn.addEventListener("click", () => document.getElementById(`sup-edit-form-${sid}`)?.classList.toggle("hidden"));
    });
    container.querySelectorAll("[data-sup-cancel]").forEach((btn) => {
      const sid = Number(btn.getAttribute("data-sup-cancel"));
      btn.addEventListener("click", () => document.getElementById(`sup-edit-form-${sid}`)?.classList.add("hidden"));
    });
    container.querySelectorAll("[data-sup-save]").forEach((btn) => {
      const sid = Number(btn.getAttribute("data-sup-save"));
      btn.addEventListener("click", async () => {
        const name = document.getElementById(`sup-edit-name-${sid}`)?.value?.trim();
        const email = document.getElementById(`sup-edit-email-${sid}`)?.value?.trim();
        if (!name) { alert("Name required."); return; }
        const { error } = await supabase.from("supervisor_info").update({ supervisorname: name, supervisoremail: email }).eq("supervisorid", sid);
        if (error) { alert("Update failed: " + error.message); return; }
        showAdminMsg("admin-sup-msg", "Updated ✅");
        await loadAdminSupervisors();
      });
    });
    container.querySelectorAll("[data-sup-del]").forEach((btn) => {
      const sid = Number(btn.getAttribute("data-sup-del"));
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this supervisor?")) return;
        await supabase.from("supervisor_teacher").delete().eq("supervisorid", sid);
        const { error } = await supabase.from("supervisor_info").delete().eq("supervisorid", sid);
        if (error) { alert("Delete failed: " + error.message); return; }
        showAdminMsg("admin-sup-msg", "Deleted ✅");
        await loadAdminSupervisors();
      });
    });
    container.querySelectorAll("[data-sup-assign]").forEach((btn) => {
      const sid = Number(btn.getAttribute("data-sup-assign"));
      btn.addEventListener("click", async () => {
        const sel = document.getElementById(`sup-assign-sel-${sid}`);
        const tid = Number(sel?.value || 0);
        if (!tid) { alert("Select a teacher."); return; }
        const { error } = await supabase.from("supervisor_teacher").insert({ supervisorid: sid, teacherid: tid });
        if (error) { alert("Assign failed: " + error.message); return; }
        showAdminMsg("admin-sup-msg", "Assigned ✅");
        await loadAdminSupervisors();
      });
    });
    container.querySelectorAll(".admin-pill-remove").forEach((btn) => {
      const sid = Number(btn.getAttribute("data-sup"));
      const tid = Number(btn.getAttribute("data-teach"));
      btn.addEventListener("click", async () => {
        if (!confirm("Remove teacher from supervisor?")) return;
        const { error } = await supabase.from("supervisor_teacher").delete().eq("supervisorid", sid).eq("teacherid", tid);
        if (error) { alert("Remove failed: " + error.message); return; }
        showAdminMsg("admin-sup-msg", "Removed ✅");
        await loadAdminSupervisors();
      });
    });
    document.getElementById("btn-add-supervisor")?.addEventListener("click", async () => {
      const sidRaw = document.getElementById("new-sup-id")?.value?.trim();
      const name = document.getElementById("new-sup-name")?.value?.trim();
      const email = document.getElementById("new-sup-email")?.value?.trim();
      const useridRaw = document.getElementById("new-sup-userid")?.value?.trim();
      if (!name || !email) { alert("Name and email required."); return; }
      try {
        await provisionAccount({ type: "supervisor", name, email, profileId: sidRaw ? Number(sidRaw) : null, userid: useridRaw ? Number(useridRaw) : null });
        showAdminMsg("admin-sup-msg", `Created ✅ (temp password: ${TEMP_PASSWORD})`);
        await loadAdminSupervisors();
      } catch (e) { alert("Failed: " + (e?.message || e)); }
    });
  } catch (e) {
    console.error("supervisors error:", e);
    container.innerHTML = `<div class="admin-err">Failed to load supervisors.</div>`;
  }
}

/* ======================== TEACHERS ======================== */
async function loadAdminTeachers() {
  const container = adminEl("admin-teachers-content");
  if (!container) return;
  container.innerHTML = `<div class="admin-loading">Loading...</div>`;
  try {
    const { data: teachers, error } = await supabase.from("teacher_info").select("teacherid, teachername, teacheremail, userid").order("teacherid").limit(10000);
    if (error) throw error;
    const { data: tcs } = await supabase.from("teacher_class_section").select("teacherid, classid, sectionid, subjectid, class_info(classname), section_info(sectionname)");
    const { data: allClasses } = await supabase.from("class_info").select("classid, classname");
    const { data: allSections } = await supabase.from("section_info").select("sectionid, sectionname");
    const { data: allSubjects } = await supabase.from("subject_info").select("subjectid, subjectname");
    const tcsMap = new Map();
    for (const r of tcs || []) {
      if (!tcsMap.has(r.teacherid)) tcsMap.set(r.teacherid, []);
      tcsMap.get(r.teacherid).push(r);
    }
    const classOpts = (allClasses || []).map((c) => `<option value="${c.classid}">${c.classname}</option>`).join("");
    const secOpts = (allSections || []).map((s) => `<option value="${s.sectionid}">${s.sectionname}</option>`).join("");
    const subOpts = (allSubjects || []).map((s) => `<option value="${s.subjectid}">${s.subjectname}</option>`).join("");
    let html = `<div class="admin-section-block"><h3 class="admin-section-heading">All Teachers</h3><div id="admin-teach-msg"></div>`;
    for (const t of teachers || []) {
      const myTCS = tcsMap.get(t.teacherid) || [];
      const classPills = myTCS.map((r) =>
        `<span class="admin-pill">${r.class_info?.classname || r.classid} / ${r.section_info?.sectionname || r.sectionid} <button class="admin-pill-remove" data-tcs-teach="${t.teacherid}" data-tcs-class="${r.classid}" data-tcs-sec="${r.sectionid}" title="Remove">✕</button></span>`
      ).join("");
      html += `
        <div class="admin-entity-card">
          <div class="admin-entity-header">
            <div><span class="admin-badge admin-badge-teach">TEACHER #${t.teacherid}</span><strong>${t.teachername}</strong></div>
            <div class="admin-entity-actions">
              <button class="admin-btn-edit" data-teach-edit="${t.teacherid}">✏️</button>
              <button class="admin-btn-del" data-teach-del="${t.teacherid}">🗑️</button>
            </div>
          </div>
          <div class="admin-entity-email">${t.teacheremail || ""}</div>
          <div class="admin-edit-form hidden" id="teach-edit-form-${t.teacherid}">
            <div class="admin-inline-fields">
              <input class="admin-input" id="teach-edit-name-${t.teacherid}" value="${escapeHtml(t.teachername || "")}" placeholder="Name" />
              <input class="admin-input" id="teach-edit-email-${t.teacherid}" value="${escapeHtml(t.teacheremail || "")}" placeholder="Email" />
              <button class="admin-btn-save" data-teach-save="${t.teacherid}">Save</button>
              <button class="admin-btn-cancel" data-teach-cancel="${t.teacherid}">Cancel</button>
            </div>
          </div>
          <div class="admin-assign-section">
            <div class="admin-assign-label">Classes & Sections:</div>
            <div class="admin-pills">${classPills || "<span class='admin-none'>None</span>"}</div>
            <div class="admin-assign-row">
              <select class="admin-input admin-select-sm" id="teach-assign-class-${t.teacherid}"><option value="">Class...</option>${classOpts}</select>
              <select class="admin-input admin-select-sm" id="teach-assign-sec-${t.teacherid}"><option value="">Section...</option>${secOpts}</select>
              <select class="admin-input admin-select-sm" id="teach-assign-sub-${t.teacherid}"><option value="">Subject...</option>${subOpts}</select>
              <button class="admin-btn-assign" data-teach-assign="${t.teacherid}">+ Assign</button>
            </div>
          </div>
        </div>
      `;
    }
    html += `
      <div class="admin-add-card">
        <h4 class="admin-add-title">➕ Add New Teacher</h4>
        <div class="admin-inline-fields">
          <input class="admin-input" id="new-teach-id" placeholder="TeacherID" />
          <input class="admin-input" id="new-teach-name" placeholder="Name" />
          <input class="admin-input" id="new-teach-email" placeholder="Email" />
          <input class="admin-input" id="new-teach-userid" placeholder="UserID" />
          <button class="admin-btn-primary" id="btn-add-teacher">Add</button>
        </div>
      </div></div>
    `;
    container.innerHTML = html;
    container.querySelectorAll("[data-teach-edit]").forEach((btn) => {
      const tid = Number(btn.getAttribute("data-teach-edit"));
      btn.addEventListener("click", () => document.getElementById(`teach-edit-form-${tid}`)?.classList.toggle("hidden"));
    });
    container.querySelectorAll("[data-teach-cancel]").forEach((btn) => {
      const tid = Number(btn.getAttribute("data-teach-cancel"));
      btn.addEventListener("click", () => document.getElementById(`teach-edit-form-${tid}`)?.classList.add("hidden"));
    });
    container.querySelectorAll("[data-teach-save]").forEach((btn) => {
      const tid = Number(btn.getAttribute("data-teach-save"));
      btn.addEventListener("click", async () => {
        const name = document.getElementById(`teach-edit-name-${tid}`)?.value?.trim();
        const email = document.getElementById(`teach-edit-email-${tid}`)?.value?.trim();
        if (!name) { alert("Name required."); return; }
        const { error } = await supabase.from("teacher_info").update({ teachername: name, teacheremail: email }).eq("teacherid", tid);
        if (error) { alert("Update failed: " + error.message); return; }
        showAdminMsg("admin-teach-msg", "Updated ✅");
        await loadAdminTeachers();
      });
    });
    container.querySelectorAll("[data-teach-del]").forEach((btn) => {
      const tid = Number(btn.getAttribute("data-teach-del"));
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this teacher?")) return;
        await supabase.from("teacher_class_section").delete().eq("teacherid", tid);
        await supabase.from("supervisor_teacher").delete().eq("teacherid", tid);
        const { error } = await supabase.from("teacher_info").delete().eq("teacherid", tid);
        if (error) { alert("Delete failed: " + error.message); return; }
        showAdminMsg("admin-teach-msg", "Deleted ✅");
        await loadAdminTeachers();
      });
    });
    container.querySelectorAll("[data-teach-assign]").forEach((btn) => {
      const tid = Number(btn.getAttribute("data-teach-assign"));
      btn.addEventListener("click", async () => {
        const classId = Number(document.getElementById(`teach-assign-class-${tid}`)?.value || 0);
        const secId = Number(document.getElementById(`teach-assign-sec-${tid}`)?.value || 0);
        const subId = Number(document.getElementById(`teach-assign-sub-${tid}`)?.value || 0) || null;
        if (!classId || !secId) { alert("Select class and section."); return; }
        const { error } = await supabase.from("teacher_class_section").insert({ teacherid: tid, classid: classId, sectionid: secId, subjectid: subId });
        if (error) { alert("Assign failed: " + error.message); return; }
        showAdminMsg("admin-teach-msg", "Assigned ✅");
        await loadAdminTeachers();
      });
    });
    container.querySelectorAll(".admin-pill-remove[data-tcs-teach]").forEach((btn) => {
      const tid = Number(btn.getAttribute("data-tcs-teach"));
      const cid = Number(btn.getAttribute("data-tcs-class"));
      const sid = Number(btn.getAttribute("data-tcs-sec"));
      btn.addEventListener("click", async () => {
        if (!confirm("Remove this class/section?")) return;
        const { error } = await supabase.from("teacher_class_section").delete().eq("teacherid", tid).eq("classid", cid).eq("sectionid", sid);
        if (error) { alert("Remove failed: " + error.message); return; }
        showAdminMsg("admin-teach-msg", "Removed ✅");
        await loadAdminTeachers();
      });
    });
    document.getElementById("btn-add-teacher")?.addEventListener("click", async () => {
      const tidRaw = document.getElementById("new-teach-id")?.value?.trim();
      const name = document.getElementById("new-teach-name")?.value?.trim();
      const email = document.getElementById("new-teach-email")?.value?.trim();
      const useridRaw = document.getElementById("new-teach-userid")?.value?.trim();
      if (!name || !email) { alert("Name and email required."); return; }
      try {
        await provisionAccount({ type: "teacher", name, email, profileId: tidRaw ? Number(tidRaw) : null, userid: useridRaw ? Number(useridRaw) : null });
        showAdminMsg("admin-teach-msg", `Created ✅ (temp password: ${TEMP_PASSWORD})`);
        await loadAdminTeachers();
      } catch (e) { alert("Failed: " + (e?.message || e)); }
    });
  } catch (e) {
    console.error("teachers error:", e);
    container.innerHTML = `<div class="admin-err">Failed to load teachers.</div>`;
  }
}

/* ======================== STUDENTS ======================== */
async function loadAdminStudents() {
  const container = adminEl("admin-students-content");
  if (!container) return;
  container.innerHTML = `<div class="admin-loading">Loading...</div>`;
  try {
    const { data: classes } = await supabase.from("class_info").select("classid, classname").order("classid");
    const { data: sections } = await supabase.from("section_info").select("sectionid, sectionname").order("sectionid");
    let currentClassFilter = "";
    let currentSearch = "";
    const classOpts = (classes || []).map(c => `<option value="${c.classid}">${c.classname}</option>`).join("");
    const secOpts = (sections || []).map(s => `<option value="${s.sectionid}">${s.sectionname}</option>`).join("");
    let html = `
      <div class="admin-section-block">
        <h3 class="admin-section-heading">All Students</h3>
        <div id="admin-stu-msg"></div>
        <div class="admin-filter-row">
          <input class="admin-input" id="admin-stu-search" placeholder="🔍 Search by name or email..." />
          <select class="admin-input admin-select-sm" id="admin-stu-class-filter">
            <option value="">All Classes</option>${classOpts}
          </select>
        </div>
        <div id="admin-students-table"></div>
        <div class="admin-add-card" style="margin-top:16px;">
          <h4 class="admin-add-title">➕ Add New Student</h4>
          <div class="admin-inline-fields">
            <input class="admin-input" id="new-stu-no" placeholder="Student No" type="number" />
            <input class="admin-input" id="new-stu-name" placeholder="Full Name" />
            <input class="admin-input" id="new-stu-email" placeholder="Email" />
            <button class="admin-btn-primary" id="btn-add-student">Add Student</button>
          </div>
          <div class="admin-assign-label" style="margin-top:12px;">Assign to Class/Section:</div>
          <div class="admin-inline-fields">
            <select class="admin-input admin-select-sm" id="new-stu-class"><option value="">Class...</option>${classOpts}</select>
            <select class="admin-input admin-select-sm" id="new-stu-sec"><option value="">Section...</option>${secOpts}</select>
          </div>
        </div>
      </div>
    `;
    container.innerHTML = html;
    async function renderStudentTable() {
      const tableEl = document.getElementById("admin-students-table");
      if (!tableEl) return;
      tableEl.innerHTML = `<div class="admin-loading">Loading students...</div>`;
      const { data: students, error } = await supabase.from("student_info").select("studentno, studentname, studentemail").order("studentno");
      if (error) { tableEl.innerHTML = `<div class="admin-err">Error loading students.</div>`; return; }
      const { data: scs } = await supabase.from("student_class_section").select("studentno, classid, sectionid");
      const classMap = new Map((classes || []).map(c => [c.classid, c.classname]));
      const secMap = new Map((sections || []).map(s => [s.sectionid, s.sectionname]));
      const scsMap = new Map();
      for (const r of (scs || [])) {
        if (!scsMap.has(r.studentno)) scsMap.set(r.studentno, []);
        scsMap.get(r.studentno).push(r);
      }
      let filtered = students || [];
      if (currentSearch) {
        const q2 = currentSearch.toLowerCase();
        filtered = filtered.filter(s => (s.studentname || "").toLowerCase().includes(q2) || (s.studentemail || "").toLowerCase().includes(q2));
      }
      if (currentClassFilter) {
        const cid = Number(currentClassFilter);
        const stuNosInClass = new Set((scs || []).filter(r => r.classid === cid).map(r => r.studentno));
        filtered = filtered.filter(s => stuNosInClass.has(s.studentno));
      }
      if (!filtered.length) { tableEl.innerHTML = `<div class="admin-none">No students found.</div>`; return; }
      let thtml = `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>No</th><th>Name</th><th>Email</th><th>Classes</th><th>Actions</th></tr></thead><tbody>`;
      for (const s of filtered) {
        const myCS = (scsMap.get(s.studentno) || []).map(r => `${classMap.get(r.classid) || r.classid}/${secMap.get(r.sectionid) || r.sectionid}`).join(", ");
        thtml += `
          <tr>
            <td>${s.studentno}</td>
            <td>
              <span id="stu-name-display-${s.studentno}">${s.studentname}</span>
              <div class="admin-inline-edit hidden" id="stu-edit-${s.studentno}">
                <input class="admin-input" id="stu-edit-name-${s.studentno}" value="${escapeHtml(s.studentname || "")}" />
                <input class="admin-input" id="stu-edit-email-${s.studentno}" value="${escapeHtml(s.studentemail || "")}" />
              </div>
            </td>
            <td id="stu-email-display-${s.studentno}">${s.studentemail || ""}</td>
            <td><small>${myCS || "None"}</small></td>
            <td>
              <button class="admin-btn-edit" data-stu-edit="${s.studentno}">✏️</button>
              <button class="admin-btn-save hidden" data-stu-save="${s.studentno}">💾</button>
              <button class="admin-btn-del" data-stu-del="${s.studentno}">🗑️</button>
            </td>
          </tr>
        `;
      }
      thtml += `</tbody></table></div>`;
      tableEl.innerHTML = thtml;
      tableEl.querySelectorAll("[data-stu-edit]").forEach(btn => {
        const sno = Number(btn.getAttribute("data-stu-edit"));
        btn.addEventListener("click", () => {
          document.getElementById(`stu-edit-${sno}`)?.classList.toggle("hidden");
          document.getElementById(`stu-name-display-${sno}`)?.classList.toggle("hidden");
          document.getElementById(`stu-email-display-${sno}`)?.classList.toggle("hidden");
          tableEl.querySelector(`[data-stu-save="${sno}"]`)?.classList.toggle("hidden");
        });
      });
      tableEl.querySelectorAll("[data-stu-save]").forEach(btn => {
        const sno = Number(btn.getAttribute("data-stu-save"));
        btn.addEventListener("click", async () => {
          const name = document.getElementById(`stu-edit-name-${sno}`)?.value?.trim();
          const email = document.getElementById(`stu-edit-email-${sno}`)?.value?.trim();
          const { error } = await supabase.from("student_info").update({ studentname: name, studentemail: email }).eq("studentno", sno);
          if (error) { alert("Update failed: " + error.message); return; }
          showAdminMsg("admin-stu-msg", "Updated ✅");
          await renderStudentTable();
        });
      });
      tableEl.querySelectorAll("[data-stu-del]").forEach(btn => {
        const sno = Number(btn.getAttribute("data-stu-del"));
        btn.addEventListener("click", async () => {
          if (!confirm("Delete this student?")) return;
          await supabase.from("student_class_section").delete().eq("studentno", sno);
          const { error } = await supabase.from("student_info").delete().eq("studentno", sno);
          if (error) { alert("Delete failed: " + error.message); return; }
          showAdminMsg("admin-stu-msg", "Deleted ✅");
          await renderStudentTable();
        });
      });
    }
    await renderStudentTable();
    document.getElementById("admin-stu-search")?.addEventListener("input", async (e) => { currentSearch = e.target.value.trim(); await renderStudentTable(); });
    document.getElementById("admin-stu-class-filter")?.addEventListener("change", async (e) => { currentClassFilter = e.target.value; await renderStudentTable(); });
    document.getElementById("btn-add-student")?.addEventListener("click", async () => {
      const no = Number(document.getElementById("new-stu-no")?.value || 0);
      const name = document.getElementById("new-stu-name")?.value?.trim();
      const email = document.getElementById("new-stu-email")?.value?.trim();
      const classId = Number(document.getElementById("new-stu-class")?.value || 0) || null;
      const secId = Number(document.getElementById("new-stu-sec")?.value || 0) || null;
      if (!no || !name || !email) { alert("Student number, name, and email required."); return; }
      try {
        const { error } = await supabase.from("student_info").insert({ studentno: no, studentname: name, studentemail: email });
        if (error) throw error;
        if (classId && secId) await supabase.from("student_class_section").insert({ studentno: no, classid: classId, sectionid: secId });
        showAdminMsg("admin-stu-msg", "Student created ✅");
        await renderStudentTable();
      } catch (e) { alert("Failed: " + (e?.message || e)); }
    });
  } catch (e) {
    console.error("students error:", e);
    container.innerHTML = `<div class="admin-err">Failed to load students.</div>`;
  }
}

/* ======================== CLASSES ======================== */
async function loadAdminClasses() {
  const container = adminEl("admin-classes-content");
  if (!container) return;
  container.innerHTML = `<div class="admin-loading">Loading...</div>`;
  try {
    const { data: classes } = await supabase.from("class_info").select("classid, classname").order("classid");
    const { data: sections } = await supabase.from("section_info").select("sectionid, sectionname").order("sectionid");
    const { data: subjects } = await supabase.from("subject_info").select("subjectid, subjectname").order("subjectid");
    let html = `<div id="admin-cls-msg"></div><div class="admin-three-col">`;
    html += `<div class="admin-section-block"><h3 class="admin-section-heading">🏫 Classes</h3><table class="admin-table"><thead><tr><th>ID</th><th>Name</th><th>Actions</th></tr></thead><tbody>`;
    for (const c of (classes || [])) html += `<tr><td>${c.classid}</td><td><input class="admin-input admin-input-sm" id="cls-name-${c.classid}" value="${escapeHtml(c.classname || "")}" /></td><td><button class="admin-btn-save" data-cls-save="${c.classid}">💾</button><button class="admin-btn-del" data-cls-del="${c.classid}">🗑️</button></td></tr>`;
    html += `</tbody></table><div class="admin-add-card"><div class="admin-inline-fields"><input class="admin-input" id="new-cls-name" placeholder="Class name" /><button class="admin-btn-primary" id="btn-add-class">+ Add</button></div></div></div>`;
    html += `<div class="admin-section-block"><h3 class="admin-section-heading">📁 Sections</h3><table class="admin-table"><thead><tr><th>ID</th><th>Name</th><th>Actions</th></tr></thead><tbody>`;
    for (const s of (sections || [])) html += `<tr><td>${s.sectionid}</td><td><input class="admin-input admin-input-sm" id="sec-name-${s.sectionid}" value="${escapeHtml(s.sectionname || "")}" /></td><td><button class="admin-btn-save" data-sec-save="${s.sectionid}">💾</button><button class="admin-btn-del" data-sec-del="${s.sectionid}">🗑️</button></td></tr>`;
    html += `</tbody></table><div class="admin-add-card"><div class="admin-inline-fields"><input class="admin-input" id="new-sec-name" placeholder="Section name" /><button class="admin-btn-primary" id="btn-add-section">+ Add</button></div></div></div>`;
    html += `<div class="admin-section-block"><h3 class="admin-section-heading">📚 Subjects</h3><table class="admin-table"><thead><tr><th>ID</th><th>Name</th><th>Actions</th></tr></thead><tbody>`;
    for (const s of (subjects || [])) html += `<tr><td>${s.subjectid}</td><td><input class="admin-input admin-input-sm" id="sub-name-${s.subjectid}" value="${escapeHtml(s.subjectname || "")}" /></td><td><button class="admin-btn-save" data-sub-save="${s.subjectid}">💾</button><button class="admin-btn-del" data-sub-del="${s.subjectid}">🗑️</button></td></tr>`;
    html += `</tbody></table><div class="admin-add-card"><div class="admin-inline-fields"><input class="admin-input" id="new-sub-name" placeholder="Subject name" /><button class="admin-btn-primary" id="btn-add-subject">+ Add</button></div></div></div>`;
    html += `</div>`;
    container.innerHTML = html;
    container.querySelectorAll("[data-cls-save]").forEach(btn => { const cid = Number(btn.getAttribute("data-cls-save")); btn.addEventListener("click", async () => { const name = document.getElementById(`cls-name-${cid}`)?.value?.trim(); if (!name) return; const { error } = await supabase.from("class_info").update({ classname: name }).eq("classid", cid); if (error) alert("Failed: " + error.message); else showAdminMsg("admin-cls-msg", "Updated ✅"); }); });
    container.querySelectorAll("[data-cls-del]").forEach(btn => { const cid = Number(btn.getAttribute("data-cls-del")); btn.addEventListener("click", async () => { if (!confirm("Delete?")) return; const { error } = await supabase.from("class_info").delete().eq("classid", cid); if (error) alert("Failed: " + error.message); else { showAdminMsg("admin-cls-msg", "Deleted ✅"); await loadAdminClasses(); } }); });
    document.getElementById("btn-add-class")?.addEventListener("click", async () => { const name = document.getElementById("new-cls-name")?.value?.trim(); if (!name) return; const { error } = await supabase.from("class_info").insert({ classname: name }); if (error) alert("Failed: " + error.message); else { showAdminMsg("admin-cls-msg", "Added ✅"); await loadAdminClasses(); } });
    container.querySelectorAll("[data-sec-save]").forEach(btn => { const sid = Number(btn.getAttribute("data-sec-save")); btn.addEventListener("click", async () => { const name = document.getElementById(`sec-name-${sid}`)?.value?.trim(); if (!name) return; const { error } = await supabase.from("section_info").update({ sectionname: name }).eq("sectionid", sid); if (error) alert("Failed: " + error.message); else showAdminMsg("admin-cls-msg", "Updated ✅"); }); });
    container.querySelectorAll("[data-sec-del]").forEach(btn => { const sid = Number(btn.getAttribute("data-sec-del")); btn.addEventListener("click", async () => { if (!confirm("Delete?")) return; const { error } = await supabase.from("section_info").delete().eq("sectionid", sid); if (error) alert("Failed: " + error.message); else { showAdminMsg("admin-cls-msg", "Deleted ✅"); await loadAdminClasses(); } }); });
    document.getElementById("btn-add-section")?.addEventListener("click", async () => { const name = document.getElementById("new-sec-name")?.value?.trim(); if (!name) return; const { error } = await supabase.from("section_info").insert({ sectionname: name }); if (error) alert("Failed: " + error.message); else { showAdminMsg("admin-cls-msg", "Added ✅"); await loadAdminClasses(); } });
    container.querySelectorAll("[data-sub-save]").forEach(btn => { const sid = Number(btn.getAttribute("data-sub-save")); btn.addEventListener("click", async () => { const name = document.getElementById(`sub-name-${sid}`)?.value?.trim(); if (!name) return; const { error } = await supabase.from("subject_info").update({ subjectname: name }).eq("subjectid", sid); if (error) alert("Failed: " + error.message); else showAdminMsg("admin-cls-msg", "Updated ✅"); }); });
    container.querySelectorAll("[data-sub-del]").forEach(btn => { const sid = Number(btn.getAttribute("data-sub-del")); btn.addEventListener("click", async () => { if (!confirm("Delete?")) return; const { error } = await supabase.from("subject_info").delete().eq("subjectid", sid); if (error) alert("Failed: " + error.message); else { showAdminMsg("admin-cls-msg", "Deleted ✅"); await loadAdminClasses(); } }); });
    document.getElementById("btn-add-subject")?.addEventListener("click", async () => { const name = document.getElementById("new-sub-name")?.value?.trim(); if (!name) return; const { error } = await supabase.from("subject_info").insert({ subjectname: name }); if (error) alert("Failed: " + error.message); else { showAdminMsg("admin-cls-msg", "Added ✅"); await loadAdminClasses(); } });
  } catch (e) {
    console.error("classes error:", e);
    container.innerHTML = `<div class="admin-err">Failed to load.</div>`;
  }
}

/* ======================== EXAMS ======================== */
async function loadAdminExams() {
  const container = adminEl("admin-exams-content");
  if (!container) return;
  container.innerHTML = `<div class="admin-loading">Loading...</div>`;
  try {
    const { rows: examsRaw } = await selectExamsCompat();
    const exams = (examsRaw || []).sort((a, b) => Number(a.examid) - Number(b.examid));
    const { data: teachers } = await supabase.from("teacher_info").select("teacherid, teachername");
    const { data: classes } = await supabase.from("class_info").select("classid, classname");
    const { data: sections } = await supabase.from("section_info").select("sectionid, sectionname");
    const { data: subjects } = await supabase.from("subject_info").select("subjectid, subjectname");
    const teachOpts = (teachers || []).map((t) => `<option value="${t.teacherid}">${t.teachername}</option>`).join("");
    const classOpts = (classes || []).map((c) => `<option value="${c.classid}">${c.classname}</option>`).join("");
    const secOpts = (sections || []).map((s) => `<option value="${s.sectionid}">${s.sectionname}</option>`).join("");
    const subOpts = (subjects || []).map((s) => `<option value="${s.subjectid}">${s.subjectname}</option>`).join("");
    let html = `<div class="admin-section-block"><h3 class="admin-section-heading">All Exams</h3><div id="admin-exam-msg"></div>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr>
        <th>ID</th><th>Teacher</th><th>Class</th><th>Section</th><th>Subject</th><th>Year</th><th>Sem</th><th>Actions</th>
      </tr></thead><tbody>`;
    for (const e of exams || []) {
      html += `<tr>
        <td>${e.examid}</td>
        <td><select class="admin-input admin-input-sm" id="exam-teach-${e.examid}"><option value="">-</option>${teachOpts}</select></td>
        <td><select class="admin-input admin-input-sm" id="exam-class-${e.examid}"><option value="">-</option>${classOpts}</select></td>
        <td><select class="admin-input admin-input-sm" id="exam-sec-${e.examid}"><option value="">-</option>${secOpts}</select></td>
        <td><select class="admin-input admin-input-sm" id="exam-sub-${e.examid}"><option value="">-</option>${subOpts}</select></td>
        <td><input class="admin-input admin-input-sm" id="exam-year-${e.examid}" value="${escapeHtml(String(e.StudingYear || ""))}" /></td>
        <td><input class="admin-input admin-input-sm" id="exam-sem-${e.examid}" value="${escapeHtml(String(e.StudingSemester || ""))}" /></td>
        <td><button class="admin-btn-save" data-exam-save="${e.examid}">💾</button><button class="admin-btn-del" data-exam-del="${e.examid}">🗑️</button></td>
      </tr>`;
    }
    html += `</tbody></table></div>
      <div class="admin-add-card">
        <h4 class="admin-add-title">➕ Add New Exam</h4>
        <div class="admin-inline-fields" style="flex-wrap:wrap;">
          <select class="admin-input" id="new-exam-teach"><option value="">Teacher</option>${teachOpts}</select>
          <select class="admin-input" id="new-exam-class"><option value="">Class</option>${classOpts}</select>
          <select class="admin-input" id="new-exam-sec"><option value="">Section</option>${secOpts}</select>
          <select class="admin-input" id="new-exam-sub"><option value="">Subject</option>${subOpts}</select>
          <input class="admin-input" id="new-exam-year" placeholder="Year" />
          <input class="admin-input" id="new-exam-sem" placeholder="Semester" />
          <button class="admin-btn-primary" id="btn-add-exam">Add Exam</button>
        </div>
      </div></div>`;
    container.innerHTML = html;
    for (const e of exams || []) {
      const ts = document.getElementById(`exam-teach-${e.examid}`);
      const cs = document.getElementById(`exam-class-${e.examid}`);
      const ss = document.getElementById(`exam-sec-${e.examid}`);
      const sbs = document.getElementById(`exam-sub-${e.examid}`);
      if (ts && e.teacherid) ts.value = String(e.teacherid);
      if (cs && e.classid) cs.value = String(e.classid);
      if (ss && e.sectionid) ss.value = String(e.sectionid);
      if (sbs && e.subjectid) sbs.value = String(e.subjectid);
    }
    container.querySelectorAll("[data-exam-save]").forEach((btn) => {
      const eid = Number(btn.getAttribute("data-exam-save"));
      btn.addEventListener("click", async () => {
        const updates = {
          teacherid: Number(document.getElementById(`exam-teach-${eid}`)?.value || 0) || null,
          classid: Number(document.getElementById(`exam-class-${eid}`)?.value || 0) || null,
          sectionid: Number(document.getElementById(`exam-sec-${eid}`)?.value || 0) || null,
          subjectid: Number(document.getElementById(`exam-sub-${eid}`)?.value || 0) || null,
          StudingYear: document.getElementById(`exam-year-${eid}`)?.value?.trim() || null,
          StudingSemester: document.getElementById(`exam-sem-${eid}`)?.value?.trim() || null,
        };
        const { error } = await supabase.from("exam_info").update(updates).eq("examid", eid);
        if (error) alert("Update failed: " + error.message);
        else showAdminMsg("admin-exam-msg", "Updated ✅");
      });
    });
    container.querySelectorAll("[data-exam-del]").forEach((btn) => {
      const eid = Number(btn.getAttribute("data-exam-del"));
      btn.addEventListener("click", async () => {
        if (!confirm("Delete?")) return;
        const { error } = await supabase.from("exam_info").delete().eq("examid", eid);
        if (error) alert("Failed: " + error.message);
        else { showAdminMsg("admin-exam-msg", "Deleted ✅"); await loadAdminExams(); }
      });
    });
    document.getElementById("btn-add-exam")?.addEventListener("click", async () => {
      const obj = {
        teacherid: Number(document.getElementById("new-exam-teach")?.value || 0) || null,
        classid: Number(document.getElementById("new-exam-class")?.value || 0) || null,
        sectionid: Number(document.getElementById("new-exam-sec")?.value || 0) || null,
        subjectid: Number(document.getElementById("new-exam-sub")?.value || 0) || null,
        StudingYear: document.getElementById("new-exam-year")?.value?.trim() || null,
        StudingSemester: document.getElementById("new-exam-sem")?.value?.trim() || null,
      };
      const { error } = await supabase.from("exam_info").insert(obj);
      if (error) alert("Failed: " + error.message);
      else { showAdminMsg("admin-exam-msg", "Added ✅"); await loadAdminExams(); }
    });
  } catch (e) {
    console.error("exams error:", e);
    container.innerHTML = `<div class="admin-err">Failed to load exams.</div>`;
  }
}

/* =========================
   INIT
   ========================= */

// Wire up supervisor "Back to Teachers" button
const backToTeachersBtn = document.getElementById("backToTeachers");
if (backToTeachersBtn) {
  backToTeachersBtn.addEventListener("click", () => {
    const panel = document.getElementById("supervisorClassesPanel");
    const teachersPanel = document.getElementById("supervisorTeachersPanel");
    if (panel) panel.classList.add("hidden");
    if (teachersPanel) teachersPanel.classList.remove("hidden");
  });
}

try {
  // Load classes only for teachers (supervisors use "My Teachers" as their main view)
  if (currentUser.role === "teacher") {
    showLoading(classesLoading, "Loading classes...");
    const rows = await loadTeacherClasses(currentUser.id);
    hideLoading(classesLoading);
    const grouped = groupByClass(rows);
    renderClasses(grouped);
  }
} catch (e) {
  console.error("Load classes error:", e);
  hideLoading(classesLoading);
  alert("Failed to load classes. Check console.");
}

if (currentUser.role === "admin") {
  if (views.admin) showView("admin");
} else if (currentUser.role === "supervisor") {
  if (views.teachers) showView("teachers");
  // Ensure the teachers list is ready immediately on first load
  try { await initSupervisorTeachersView(); } catch (e) { console.warn("init supervisor teachers view failed:", e); }
} else {
  if (views.dashboard) showView("dashboard");
  try { await initMarksSelectors(); } catch (e) { console.warn("init marks selectors failed:", e); }
  // Videos are loaded on-demand when sidebar link is clicked
}


if (isAdmin()) {
  try { await refreshAdminEmailSet(); } catch (e) { }
  showAdminSubView("admin-overview");
  try { await loadAdminOverview(); } catch (e) { console.warn("init admin overview failed:", e); }
}

/* =========================================================
   CLASS SCHEDULE PAGE (Teacher + Supervisor)
   - Teacher: sees own schedule
   - Supervisor: sees schedules of supervised teachers
   ========================================================= */

const DAYS_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(t) {
  if (!t) return "";
  // Accept "HH:MM:SS" or "HH:MM"
  const parts = String(t).split(":");
  const hh = parts[0] || "00";
  const mm = parts[1] || "00";
  return `${hh}:${mm}`;
}

function injectScheduleCss() {
  if (document.getElementById("scheduleCssInjected")) return;
  const style = document.createElement("style");
  style.id = "scheduleCssInjected";
  style.textContent = `
    .schedule-day-block { margin-top: 14px; }
    .schedule-day-header { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .schedule-day-badge {
      background: var(--primary-soft, #eff6ff);
      border: 1px solid var(--primary-border, #bfdbfe);
      color: var(--primary, #1d4ed8);
      padding: 6px 12px;
      border-radius: 999px;
      font-weight: 900;
      font-size: 12px;
      white-space: nowrap;
    }
    .schedule-day-line { height: 1px; flex: 1; background: var(--border, #e5e7eb); opacity: .9; }
    .schedule-card {
      display:flex;
      align-items:center;
      gap: 12px;
      background: var(--card, #ffffff);
      border: 1px solid var(--border, #e5e7eb);
      border-radius: 14px;
      padding: 12px 14px;
      margin-bottom: 10px;
      transition: 0.15s ease;
    }
    .schedule-card:hover { transform: translateY(-1px); box-shadow: 0 10px 22px rgba(0,0,0,.10); }
    .schedule-time-block {
      background: var(--primary-soft, #eff6ff);
      border: 1px solid var(--primary-border, #bfdbfe);
      border-radius: 12px;
      padding: 8px 14px;
      text-align: center;
      min-width: 110px;
      flex-shrink: 0;
    }
    .schedule-time-start { font-size: 15px; font-weight: 900; color: var(--primary, #1d4ed8); }
    .schedule-time-sep { font-size: 11px; color: var(--muted, #64748b); margin: 2px 0; }
    .schedule-time-end { font-size: 13px; font-weight: 800; color: var(--text, #111827); opacity:.85; }
    .schedule-info { flex: 1; min-width: 0; }
    .schedule-class-name { font-size: 16px; font-weight: 900; color: var(--text, #111827); margin-bottom: 4px; }
    .schedule-section-name { font-size: 13px; color: var(--muted, #475569); }
    .schedule-subject-name {
      display:inline-block;
      margin-top: 6px;
      font-size: 12px;
      font-weight: 800;
      background: rgba(34,197,94,0.10);
      border: 1px solid rgba(34,197,94,0.25);
      color: #15803d;
      padding: 3px 10px;
      border-radius: 999px;
    }
    [data-theme="dark"] .schedule-subject-name {
      background: rgba(34,197,94,0.12);
      border-color: rgba(34,197,94,0.22);
      color: #86efac;
    }
    .schedule-room {
      font-size: 12px;
      color: var(--muted, #64748b);
      font-weight: 800;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .schedule-room i { margin-right: 4px; }
    .schedule-empty, .schedule-loading {
      color: var(--text, #111827);
      font-weight: 900;
      font-size: 14px;
      padding: 12px 0;
    }
  `;
  document.head.appendChild(style);
}

async function initSchedulePage() {
  const viewEl = document.getElementById("view-schedule");
  if (!viewEl) return;

  injectScheduleCss();

  viewEl.innerHTML = `
    <h1 class="hello">Class Schedule</h1>
    <div class="subcard" id="schedule-subcard">
      <div class="subcard-title">Weekly Class Schedule</div>
      <div class="subcard-note">Your assigned classes sorted by day and time.</div>
      <div id="scheduleLoading" class="schedule-loading">Loading schedule...</div>
      <div id="scheduleContent"></div>
    </div>
  `;

  const loadingEl = document.getElementById("scheduleLoading");
  const contentEl = document.getElementById("scheduleContent");

  try {
    let query = supabase
      .from("class_schedule")
      .select(`
        scheduleid,
        teacherid,
        classid,
        sectionid,
        subjectid,
        day_of_week,
        start_time,
        end_time,
        room,
        class_info ( classname ),
        section_info ( sectionname ),
        subject_info ( subjectname )
      `);

    if (currentUser.role === "teacher") {
      query = query.eq("teacherid", currentUser.id);
    } else if (currentUser.role === "supervisor") {
      const { data: links, error: linkErr } = await supabase
        .from("supervisor_teacher")
        .select("teacherid")
        .eq("supervisorid", currentUser.id);

      if (linkErr) throw linkErr;
      const teacherIds = (links || []).map((x) => x.teacherid).filter(Boolean);

      if (!teacherIds.length) {
        contentEl.innerHTML = `<div class="schedule-empty">No teachers assigned to your supervisor account.</div>`;
        return;
      }
      query = query.in("teacherid", teacherIds);
    }

    const { data: scheduleRows, error: schedErr } = await query;
    if (schedErr) throw schedErr;

    const rows = scheduleRows || [];
    if (!rows.length) {
      contentEl.innerHTML = `<div class="schedule-empty">No schedule found for your account.</div>`;
      return;
    }

    const byDay = new Map();
    for (const r of rows) {
      const day = r.day_of_week || "Unknown";
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(r);
    }

    const sortedDays = Array.from(byDay.keys()).sort((a, b) => {
      const ia = DAYS_ORDER.indexOf(a);
      const ib = DAYS_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    let html = "";
    for (const day of sortedDays) {
      const dayRows = (byDay.get(day) || []).sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
      html += `
        <div class="schedule-day-block">
          <div class="schedule-day-header">
            <span class="schedule-day-badge">
              <i class="fa-solid fa-calendar-day" style="margin-right:6px;"></i>${escapeHtml(day)}
            </span>
            <div class="schedule-day-line"></div>
          </div>
      `;

      for (const r of dayRows) {
        const className = r.class_info?.classname || `Class ${r.classid}`;
        const sectionName = r.section_info?.sectionname || `Section ${r.sectionid}`;
        const subjectName = r.subject_info?.subjectname || null;
        const room = r.room || null;

        html += `
          <div class="schedule-card">
            <div class="schedule-time-block">
              <div class="schedule-time-start">${formatTime(r.start_time)}</div>
              <div class="schedule-time-sep">▼</div>
              <div class="schedule-time-end">${formatTime(r.end_time)}</div>
            </div>

            <div class="schedule-info">
              <div class="schedule-class-name">${escapeHtml(className)}</div>
              <div class="schedule-section-name">${escapeHtml(sectionName)}</div>
              ${subjectName ? `<div class="schedule-subject-name">${escapeHtml(subjectName)}</div>` : ``}
            </div>

            ${room ? `<div class="schedule-room"><i class="fa-solid fa-location-dot"></i>${escapeHtml(room)}</div>` : ``}
          </div>
        `;
      }

      html += `</div>`;
    }

    contentEl.innerHTML = html;
  } catch (e) {
    console.error("Schedule load failed:", e);
    contentEl.innerHTML = `<div class="schedule-empty">Failed to load schedule. Check console.</div>`;
  } finally {
    if (loadingEl) loadingEl.style.display = "none";
  }
}

/* =========================================================
   PRETTY THEME TOGGLE (Default = LIGHT)
   Works for Teacher / Supervisor / Admin
   ========================================================= */

function setTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("theme", t);

  const chk = document.getElementById("themeToggleChk");
  const icon = document.getElementById("themeToggleIcon");
  const sub = document.getElementById("themeToggleSub");

  if (chk) chk.checked = t === "dark";
  if (icon) icon.textContent = t === "dark" ? "🌙" : "☀️";
  if (sub) sub.textContent = t === "dark" ? "Dark mode is ON" : "Light mode is ON";
}

function getInitialTheme() {
  const saved = (localStorage.getItem("theme") || "").toLowerCase();
  if (saved === "light" || saved === "dark") return saved;
  return "light";
}

function injectPrettyThemeToggle() {
  const sidebarEl = document.getElementById("sidebar");
  if (!sidebarEl) return;
  if (document.getElementById("themeToggleWrap")) return;

  const logout = document.getElementById("logoutBtn");

  const wrap = document.createElement("div");
  wrap.id = "themeToggleWrap";
  wrap.className = "theme-toggle";
  wrap.innerHTML = `
    <div class="tt-left">
      <div class="tt-icon" id="themeToggleIcon">☀️</div>
      <div class="tt-text">
        <div class="tt-title">Theme</div>
        <div class="tt-sub" id="themeToggleSub">Light mode is ON</div>
      </div>
    </div>

    <label class="tt-switch" title="Toggle Dark Mode">
      <input id="themeToggleChk" type="checkbox" />
      <span class="tt-slider"></span>
    </label>
  `;

  if (logout && logout.parentNode) logout.parentNode.insertBefore(wrap, logout);
  else sidebarEl.appendChild(wrap);

  const chk = document.getElementById("themeToggleChk");
  if (chk) chk.addEventListener("change", () => setTheme(chk.checked ? "dark" : "light"));
}

try {
  setTheme(getInitialTheme());
  injectPrettyThemeToggle();
} catch (e) {
  console.warn("Theme toggle init failed:", e);
}
