(() => {
  const tokenKey = "vortex-admin-token";
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const hasNumber = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  const formatDate = value => value ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "No activity yet";
  const getToken = () => localStorage.getItem(tokenKey) || "";
  const request = async (url, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
    if (options.body) headers["Content-Type"] = "application/json";
    const response = await fetch(url, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "The server could not complete this request.");
    return body;
  };
  const setMessage = (selector, message = "", type = "") => {
    const target = $(selector);
    target.textContent = message;
    target.dataset.type = type;
  };
  const setWorkspace = visible => {
    $("#adminLogin").hidden = visible;
    $("#adminWorkspace").hidden = !visible;
    $("#adminLogout").hidden = !visible;
  };

  const renderStats = stats => {
    $("#statStudents").textContent = stats.students ?? 0;
    $("#statPremium").textContent = stats.premiumStudents ?? 0;
    $("#statAttempts").textContent = stats.ieltsAttempts ?? ((stats.readingAttempts ?? 0) + (stats.listeningAttempts ?? 0));
    $("#statMaterials").textContent = stats.resources ?? 0;
  };

  let allStudents = [];

  const renderStudents = students => {
    const target = $("#adminStudents");
    if (!students.length) {
      target.innerHTML = '<p class="empty-state">No matching student accounts.</p>';
      return;
    }
    target.innerHTML = students.map(student => {
      const initials = student.name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
      const band = hasNumber(student.bestBand) ? `Best band ${Number(student.bestBand).toFixed(1)}` : "No band yet";
      const isPrem = student.plan === "premium";
      const expireInfo = isPrem
        ? (student.daysRemaining ? `★ Premium (${student.daysRemaining} kun qoldi)` : `★ Premium (Doimiy)`)
        : `Free`;
      return `<article class="student-row">
        <span class="avatar">${escapeHtml(initials || "S")}</span>
        <div>
          <strong style="font-size:14px;color:#0f172a;display:block;">${escapeHtml(student.name)}</strong>
          <div style="margin-top:3px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <small style="color:#64748b;">@${escapeHtml(student.username)}</small>
            <span class="plan-badge ${isPrem ? 'premium' : 'free'}">${escapeHtml(expireInfo)}</span>
          </div>
        </div>
        <div class="student-result"><strong>${student.tests || 0}</strong><small>tests</small></div>
        <div>
          <select class="admin-plan-select" data-student-id="${escapeHtml(student.id)}">
            <option value="" disabled selected>Tarif berish ▾</option>
            <optgroup label="💎 Sotuv Tariflari">
              <option value="30">💎 1 Oy (30 kun - 30 000)</option>
              <option value="90">💎 3 Oy (90 kun - 75 000)</option>
              <option value="180">💎 6 Oy (180 kun - 135 000)</option>
              <option value="365">💎 1 Yil (365 kun)</option>
            </optgroup>
            <optgroup label="⚡ Aksiya / Konkurs">
              <option value="3">⚡ +3 kun (Aksiya)</option>
              <option value="7">⚡ +7 kun (1 Hafta)</option>
              <option value="10">⚡ +10 kun (Konkurs)</option>
            </optgroup>
            <optgroup label="⚙️ Boshqa">
              <option value="0">👑 Cheksiz (Doimiy)</option>
              <option value="custom">✏️ Boshqa kun kiritish...</option>
              <option value="free">❌ Free qilish</option>
            </optgroup>
          </select>
        </div>
      </article>`;
    }).join("");
  };

  const renderSubmissions = submissions => {
    const target = $("#adminSubmissions");
    if (!target) return;
    if (!submissions || !submissions.length) {
      target.innerHTML = '<p class="empty-state">No test submissions yet.</p>';
      return;
    }
    target.innerHTML = submissions.slice(0, 20).map(sub => {
      const bandStr = hasNumber(sub.band) ? `Band ${Number(sub.band).toFixed(1)}` : `${sub.correct}/${sub.total}`;
      const skillIcon = sub.skill === 'listening' ? '🎧' : '📖';
      return `<article class="submission-row">
        <span style="font-size:18px;display:flex;align-items:center;justify-content:center;">${skillIcon}</span>
        <div style="min-width:0;overflow:hidden;">
          <strong style="font-size:13.5px;color:#0f172a;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(sub.studentName)}</strong>
          <small style="color:#64748b;font-size:11.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(sub.materialTitle || 'IELTS Test')}</small>
        </div>
        <div style="text-align:right;">
          <strong style="color:#059669;font-size:13px;display:block;">${escapeHtml(bandStr)}</strong>
          <small style="color:#64748b;font-size:11px;">${sub.correct}/${sub.total} correct</small>
        </div>
        <div style="text-align:right;font-size:11px;color:#6b7280;white-space:nowrap;">
          ${escapeHtml(formatDate(sub.createdAt))}
        </div>
      </article>`;
    }).join("");
  };

  const renderResources = resources => {
    const target = $("#adminResourceList");
    if (!resources.length) {
      target.innerHTML = '<p class="empty-state">No custom materials have been added yet.</p>';
      return;
    }
    target.innerHTML = resources.map(resource => `<article class="managed-resource"><div><p>${escapeHtml(resource.grade)} · ${escapeHtml(resource.skill)} · ${escapeHtml(resource.access)}</p><h3>${escapeHtml(resource.title)}</h3><span>${escapeHtml(resource.description || "No description")}</span></div><button class="delete-button" data-resource-id="${escapeHtml(resource.id)}" type="button" aria-label="Remove ${escapeHtml(resource.title)}">Remove</button></article>`).join("");
  };

  const renderPromoCodes = promos => {
    const target = $("#adminPromoList");
    if (!target) return;
    if (!promos || !promos.length) {
      target.innerHTML = '<p class="empty-state">No promo codes created yet. Fill the form to create one!</p>';
      return;
    }
    target.innerHTML = promos.map(p => {
      const usageStr = p.maxUses > 0 ? `${p.uses || 0} / ${p.maxUses} used` : `${p.uses || 0} used (Unlimited)`;
      return `<article class="student-row" style="align-items:center;">
        <span style="font-size:18px;">🎟️</span>
        <div style="flex:1;min-width:140px;">
          <strong style="letter-spacing:0.04em;font-size:15px;color:#0f172a;">${escapeHtml(p.code)}</strong>
          <small>★ ${p.days} Days Premium · <span style="color:#6b7280;">${usageStr}</span></small>
        </div>
        <button class="delete-button" data-promo-id="${escapeHtml(p.id)}" type="button" style="padding:4px 10px;font-size:11.5px;">Delete</button>
      </article>`;
    }).join("");
  };

  const loadWorkspace = async () => {
    const [stats, students, submissions, resources, promos] = await Promise.all([
      request("/api/admin/stats"),
      request("/api/admin/students"),
      request("/api/admin/submissions"),
      request("/api/admin/resources"),
      request("/api/admin/promo-codes").catch(() => [])
    ]);
    allStudents = students || [];
    renderStats(stats);
    renderStudents(allStudents);
    renderSubmissions(submissions);
    renderResources(resources);
    renderPromoCodes(promos);
  };

  const searchInput = $("#studentSearch");
  if (searchInput) {
    searchInput.addEventListener("input", e => {
      const q = (e.target.value || "").trim().toLowerCase();
      if (!q) {
        renderStudents(allStudents);
        return;
      }
      const filtered = allStudents.filter(s =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.username || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q)
      );
      renderStudents(filtered);
    });
  }

  $("#adminLoginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector("button[type=submit]");
    submit.disabled = true;
    setMessage("#loginMessage");
    try {
      const login = await request("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ username: $("#adminUsername").value, password: $("#adminPassword").value })
      });
      localStorage.setItem(tokenKey, login.token);
      $("#adminPassword").value = "";
      setWorkspace(true);
      await loadWorkspace();
    } catch (error) {
      setMessage("#loginMessage", error.message, "error");
    } finally {
      submit.disabled = false;
    }
  });
  $("#adminPasswordToggle").addEventListener("click", event => {
    const input = $("#adminPassword");
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    event.currentTarget.textContent = visible ? "Show" : "Hide";
    event.currentTarget.setAttribute("aria-label", visible ? "Show password" : "Hide password");
    event.currentTarget.setAttribute("aria-pressed", String(!visible));
  });
  $("#resourceForm").addEventListener("submit", async event => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector("button[type=submit]");
    submit.disabled = true;
    setMessage("#resourceMessage");
    try {
      await request("/api/admin/resources", {
        method: "POST",
        body: JSON.stringify({
          title: $("#resourceTitle").value,
          grade: $("#resourceGrade").value,
          skill: $("#resourceSkill").value,
          type: $("#resourceType").value,
          collection: $("#resourceCollection").value,
          access: $("#resourceAccess").value,
          url: $("#resourceUrl").value,
          description: $("#resourceDescription").value
        })
      });
      event.currentTarget.reset();
      setMessage("#resourceMessage", "Material added to the library.", "success");
      await loadWorkspace();
    } catch (error) {
      setMessage("#resourceMessage", error.message, "error");
    } finally {
      submit.disabled = false;
    }
  });
  $("#adminResourceList").addEventListener("click", async event => {
    const button = event.target.closest("[data-resource-id]");
    if (!button) return;
    const confirmed = window.confirm("Remove this custom material from the library?");
    if (!confirmed) return;
    button.disabled = true;
    try {
      await request(`/api/admin/resources/${encodeURIComponent(button.dataset.resourceId)}`, { method: "DELETE" });
      await loadWorkspace();
    } catch (error) {
      button.disabled = false;
      setMessage("#resourceMessage", error.message, "error");
    }
  });
  $("#adminStudents").addEventListener("change", async event => {
    const select = event.target.closest(".admin-plan-select");
    if (!select) return;
    const studentId = select.dataset.studentId;
    const value = select.value;
    let plan = "premium";
    let days = null;

    if (value === "free") {
      plan = "free";
    } else if (value === "custom") {
      const input = prompt("Necha kunlik Premium bermoqchisiz? (Masalan: 5, 14, 45, 60):", "15");
      if (input === null) { select.value = ""; return; }
      days = parseInt(input, 10);
      if (isNaN(days) || days <= 0) { select.value = ""; return; }
      plan = "premium";
    } else {
      days = parseInt(value, 10);
      plan = "premium";
    }

    select.disabled = true;
    setMessage("#studentMessage");
    try {
      await request(`/api/admin/students/${encodeURIComponent(studentId)}/plan`, {
        method: "PUT",
        body: JSON.stringify({ plan, days })
      });
      const label = plan === 'premium' ? (days > 0 ? `${days} kunlik Premium berildi!` : 'Cheksiz Premium berildi!') : 'Free rejimiga oʻtkazildi!';
      setMessage("#studentMessage", `✔ ${label}`, "success");
      await loadWorkspace();
    } catch (error) {
      select.disabled = false;
      setMessage("#studentMessage", error.message, "error");
    }
  });

  $("#promoForm").addEventListener("submit", async event => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector("button[type=submit]");
    submit.disabled = true;
    setMessage("#promoMessage");
    try {
      await request("/api/admin/promo-codes", {
        method: "POST",
        body: JSON.stringify({
          code: $("#promoCodeInput").value,
          days: $("#promoDaysInput").value,
          maxUses: $("#promoMaxUsesInput").value
        })
      });
      event.currentTarget.reset();
      $("#promoDaysInput").value = "3";
      $("#promoMaxUsesInput").value = "50";
      setMessage("#promoMessage", "Promo code created successfully!", "success");
      await loadWorkspace();
    } catch (error) {
      setMessage("#promoMessage", error.message, "error");
    } finally {
      submit.disabled = false;
    }
  });
  $("#adminPromoList").addEventListener("click", async event => {
    const button = event.target.closest("[data-promo-id]");
    if (!button) return;
    const confirmed = window.confirm("Delete this promo code?");
    if (!confirmed) return;
    button.disabled = true;
    try {
      await request(`/api/admin/promo-codes/${encodeURIComponent(button.dataset.promoId)}`, { method: "DELETE" });
      await loadWorkspace();
    } catch (error) {
      button.disabled = false;
      setMessage("#promoMessage", error.message, "error");
    }
  });
  $("#adminLogout").addEventListener("click", async () => {
    try { await request("/api/admin/logout", { method: "POST" }); } catch (_) {}
    localStorage.removeItem(tokenKey);
    setWorkspace(false);
    $("#adminUsername").focus();
  });
  (async () => {
    if (!getToken()) return;
    try {
      await request("/api/admin/session");
      setWorkspace(true);
      await loadWorkspace();
    } catch (_) {
      localStorage.removeItem(tokenKey);
    }
  })();
})();
