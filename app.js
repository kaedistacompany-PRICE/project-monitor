(() => {
  const cfg = window.APP_CONFIG || {};
  const root = document.getElementById("app");

  if (!root) {
    console.error("عنصر app در صفحه پیدا نشد.");
    return;
  }

  if (
    !cfg.SUPABASE_URL ||
    cfg.SUPABASE_URL.includes("YOUR_") ||
    !cfg.SUPABASE_ANON_KEY ||
    cfg.SUPABASE_ANON_KEY.includes("YOUR_")
  ) {
    root.innerHTML = `
      <div class="login-wrap">
        <div class="card" style="max-width:700px;padding:30px">
          <h2>اتصال سیستم هنوز تنظیم نشده است</h2>
          <p>مقادیر SUPABASE_URL و SUPABASE_ANON_KEY را در فایل config.js بررسی کنید.</p>
        </div>
      </div>`;
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    root.innerHTML = `
      <div class="login-wrap">
        <div class="card" style="max-width:700px;padding:30px">
          <h2>خطا در بارگذاری سیستم</h2>
          <p>کتابخانه اتصال به پایگاه داده بارگذاری نشده است. صفحه را تازه‌سازی کنید.</p>
        </div>
      </div>`;
    return;
  }

  const { createClient } = window.supabase;
  const db = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const state = {
    session: null,
    profile: null,
    projects: [],
    updates: [],
    experts: [],
    currentProject: null,
    query: "",
    realtimeChannel: null
  };

  const statusMeta = {
    active: {
      label: "فعال",
      cls: "status-active"
    },
    waiting: {
      label: "در انتظار",
      cls: "status-waiting"
    },
    stopped: {
      label: "مشکل / متوقف",
      cls: "status-stopped"
    },
    done: {
      label: "پایان‌یافته",
      cls: "status-done"
    }
  };

  // بررسی قالب UUID
  const isValidUUID = (value) => {
    if (typeof value !== "string") return false;

    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    );
  };

  const esc = (v = "") =>
    String(v).replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));

  const formatDate = (value) => {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  };

  const relativeAge = (value) => {
    if (!value) {
      return {
        text: "بدون بروزرسانی",
        old: true
      };
    }

    const ms = Date.now() - new Date(value).getTime();

    if (!Number.isFinite(ms)) {
      return {
        text: "نامشخص",
        old: true
      };
    }

    const min = Math.floor(Math.max(0, ms) / 60000);

    if (min < 1) {
      return {
        text: "همین الان",
        old: false
      };
    }

    if (min < 60) {
      return {
        text: `${min} دقیقه پیش`,
        old: false
      };
    }

    const hours = Math.floor(min / 60);

    if (hours < 24) {
      return {
        text: `${hours} ساعت پیش`,
        old: false
      };
    }

    const days = Math.floor(hours / 24);

    return {
      text: `${days} روز پیش`,
      old: days >= 3
    };
  };

  const initials = (name = "") => {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);

    return parts.slice(0, 2).map(x => x[0]).join("") || "؟";
  };

  function toast(message, type = "success") {
    let container = document.getElementById("toast-root");

    if (!container) {
      container = document.createElement("div");
      container.id = "toast-root";
      document.body.appendChild(container);
    }

    const el = document.createElement("div");

    el.textContent = message;

    el.style.cssText = `
      position:fixed;
      bottom:22px;
      right:22px;
      z-index:99999;
      max-width:min(600px, calc(100vw - 44px));
      padding:12px 16px;
      border-radius:12px;
      color:white;
      font-weight:600;
      line-height:1.8;
      overflow-wrap:anywhere;
      background:${type === "error" ? "#dc2626" : "#16a34a"};
      box-shadow:0 10px 30px rgba(0,0,0,.15);
    `;

    container.appendChild(el);

    setTimeout(() => el.remove(), 8000);
  }

  function showDatabaseError(action, error) {
    console.error(`${action}:`, {
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      code: error?.code,
      error
    });

    const message = error?.message || "خطای ناشناخته";

    const details = error?.details
      ? ` | جزئیات: ${error.details}`
      : "";

    const hint = error?.hint
      ? ` | راهنما: ${error.hint}`
      : "";

    const code = error?.code
      ? ` | کد: ${error.code}`
      : "";

    toast(
      `${action}: ${message}${details}${hint}${code}`,
      "error"
    );
  }

  function statusBadge(status) {
    const s = statusMeta[status] || statusMeta.active;

    return `
      <span class="status ${s.cls}">
        <span class="status-dot"></span>
        ${s.label}
      </span>`;
  }

  // -----------------------------
  // صفحه ورود
  // -----------------------------

  function loginView() {
    root.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">

          <section class="login-info">
            <h1>سیستم نظارت پروژه‌ها</h1>

            <p>
              آخرین وضعیت پروژه‌ها را سریع ببینید و تغییرات را بدون پیچیدگی ثبت کنید.
            </p>

            <div class="feature">
              <span class="feature-icon">◉</span>
              <span>مشاهده آخرین وضعیت همه پروژه‌ها</span>
            </div>

            <div class="feature">
              <span class="feature-icon">↯</span>
              <span>ثبت سریع تغییرات توسط کارشناسان</span>
            </div>

            <div class="feature">
              <span class="feature-icon">✓</span>
              <span>دسترسی امن مدیر و کارشناس</span>
            </div>
          </section>

          <section class="login-form">
            <div class="brand">ورود به سیستم</div>

            <p class="sub">
              نام کاربری و رمز عبور خود را وارد کنید.
            </p>

            <form id="login-form">
              <div class="field">
                <label>ایمیل</label>
                <input
                  class="input"
                  id="email"
                  type="email"
                  required
                  autocomplete="username"
                />
              </div>

              <div class="field">
                <label>رمز عبور</label>
                <input
                  class="input"
                  id="password"
                  type="password"
                  required
                  autocomplete="current-password"
                />
              </div>

              <button
                class="btn btn-primary"
                style="width:100%"
                type="submit"
              >
                ورود
              </button>
            </form>
          </section>

        </div>
      </div>`;

    document
      .getElementById("login-form")
      .addEventListener("submit", login);
  }

  async function login(e) {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const btn = e.submitter;

    btn.disabled = true;
    btn.textContent = "در حال ورود...";

    try {
      const { error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        toast("ورود انجام نشد: " + error.message, "error");
      }
    } catch (error) {
      showDatabaseError("خطا در ورود", error);
    } finally {
      btn.disabled = false;
      btn.textContent = "ورود";
    }
  }

  async function logout() {
    const { error } = await db.auth.signOut();

    if (error) {
      showDatabaseError("خطا در خروج", error);
    }
  }

  // -----------------------------
  // دریافت اطلاعات کاربر
  // -----------------------------

  async function loadProfile() {
    if (!state.session?.user?.id) {
      throw new Error("شناسه کاربر واردشده پیدا نشد.");
    }

    const userId = state.session.user.id;

    if (!isValidUUID(userId)) {
      throw new Error(
        "شناسه کاربر واردشده UUID معتبر نیست: " + String(userId)
      );
    }

    const { data, error } = await db
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) throw error;

    if (!data) {
      throw new Error("پروفایل کاربر پیدا نشد.");
    }

    if (!isValidUUID(data.id)) {
      throw new Error(
        "شناسه پروفایل معتبر نیست: " + String(data.id)
      );
    }

    state.profile = data;
  }

  async function loadExperts() {
    if (state.profile?.role !== "manager") return;

    const { data, error } = await db
      .from("profiles")
      .select("id,full_name,email,role,active")
      .eq("role", "expert")
      .eq("active", true)
      .order("full_name");

    if (error) {
      showDatabaseError("خطا در دریافت فهرست کارشناسان", error);
      state.experts = [];
      return;
    }

    state.experts = (data || []).filter(expert => {
      if (!isValidUUID(expert.id)) {
        console.error("شناسه نامعتبر کارشناس:", expert);
        return false;
      }

      return true;
    });
  }

  // -----------------------------
  // دریافت پروژه‌ها
  // -----------------------------

  async function loadProjects() {
    const { data, error } = await db
      .from("projects")
      .select(`
        *,
        assigned:profiles!projects_assigned_to_fkey(
          id,
          full_name,
          email
        ),
        creator:profiles!projects_created_by_fkey(
          full_name
        )
      `)
      .order("updated_at", {
        ascending: false
      });

    if (error) throw error;

    state.projects = data || [];
  }

  async function loadUpdates(projectId) {
    if (!isValidUUID(projectId)) {
      throw new Error(
        "شناسه پروژه برای دریافت تاریخچه معتبر نیست: " +
        String(projectId)
      );
    }

    const { data, error } = await db
      .from("project_updates")
      .select(`
        *,
        user:profiles!project_updates_user_id_fkey(
          full_name,
          email
        )
      `)
      .eq("project_id", projectId)
      .order("created_at", {
        ascending: false
      });

    if (error) throw error;

    state.updates = data || [];
  }

  // -----------------------------
  // شروع برنامه
  // -----------------------------

  async function boot() {
    try {
      const { data, error } = await db.auth.getSession();

      if (error) throw error;

      state.session = data.session;

      if (!state.session) {
        loginView();
        return;
      }

      await loadProfile();
      await loadExperts();
      await loadProjects();

      dashboardView();
      subscribeRealtime();

    } catch (e) {
      console.error("Boot error:", e);

      root.innerHTML = `
        <div class="login-wrap">
          <div class="card" style="max-width:700px;padding:30px">
            <h2>خطا در اتصال</h2>
            <p>${esc(e.message || "خطای ناشناخته")}</p>
            <button
              class="btn btn-primary"
              onclick="location.reload()"
            >
              تلاش مجدد
            </button>
          </div>
        </div>`;
    }
  }

  // -----------------------------
  // بروزرسانی زنده
  // -----------------------------

  function subscribeRealtime() {
    if (state.realtimeChannel) {
      db.removeChannel(state.realtimeChannel);
    }

    state.realtimeChannel = db
      .channel("project-monitor")

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "projects"
        },
        async () => {
          try {
            await loadProjects();

            if (state.currentProject) {
              await openProject(state.currentProject.id, false);
            } else {
              dashboardView();
            }
          } catch (e) {
            showDatabaseError("خطا در بروزرسانی پروژه‌ها", e);
          }
        }
      )

      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_updates"
        },
        async () => {
          try {
            await loadProjects();

            if (state.currentProject) {
              await openProject(state.currentProject.id, false);
            } else {
              dashboardView();
            }
          } catch (e) {
            showDatabaseError("خطا در بروزرسانی تاریخچه", e);
          }
        }
      )

      .subscribe();
  }

  // -----------------------------
  // قالب اصلی صفحات
  // -----------------------------

  function layout(content) {
    const roleLabel =
      state.profile.role === "manager" ? "مدیر" : "کارشناس";

    root.innerHTML = `
      <div class="shell">

        <header class="topbar">
          <div class="logo">سیستم نظارت پروژه‌ها</div>

          <div class="user-area">
            <div>
              <div class="user-name">
                ${esc(state.profile.full_name)}
              </div>

              <div class="user-role">
                ${roleLabel}
              </div>
            </div>

            <div class="avatar">
              ${esc(initials(state.profile.full_name))}
            </div>

            <button class="btn btn-ghost" id="logout-btn">
              خروج
            </button>
          </div>
        </header>

        <main class="main">
          ${content}
        </main>

      </div>`;

    document.getElementById("logout-btn").onclick = logout;
  }

  // -----------------------------
  // داشبورد
  // -----------------------------

  function dashboardView() {
    const total = state.projects.length;

    const today = state.projects.filter(p =>
      p.updated_at &&
      new Date(p.updated_at).toDateString() ===
      new Date().toDateString()
    ).length;

    const stale2 = state.projects.filter(p =>
      !p.updated_at ||
      Date.now() - new Date(p.updated_at).getTime() >
      2 * 86400000
    ).length;

    const stale7 = state.projects.filter(p =>
      !p.updated_at ||
      Date.now() - new Date(p.updated_at).getTime() >
      7 * 86400000
    ).length;

    layout(`
      <div class="page-head">
        <div>
          <h1>داشبورد</h1>
          <p>آخرین وضعیت پروژه‌ها را در یک نگاه ببینید.</p>
        </div>

        ${
          state.profile.role === "manager"
            ? `<button class="btn btn-primary" id="new-project">
                 + پروژه جدید
               </button>`
            : ""
        }
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-label">پروژه‌های فعال</div>
          <div class="stat-value">${total}</div>
        </div>

        <div class="stat">
          <div class="stat-label">بروزرسانی امروز</div>
          <div class="stat-value">${today}</div>
        </div>

        <div class="stat">
          <div class="stat-label">بدون بروزرسانی بیش از ۲ روز</div>
          <div class="stat-value">${stale2}</div>
        </div>

        <div class="stat">
          <div class="stat-label">بدون بروزرسانی بیش از ۷ روز</div>
          <div class="stat-value">${stale7}</div>
        </div>
      </div>

      <div class="searchbar">
        <input
          class="input"
          id="project-search"
          placeholder="جستجوی پروژه یا مسئول..."
          value="${esc(state.query)}"
        />
      </div>

      <div class="card table-wrap">
        ${projectTable()}
      </div>
    `);

    const search = document.getElementById("project-search");

    search.addEventListener("input", () => {
      state.query = search.value;
      renderTableOnly();
    });

    if (state.profile.role === "manager") {
      document.getElementById("new-project").onclick =
        () => showProjectModal();
    }

    document.querySelectorAll(".open-project").forEach(btn => {
      btn.onclick = () => openProject(btn.dataset.id);
    });
  }

  function projectTable() {
    const q = state.query.trim().toLowerCase();

    const rows = state.projects.filter(p => {
      if (!q) return true;

      return [
        p.name,
        p.description,
        p.assigned?.full_name
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    if (!rows.length) {
      return `<div class="empty">پروژه‌ای پیدا نشد.</div>`;
    }

    return `
      <table>
        <thead>
          <tr>
            <th>پروژه</th>
            <th>مسئول</th>
            <th>وضعیت</th>
            <th>آخرین وضعیت</th>
            <th>آخرین بروزرسانی</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          ${rows.map(p => {
            const age = relativeAge(p.updated_at);

            return `
              <tr>
                <td>
                  <div class="project-name">
                    ${esc(p.name)}
                  </div>

                  <div class="project-desc">
                    ${esc(p.description || "")}
                  </div>
                </td>

                <td>
                  ${esc(p.assigned?.full_name || "تعیین نشده")}
                </td>

                <td>
                  ${statusBadge(p.status)}
                </td>

                <td>
                  ${esc(p.latest_update || "هنوز بروزرسانی ثبت نشده")}
                </td>

                <td>
                  <div class="age ${age.old ? "age-old" : ""}">
                    ${age.text}
                  </div>
                </td>

                <td>
                  <button
                    class="btn btn-ghost open-project"
                    data-id="${esc(p.id)}"
                  >
                    مشاهده
                  </button>
                </td>
              </tr>`;
          }).join("")}
        </tbody>
      </table>`;
  }

  function renderTableOnly() {
    const card = document.querySelector(".card.table-wrap");

    if (!card) return;

    card.innerHTML = projectTable();

    document.querySelectorAll(".open-project").forEach(btn => {
      btn.onclick = () => openProject(btn.dataset.id);
    });
  }

  // -----------------------------
  // جزئیات پروژه
  // -----------------------------

  async function openProject(id, refreshLayout = true) {
    if (!isValidUUID(id)) {
      toast("شناسه پروژه معتبر نیست: " + String(id), "error");
      return;
    }

    state.currentProject =
      state.projects.find(p => p.id === id) || null;

    if (!state.currentProject) {
      toast("پروژه موردنظر پیدا نشد.", "error");
      return;
    }

    try {
      await loadUpdates(id);
    } catch (e) {
      showDatabaseError("خطا در دریافت تاریخچه پروژه", e);
      return;
    }

    const p = state.currentProject;

    const canUpdate =
      state.profile.role === "manager" ||
      p.assigned_to === state.profile.id;

    if (!refreshLayout) return;

    layout(`
      <div class="back">
        <button class="btn btn-ghost" id="back-btn">
          ← بازگشت به داشبورد
        </button>
      </div>

      <div class="page-head">
        <div>
          <h1>${esc(p.name)}</h1>
          <p>${esc(p.description || "")}</p>
        </div>

        ${
          canUpdate
            ? `<button class="btn btn-primary" id="new-update">
                 + ثبت بروزرسانی
               </button>`
            : ""
        }
      </div>

      <div class="detail-grid">

        <section class="card detail-main">
          <h3>آخرین وضعیت</h3>

          <div class="latest">
            <div class="latest-title">آخرین اتفاق ثبت‌شده</div>

            <div>
              ${esc(p.latest_update || "هنوز بروزرسانی ثبت نشده است.")}
            </div>
          </div>

          <div class="timeline">
            <h3>تاریخچه تغییرات</h3>

            ${
              state.updates.length
                ? state.updates.map(u => `
                    <div class="timeline-item">
                      <div class="update-meta">
                        ${esc(u.user?.full_name || "کاربر")}
                        — ${formatDate(u.created_at)}
                      </div>

                      <div class="update-text">
                        ${esc(u.content)}
                      </div>
                    </div>
                  `).join("")
                : `<div class="empty">هنوز تغییری ثبت نشده است.</div>`
            }
          </div>
        </section>

        <aside class="card detail-side">

          <div class="side-row">
            <div class="side-label">وضعیت پروژه</div>
            <div class="side-value">${statusBadge(p.status)}</div>
          </div>

          <div class="side-row">
            <div class="side-label">مسئول</div>
            <div class="side-value">
              ${esc(p.assigned?.full_name || "تعیین نشده")}
            </div>
          </div>

          <div class="side-row">
            <div class="side-label">ایجادکننده</div>
            <div class="side-value">
              ${esc(p.creator?.full_name || "—")}
            </div>
          </div>

          <div class="side-row">
            <div class="side-label">تاریخ ایجاد</div>
            <div class="side-value">${formatDate(p.created_at)}</div>
          </div>

          <div class="side-row">
            <div class="side-label">آخرین بروزرسانی</div>
            <div class="side-value">${formatDate(p.updated_at)}</div>
          </div>

          ${
            state.profile.role === "manager"
              ? `
                <div style="margin-top:20px;display:grid;gap:9px">
                  <button class="btn btn-secondary" id="edit-project">
                    ویرایش پروژه
                  </button>

                  <button class="btn btn-danger" id="delete-project">
                    حذف پروژه
                  </button>
                </div>
              `
              : ""
          }

        </aside>
      </div>
    `);

    document.getElementById("back-btn").onclick = () => {
      state.currentProject = null;
      dashboardView();
    };

    if (canUpdate) {
      document.getElementById("new-update").onclick =
        showUpdateModal;
    }

    if (state.profile.role === "manager") {
      document.getElementById("edit-project").onclick =
        () => showProjectModal(p);

      document.getElementById("delete-project").onclick =
        () => deleteProject(p.id);
    }
  }

  // -----------------------------
  // پنجره‌های فرم
  // -----------------------------

  function modal(html) {
    const el = document.createElement("div");

    el.className = "modal-backdrop";
    el.innerHTML = `<div class="modal">${html}</div>`;

    document.body.appendChild(el);

    el.addEventListener("click", e => {
      if (e.target === el) el.remove();
    });

    return el;
  }

  // -----------------------------
  // ایجاد و ویرایش پروژه
  // -----------------------------

  function showProjectModal(project = null) {
    if (state.profile?.role !== "manager") {
      toast("فقط مدیر می‌تواند پروژه ایجاد یا ویرایش کند.", "error");
      return;
    }

    const isEdit = !!project;

    if (isEdit && !isValidUUID(project.id)) {
      toast("شناسه پروژه برای ویرایش معتبر نیست.", "error");
      return;
    }

    const m = modal(`
      <div class="modal-head">
        <h2>${isEdit ? "ویرایش پروژه" : "ایجاد پروژه جدید"}</h2>
        <button class="close" type="button">×</button>
      </div>

      <form id="project-form">

        <div class="field">
          <label>نام پروژه</label>
          <input
            class="input"
            id="p-name"
            required
            value="${esc(project?.name || "")}"
          />
        </div>

        <div class="field">
          <label>توضیح کوتاه</label>
          <textarea
            id="p-desc"
            placeholder="مثلاً: پیگیری خرید و واردات ۵۰۰ تن فرومنگنز"
          >${esc(project?.description || "")}</textarea>
        </div>

        <div class="field">
          <label>مسئول پروژه</label>

          <select id="p-assigned">
            <option value="">تعیین نشده</option>

            ${state.experts.map(e => `
              <option
                value="${esc(e.id)}"
                ${project?.assigned_to === e.id ? "selected" : ""}
              >
                ${esc(e.full_name)} — ${esc(e.email)}
              </option>
            `).join("")}
          </select>
        </div>

        <div class="field">
          <label>وضعیت</label>

          <select id="p-status">
            ${Object.entries(statusMeta).map(([k, v]) => `
              <option
                value="${k}"
                ${
                  project?.status === k ||
                  (!project && k === "active")
                    ? "selected"
                    : ""
                }
              >
                ${v.label}
              </option>
            `).join("")}
          </select>
        </div>

        <div class="modal-actions">
          <button class="btn btn-primary" type="submit">
            ${isEdit ? "ذخیره تغییرات" : "ایجاد پروژه"}
          </button>

          <button class="btn btn-ghost cancel" type="button">
            انصراف
          </button>
        </div>

      </form>
    `);

    m.querySelector(".close").onclick = () => m.remove();
    m.querySelector(".cancel").onclick = () => m.remove();

    m.querySelector("#project-form").onsubmit = async e => {
      e.preventDefault();

      const btn = e.submitter;

      if (btn.disabled) return;

      const name = m.querySelector("#p-name").value.trim();
      const description = m.querySelector("#p-desc").value.trim();
      const assignedValue = m.querySelector("#p-assigned").value.trim();
      const status = m.querySelector("#p-status").value;

      if (!name) {
        toast("نام پروژه را وارد کنید.", "error");
        return;
      }

      if (!isValidUUID(state.profile?.id)) {
        toast(
          "شناسه پروفایل مدیر معتبر نیست. لطفاً از سیستم خارج شوید و دوباره وارد شوید.",
          "error"
        );

        console.error("Invalid manager profile ID:", state.profile);
        return;
      }

      if (isEdit && !isValidUUID(project.id)) {
        toast("شناسه پروژه برای ویرایش معتبر نیست.", "error");
        return;
      }

      let assignedTo = null;

      if (assignedValue !== "") {
        if (!isValidUUID(assignedValue)) {
          toast("شناسه مسئول پروژه معتبر نیست.", "error");
          console.error("Invalid assigned_to value:", assignedValue);
          return;
        }

        assignedTo = assignedValue;
      }

      const payload = {
        name,
        description,
        assigned_to: assignedTo,
        status
      };

      const requestPayload = isEdit
        ? payload
        : {
            ...payload,
            created_by: state.profile.id
          };

      console.log("Project save diagnostic:", {
        operation: isEdit ? "update" : "insert",
        projectId: isEdit ? project.id : null,
        profileId: state.profile?.id,
        assignedTo,
        payload: requestPayload
      });

      btn.disabled = true;
      btn.textContent = "در حال ذخیره...";

      try {
        let result;

        if (isEdit) {
          result = await
