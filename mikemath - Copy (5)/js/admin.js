/**
 * MIKE MATH - ADVANCED ADMIN ENTERPRISE SYSTEM
 * Module: admin.js
 * Version: 3.2.0 (Integrated 2-Tier Rubric & Knowledge Mapping)
 */

import { db, auth } from "./firebase.js";
import { 
    collection, doc, getDoc, getDocs, updateDoc, setDoc, addDoc, deleteDoc, 
    query, where, orderBy, limit, startAfter, serverTimestamp, writeBatch, collectionGroup
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import toast from "/components/toast.js";
import { 
    fetchAllCoursesAdmin, 
    fetchCourseDetailAndLessons, 
    saveCourse, 
    deleteCourse, 
    saveCourseLesson, 
    deleteCourseLesson, 
    fetchKnowledgeArticlesList 
} from "./course-engine/course-manager.js";

// ==========================================
// 1. MODAL MANAGER SYSTEM
// ==========================================
export const modalManager = {
    get container() {
        let el = document.getElementById("adminModalContainer");
        if (!el) {
            el = document.createElement("div");
            el.id = "adminModalContainer";
            el.className = "modal-container";
            document.body.appendChild(el);
        }
        return el;
    },

    open({ title, body, footer, width = "600px", onClose }) {
        this.close(); // Close active modal
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay active";
        overlay.innerHTML = `
            <div class="modal-card" style="max-width: ${width}; width: 90%;">
                <div class="modal-header">
                    <h3>${escapeHtml(title)}</h3>
                    <button class="modal-close-btn">&times;</button>
                </div>
                <div class="modal-body">${body}</div>
                ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
            </div>
        `;

        const closeBtn = overlay.querySelector(".modal-close-btn");
        const handleClose = () => {
            overlay.remove();
            if (onClose) onClose();
        };

        closeBtn.onclick = handleClose;
        overlay.onclick = (e) => { if (e.target === overlay) handleClose(); };

        this.container.appendChild(overlay);
        return overlay;
    },

    close() {
        this.container.innerHTML = "";
    },

    confirm({ title = "Xác nhận action", message, onConfirm }) {
        this.open({
            title,
            body: `<p>${escapeHtml(message)}</p>`,
            footer: `
                <button class="btn-secondary" id="modalBtnCancel">Hủy</button>
                <button class="btn-danger" id="modalBtnConfirm" style="background:#dc2626; color:#fff;">Xác nhận</button>
            `,
            width: "400px"
        });

        document.getElementById("modalBtnCancel").onclick = () => this.close();
        document.getElementById("modalBtnConfirm").onclick = async () => {
            await onConfirm();
            this.close();
        };
    },

    alert({ title = "Thông báo", message }) {
        this.open({
            title,
            body: `<p>${escapeHtml(message)}</p>`,
            footer: `<button class="btn-primary" id="modalBtnOk">Đồng ý</button>`,
            width: "400px"
        });
        document.getElementById("modalBtnOk").onclick = () => this.close();
    }
};

// ==========================================
// 2. SPA ROUTER SYSTEM & STATE STORE
// ==========================================
export const AdminRouter = {
    init() {
        window.addEventListener("hashchange", () => this.handleRoute());
        this.handleRoute();
    },

    handleRoute() {
        const hash = window.location.hash.replace("#", "") || "dashboard";
        const controller = controllers[hash] ? hash : "dashboard";

        document.querySelectorAll(".tab-pane").forEach(el => el.classList.remove("active"));
        document.querySelectorAll(".menu-item").forEach(el => el.classList.remove("active"));

        const activeTab = document.getElementById(`tab-${controller}`);
        const activeMenu = document.querySelector(`.menu-item[href="#${controller}"]`);

        if (activeTab) activeTab.classList.add("active");
        if (activeMenu) activeMenu.classList.add("active");

        const titleEl = document.getElementById("currentTabTitle");
        if (titleEl && activeMenu) titleEl.textContent = activeMenu.textContent.trim();

        controllers[controller]?.load();
    }
};

const stateStore = {
    selectedItems: new Set(),
    lastDoc: null,
    pageSize: 15,
    filters: {},
    sort: { field: "createdAt", dir: "desc" }
};

const renderUIState = {
    loading(containerId) {
        const el = document.getElementById(containerId);
        if (el) el.innerHTML = `<tr><td colspan="100%" class="ui-state-loading" style="text-align:center; padding: 24px;"><div class="spinner"></div> Đang tải dữ liệu...</td></tr>`;
    },
    empty(containerId, message = "Không có dữ liệu phù hợp.") {
        const el = document.getElementById(containerId);
        if (el) el.innerHTML = `<tr><td colspan="100%" class="ui-state-empty" style="text-align:center; padding: 24px; color:#6b7280;">${message}</td></tr>`;
    },
    error(containerId, message = "Đã xảy ra lỗi khi tải dữ liệu.", onRetry) {
        const el = document.getElementById(containerId);
        if (el) {
            el.innerHTML = `<tr><td colspan="100%" class="ui-state-error" style="text-align:center; padding: 24px; color:#dc2626;">
                <p>${message}</p>
                <button id="btnRetryState" class="btn-secondary" style="margin-top:8px;">Thử lại</button>
            </td></tr>`;
            document.getElementById("btnRetryState")?.addEventListener("click", onRetry);
        }
    }
};

// ==========================================
// 3. CONTROLLERS MAP
// ==========================================
export const controllers = {
    // --------------------------------------
    // 3.1 DASHBOARD
    // --------------------------------------
    dashboard: {
        async load() {
            try {
                const startOfDay = new Date();
                startOfDay.setHours(0,0,0,0);

                const [uSnap, pSnap, sSnap, aiDoneSnap, aiErrSnap, pendSnap] = await Promise.all([
                    getDocs(query(collection(db, "users"), where("createdAt", ">=", startOfDay))),
                    getDocs(query(collection(db, "problems"), where("createdAt", ">=", startOfDay))),
                    getDocs(query(collection(db, "submissions"), where("createdAt", ">=", startOfDay))),
                    getDocs(query(collection(db, "submissions"), where("createdAt", ">=", startOfDay), where("aiStatus", "==", "completed"))),
                    getDocs(query(collection(db, "submissions"), where("createdAt", ">=", startOfDay), where("aiStatus", "==", "failed"))),
                    getDocs(query(collection(db, "submissions"), where("aiStatus", "==", "pending")))
                ]);

                if (document.getElementById("metricTodayUsers")) document.getElementById("metricTodayUsers").textContent = uSnap.size;
                if (document.getElementById("metricTodayProblems")) document.getElementById("metricTodayProblems").textContent = pSnap.size;
                if (document.getElementById("metricTodaySubmissions")) document.getElementById("metricTodaySubmissions").textContent = sSnap.size;
                if (document.getElementById("metricAiDone")) document.getElementById("metricAiDone").textContent = aiDoneSnap.size;
                if (document.getElementById("metricAiError")) document.getElementById("metricAiError").textContent = aiErrSnap.size;
                if (document.getElementById("metricPending")) document.getElementById("metricPending").textContent = pendSnap.size;

                this.render7DaysChart();
                this.loadLeaderboards();
            } catch (err) {
                console.error("Dashboard Load Error:", err);
                toast.error("Không thể tải thống kê Dashboard Realtime!");
            }
        },

        async render7DaysChart() {
            const ctx = document.getElementById("chart7DaysActivity")?.getContext("2d");
            if (!ctx) return;

            const days7Ago = new Date();
            days7Ago.setDate(days7Ago.getDate() - 7);

            const qSnap = await getDocs(query(collection(db, "submissions"), where("createdAt", ">=", days7Ago)));
            const dayCounts = {};

            qSnap.forEach(docSnap => {
                const dateStr = docSnap.data().createdAt?.toDate().toLocaleDateString("vi-VN", { weekday: 'short' }) || "N/A";
                dayCounts[dateStr] = (dayCounts[dateStr] || 0) + 1;
            });

            if (window.dashboardChart) window.dashboardChart.destroy();
            if (window.Chart) {
                window.dashboardChart = new Chart(ctx, {
                    type: "bar",
                    data: {
                        labels: Object.keys(dayCounts),
                        datasets: [{ label: "Bài nộp 7 ngày qua", data: Object.values(dayCounts), backgroundColor: "#3b82f6" }]
                    }
                });
            }
        },

        async loadLeaderboards() {
            try {
                const [topTopics, topAuthors, topStudents] = await Promise.all([
                    getDocs(query(collection(db, "topics"), orderBy("problemCount", "desc"), limit(5))),
                    getDocs(query(collection(db, "users"), where("role", "==", "teacher"), limit(5))),
                    getDocs(query(collection(db, "users"), orderBy("xp", "desc"), limit(5)))
                ]);

                this.renderList("listTopTopics", topTopics, t => `${t.name} (${t.problemCount || 0} bài)`);
                this.renderList("listTopAuthors", topAuthors, a => `${a.username || a.email}`);
                this.renderList("listTopStudents", topStudents, s => `${s.username || 'Học sinh'} - ${s.xp || 0} XP`);
            } catch (e) {
                console.warn("Leaderboard load warning:", e);
            }
        },

        renderList(elementId, snap, formatter) {
            const el = document.getElementById(elementId);
            if (!el) return;
            if (snap.empty) {
                el.innerHTML = `<li class="list-item" style="color:var(--admin-muted);">Chưa có dữ liệu</li>`;
                return;
            }
            el.innerHTML = snap.docs.map(d => `<li class="list-item">${escapeHtml(formatter(d.data()))}</li>`).join("");
        }
    },

    // --------------------------------------
    // 3.2 AI STATS
    // --------------------------------------
    aistats: {
        async load() {
            try {
                const snap = await getDoc(doc(db, "analytics", "ai_metrics"));
                const data = snap.exists() ? snap.data() : {};

                if (document.getElementById("aiGeminiRequests")) document.getElementById("aiGeminiRequests").textContent = data.geminiRequests || 0;
                if (document.getElementById("aiWorkerErrors")) document.getElementById("aiWorkerErrors").textContent = data.workerErrors || 0;
                if (document.getElementById("aiAvgScore")) document.getElementById("aiAvgScore").textContent = (data.avgScore || 0).toFixed(1);
                if (document.getElementById("aiAvgConfidence")) document.getElementById("aiAvgConfidence").textContent = `${((data.avgConfidence || 0) * 100).toFixed(0)}%`;
                if (document.getElementById("aiRegradeCount")) document.getElementById("aiRegradeCount").textContent = data.regradeCount || 0;
                if (document.getElementById("aiParseFail")) document.getElementById("aiParseFail").textContent = data.parseFailCount || 0;
                if (document.getElementById("aiAvgResponseTime")) document.getElementById("aiAvgResponseTime").textContent = `${data.avgResponseTimeMs || 0} ms`;
                if (document.getElementById("aiTokenUsage")) document.getElementById("aiTokenUsage").textContent = (data.totalTokens || 0).toLocaleString();
                if (document.getElementById("aiEstCost")) document.getElementById("aiEstCost").textContent = `$${((data.totalTokens || 0) * 0.000002).toFixed(4)}`;
            } catch (err) {
                toast.error("Lỗi tải thống kê AI Metrics!");
            }
        }
    },

    // --------------------------------------
    // 3.3 PROBLEMS
    // --------------------------------------
    problems: {
        async load(isNext = false) {
            const containerId = "tblProblems";
            if (!isNext) { stateStore.lastDoc = null; stateStore.selectedItems.clear(); }
            renderUIState.loading(containerId);

            try {
                let q = query(
                    collection(db, "problems"), 
                    where("deleted", "==", false),
                    orderBy(stateStore.sort.field, stateStore.sort.dir),
                    limit(stateStore.pageSize)
                );

                if (isNext && stateStore.lastDoc) {
                    q = query(q, startAfter(stateStore.lastDoc));
                }

                const snap = await getDocs(q);
                if (snap.empty && !isNext) { renderUIState.empty(containerId); return; }

                stateStore.lastDoc = snap.docs[snap.docs.length - 1];
                const tbody = document.getElementById(containerId);
                if (!tbody) return;
                tbody.innerHTML = "";

                snap.forEach(docSnap => {
                    const p = docSnap.data();
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td><input type="checkbox" class="chk-item" value="${docSnap.id}" ${stateStore.selectedItems.has(docSnap.id) ? 'checked' : ''}></td>
                        <td><strong>${escapeHtml(p.title)}</strong></td>
                        <td>Lớp ${p.grade || 8}</td>
                        <td><span class="badge badge-${p.difficulty || 'medium'}">${p.difficulty || 'medium'}</span></td>
                        <td>${p.rubricTemplateId ? `<code>${p.rubricTemplateId}</code>` : 'Không'}</td>
                        <td>${p.hidden ? '<span class="badge-disabled">Ẩn</span>' : '<span class="badge-active">Hiện</span>'}</td>
                        <td>
                            <button onclick="adminModule.openProblemEditorModal('${docSnap.id}')" class="btn-sm">Sửa</button>
                            <button onclick="adminModule.softDelete('problems', '${docSnap.id}')" class="btn-sm btn-danger">Xóa (Bin)</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });

                adminModule.bindBatchCheckboxes();
            } catch (err) {
                console.error(err);
                renderUIState.error(containerId, "Lỗi tải danh sách bài tập", () => this.load());
            }
        }
    },

    // --------------------------------------
    // 3.4 SUBMISSIONS
    // --------------------------------------
// --------------------------------------
// 3.4 SUBMISSIONS (ADMIN)
// --------------------------------------
// --------------------------------------
// 3.4 SUBMISSIONS (ALL USERS LOAD)
// --------------------------------------
submissions: {
    async load() {

        const containerId = "tblSubmissions";
        renderUIState.loading(containerId);

        try {

            let snap;

            // ==========================
            // LOAD FIRESTORE
            // ==========================

            try {

                const q = query(
                    collection(db, "submissions"),
                    orderBy("createdAt", "desc"),
                    limit(50)
                );

                snap = await getDocs(q);

            } catch (queryErr) {


                snap = await getDocs(
                    collection(db, "submissions")
                );

            }

            if (!snap) {
                throw new Error("Không lấy được QuerySnapshot.");
            }

            const tbody = document.getElementById(containerId);

            if (!tbody) return;

            if (snap.empty) {

                renderUIState.empty(
                    containerId,
                    "Chưa có bài nộp nào."
                );

                return;

            }

            // ==========================
            // DEBUG RAW DATA
            // ==========================

            // ==========================
            // FILTER
            // ==========================

            const activeDocs = snap.docs.filter(docSnap => {

                const data = docSnap.data();

                return data.deleted !== true;

            });

            // Đếm số user khác nhau

            const uniqueUsers = [...new Set(

                activeDocs.map(docSnap => {

                    const d = docSnap.data();

                    return d.userId || d.authorId;

                })

            )];

            if (activeDocs.length === 0) {

                renderUIState.empty(
                    containerId,
                    "Không có bài nộp."
                );

                return;

            }

            tbody.innerHTML = "";

            // ==========================
            // RENDER
            // ==========================

            activeDocs.forEach(docSnap => {
    
                const s = docSnap.data();

                const tr = document.createElement("tr");

                const studentName =
                    s.authorName ||
                    s.userName ||
                    s.displayName ||
                    s.username ||
                    "Học sinh ẩn danh";

                const scoreText =
                    s.manualScore != null
                        ? `<span style="color:#2563eb;font-weight:bold">${s.manualScore}/10 (Chấm tay)</span>`
                        : typeof s.score === "number"
                            ? `${s.score}/10`
                            : `<span style="color:#9ca3af">Chưa chấm</span>`;

                const aiStatus =
                    s.aiStatus ||
                    s.status ||
                    "completed";

                let statusBadge = "";
                switch (aiStatus) {

                    case "completed":
                        statusBadge =
                            `<span class="badge badge-success">Hoàn tất</span>`;
                        break;

                    case "failed":
                        statusBadge =
                            `<span class="badge badge-danger">Lỗi AI</span>`;
                        break;

                    default:
                        statusBadge =
                            `<span class="badge badge-warning">Đang xử lý</span>`;

                }

                tr.innerHTML = `

                    <td><code>${docSnap.id.substring(0,8)}...</code></td>

                    <td>
                        <strong>${escapeHtml(studentName)}</strong><br>
                        <small>${s.authorId || s.userId || "-"}</small>
                    </td>

                    <td>${escapeHtml(s.problemTitle || "(Không có tiêu đề)")}</td>

                    <td>${scoreText}</td>

                    <td>${statusBadge}</td>

                    <td>${formatDate(s.createdAt)}</td>

                    <td>

                        <a href="submit-detail.html?id=${docSnap.id}"
                           target="_blank"
                           class="btn-sm">
                           Xem UI
                        </a>

                        <button
                            onclick="adminModule.viewSubmissionFull('${docSnap.id}')"
                            class="btn-sm">
                            RAW
                        </button>

                        <button
                            onclick="adminModule.regradeSubmission('${docSnap.id}')"
                            class="btn-sm">
                            Chấm lại
                        </button>

                        <button
                            onclick="adminModule.manualGradeModal('${docSnap.id}')"
                            class="btn-sm">
                            Chấm tay
                        </button>

                    </td>

                `;

                tbody.appendChild(tr);

            });

        } catch (err) {

            console.error("Lỗi khi nạp submissions:", err);

            renderUIState.error(
                containerId,
                err.message,
                () => this.load()
            );

        }

    }
},

    // --------------------------------------
    // 3.5 RUBRIC TEMPLATES
    // --------------------------------------
    rubrics: {
        async load() {
            const containerId = "tblRubrics";
            renderUIState.loading(containerId);

            try {
                const snap = await getDocs(query(collection(db, "rubricTemplates"), orderBy("updatedAt", "desc")));
                const tbody = document.getElementById(containerId);
                if (!tbody) return;
                
                if (snap.empty) {
                    renderUIState.empty(containerId, "Chưa có Rubric Template nào.");
                    return;
                }

                tbody.innerHTML = "";

                snap.forEach(docSnap => {
                    const r = docSnap.data();
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td>
                            <strong>${escapeHtml(r.name)}</strong><br>
                            <small style="color:var(--admin-muted);">slug: <code>${r.slug || docSnap.id}</code></small>
                        </td>
                        <td>Lớp ${escapeHtml(String(r.grade || '8'))}</td>
                        <td><code>${escapeHtml(r.topic || 'N/A')}</code></td>
                        <td><small>${escapeHtml((r.knowledgeIds || []).join(', ') || 'Tất cả')}</small></td>
                        <td><strong>${(r.criteria || []).length}</strong> bước</td>
                        <td><strong>${r.totalScore || 10}đ</strong></td>
                        <td>
                            <button onclick="adminModule.openRubricTemplateModal('${docSnap.id}')" class="btn-sm">Sửa Template</button>
                            <button onclick="adminModule.softDelete('rubricTemplates', '${docSnap.id}')" class="btn-sm btn-danger">Xóa</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            } catch (err) {
                console.error("Lỗi tải Rubrics:", err);
                renderUIState.error(containerId, "Lỗi khi tải danh sách Rubric Templates", () => this.load());
            }
        }
    },

    // --------------------------------------
    // 3.6 KNOWLEDGE ARTICLES
    // --------------------------------------
knowledge: {
    async load() {
        const containerId = "tblKnowledge";
        renderUIState.loading(containerId);

        try {
            const snap = await getDocs(
                query(
                    collection(db, "knowledgeArticles"),
                    where("hidden", "==", false)
                )
            );

            const tbody = document.getElementById(containerId);
            if (!tbody) return;

            const docs = snap.docs.filter(
                docSnap => docSnap.data().deleted !== true
            );

            if (docs.length === 0) {
                renderUIState.empty(containerId);
                return;
            }

            tbody.innerHTML = "";

            docs.forEach(docSnap => {
                const k = docSnap.data();

                const tr = document.createElement("tr");

                tr.innerHTML = `
                    <td>
                        <strong>
                            ${escapeHtml(k.title || "Chưa có tiêu đề")}
                        </strong><br>

                        <small style="color:var(--admin-muted);">
                            ${escapeHtml(k.summary || "")}
                        </small>
                    </td>

                    <td>
                        <code>${k.slug || docSnap.id}</code>
                    </td>

                    <td>
                        <code>${k.folderId || "N/A"}</code>
                    </td>

                    <td>
                        <span class="badge badge-info">
                            ${(k.blocks || []).length} blocks
                        </span>
                    </td>

                    <td>
                        <button
                            onclick="adminModule.editKnowledgeModal('${docSnap.id}')"
                            class="btn-sm">
                            Sửa
                        </button>

                        <button
                            onclick="adminModule.softDelete('knowledgeArticles', '${docSnap.id}')"
                            class="btn-sm btn-danger">
                            Xóa
                        </button>
                    </td>
                `;

                tbody.appendChild(tr);
            });

        } catch (err) {
            console.error("Lỗi tải kiến thức:", err);

            renderUIState.error(
                containerId,
                "Lỗi tải bài viết kiến thức",
                () => this.load()
            );
        }
    }
},

    // --------------------------------------
    // COURSES CONTROLLER
    // --------------------------------------
    courses: {
        async load() {
            renderUIState.loading("tblCourses");
            try {
                const coursesList = await fetchAllCoursesAdmin();

                let totalPublished = 0;
                let totalLessonsCount = 0;

                coursesList.forEach(c => {
                    if (c.published) totalPublished++;
                    if (Array.isArray(c.lessons)) totalLessonsCount += c.lessons.length;
                });

                if (document.getElementById("metricTotalCourses")) document.getElementById("metricTotalCourses").textContent = coursesList.length;
                if (document.getElementById("metricPublishedCourses")) document.getElementById("metricPublishedCourses").textContent = totalPublished;
                if (document.getElementById("metricTotalLessons")) document.getElementById("metricTotalLessons").textContent = totalLessonsCount;

                const searchInput = document.getElementById("filterCourseSearch");
                const gradeSelect = document.getElementById("filterCourseGrade");
                const statusSelect = document.getElementById("filterCourseStatus");

                const applyFilters = () => {
                    const queryStr = (searchInput?.value || "").toLowerCase().trim();
                    const gradeVal = gradeSelect?.value || "";
                    const statusVal = statusSelect?.value || "";

                    const filtered = coursesList.filter(c => {
                        const matchSearch = !queryStr || (c.title || "").toLowerCase().includes(queryStr) || (c.description || "").toLowerCase().includes(queryStr);
                        const matchGrade = !gradeVal || String(c.grade) === gradeVal;
                        const matchStatus = !statusVal || (statusVal === "published" ? c.published : !c.published);
                        return matchSearch && matchGrade && matchStatus;
                    });

                    this.renderTable(filtered);
                };

                if (searchInput) searchInput.oninput = applyFilters;
                if (gradeSelect) gradeSelect.onchange = applyFilters;
                if (statusSelect) statusSelect.onchange = applyFilters;

                this.renderTable(coursesList);
            } catch (err) {
                console.error("Courses load error:", err);
                renderUIState.error("tblCourses", "Lỗi khi tải danh sách khóa học", () => this.load());
            }
        },

        renderTable(coursesList) {
            const tbody = document.getElementById("tblCourses");
            if (!tbody) return;

            if (coursesList.length === 0) {
                renderUIState.empty("tblCourses", "Chưa có khóa học nào.");
                return;
            }

            tbody.innerHTML = coursesList.map(c => `
                <tr>
                    <td>
                        <div style="font-weight: 800; color: var(--text-main); font-size: 0.95rem;">${escapeHtml(c.title)}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(c.description || '').substring(0, 70)}...</div>
                    </td>
                    <td><span class="badge badge-info">Lớp ${c.grade || 'N/A'}</span></td>
                    <td><span class="badge badge-warning">${escapeHtml(c.topicId || 'Tổng hợp')}</span></td>
                    <td><strong>${c.lessons ? c.lessons.length : 0} bài</strong></td>
                    <td>${c.estimatedMinutes || 60} phút</td>
                    <td>
                        <span class="badge ${c.published ? 'badge-success' : 'badge-danger'}">
                            ${c.published ? 'Đã xuất bản' : 'Bản nháp'}
                        </span>
                    </td>
                    <td>
                        <div style="display:flex; gap: 6px; flex-wrap: wrap;">
                            <button class="btn-primary" style="padding: 4px 8px; font-size: 0.78rem;" onclick="adminModule.openCourseLessonsModal('${c.id}')" title="Quản lý lộ trình & bài học">
                                <i class="fa-solid fa-route"></i> Bài học
                            </button>
                            <button class="btn-secondary" style="padding: 4px 8px; font-size: 0.78rem;" onclick="adminModule.openCourseEditorModal('${c.id}')" title="Sửa thông tin khóa học">
                                <i class="fa-solid fa-pen-to-square"></i> Sửa
                            </button>
                            <button class="btn-danger" style="padding: 4px 8px; font-size: 0.78rem; background:#ef4444; color:#fff;" onclick="adminModule.deleteCourse('${c.id}')" title="Xóa khóa học">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join("");
        }
    },

    // --------------------------------------
    // 3.7 TOPICS
    // --------------------------------------
    topics: {
        async load() {
            const containerId = "tblTopics";
            renderUIState.loading(containerId);

            try {
                const snap = await getDocs(collection(db, "topics"));
                const tbody = document.getElementById(containerId);
                if (!tbody) return;

                const list = snap.docs
                    .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
                    .filter(item => !item.deleted)
                    .sort((a, b) => (a.order || 0) - (b.order || 0));

                if (list.length === 0) { 
                    renderUIState.empty(containerId); 
                    return; 
                }

                tbody.innerHTML = "";

                list.forEach(t => {
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td>
                            <span style="color:${t.color || '#000'}">${t.icon || '📁'}</span> 
                            <strong>${escapeHtml(t.name || 'Không tên')}</strong>
                        </td>
                        <td><code>${escapeHtml(t.slug || '')}</code></td>
                        <td>STT: ${t.order || 0}</td>
                        <td>📖 ${t.knowledgeCount || 0} | 📝 ${t.problemCount || 0}</td>
                        <td>
                            <button onclick="adminModule.editTopicModal('${t.id}')" class="btn-sm">Sửa Extended</button>
                            <button onclick="adminModule.softDelete('topics', '${t.id}')" class="btn-sm btn-danger">Xóa</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            } catch (err) {
                console.error("Lỗi tải danh mục Topics:", err);
                renderUIState.error(containerId, "Lỗi tải danh mục Topics: " + err.message, () => this.load());
            }
        },

        async loadToSelect() {
            const topicSelect = document.getElementById("topicSelect");
            if (!topicSelect) return;

            try {
                const snapshot = await getDocs(collection(db, "topics"));
                const defaultTopics = ["Đại số", "Hình học", "Số học", "Tổ hợp"];
                
                const dbTopics = snapshot.docs
                    .map(docSnap => docSnap.data())
                    .filter(data => !data.deleted && data.name)
                    .map(data => data.name);

                const allTopics = Array.from(new Set([...defaultTopics, ...dbTopics]));
                topicSelect.innerHTML = `<option value="">-- Chọn chủ đề --</option>`;

                allTopics.forEach(topic => {
                    const opt = document.createElement("option");
                    opt.value = topic;
                    opt.textContent = topic;
                    topicSelect.appendChild(opt);
                });

                const customOpt = document.createElement("option");
                customOpt.value = "custom";
                customOpt.textContent = "➕ Chủ đề khác (Tự nhập)";
                topicSelect.appendChild(customOpt);

            } catch (e) {
                console.error("Lỗi khi tải danh sách chủ đề:", e);
            }
        }
    },

    // --------------------------------------
    // 3.8 COMMENTS
    // --------------------------------------
    comments: {
        async load() {
            const containerId = "tblComments";
            renderUIState.loading(containerId);

            try {
                const q = query(
                    collectionGroup(db, "comments"), 
                    orderBy("createdAt", "desc")
                );
                
                const snap = await getDocs(q);
                const tbody = document.getElementById(containerId);
                if (!tbody) return;

                const activeDocs = snap.docs.filter(docSnap => !docSnap.data().deleted);

                if (activeDocs.length === 0) { 
                    renderUIState.empty(containerId); 
                    return; 
                }

                tbody.innerHTML = "";

                activeDocs.forEach(docSnap => {
                    const c = docSnap.data();
                    const tr = document.createElement("tr");
                    const author = c.authorUsername || c.authorName || c.userName || 'Nặc danh';

                    tr.innerHTML = `
                        <td>
                            <strong>${escapeHtml(author)}</strong> 
                            ${c.isPinned ? '📌' : ''}
                        </td>
                        <td>${escapeHtml(c.content || '')}</td>
                        <td>
                            ${c.hidden 
                                ? '<span class="badge badge-disabled">Đã Ẩn</span>' 
                                : '<span class="badge badge-active">Hiện</span>'}
                        </td>
                        <td>
                            <button onclick="adminModule.toggleCommentHide('${docSnap.ref.path}', ${!c.hidden})" class="btn-sm">
                                ${c.hidden ? 'Hiện' : 'Ẩn'}
                            </button>
                            <button onclick="adminModule.toggleCommentPin('${docSnap.ref.path}', ${!c.isPinned})" class="btn-sm">
                                ${c.isPinned ? 'Bỏ Ghim' : 'Ghim'}
                            </button>
                            <button onclick="adminModule.softDeleteComment('${docSnap.ref.path}')" class="btn-sm btn-danger">
                                Xóa
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            } catch (err) {
                console.error("Lỗi tải bình luận:", err);
                renderUIState.error(containerId, "Lỗi tải bình luận: " + err.message, () => this.load());
            }
        }
    },

    // --------------------------------------
    // 3.9 USERS
    // --------------------------------------
    users: {
        async load() {
            const containerId = "tblUsers";
            renderUIState.loading(containerId);

            try {
                const snap = await getDocs(query(collection(db, "users"), limit(20)));
                const tbody = document.getElementById(containerId);
                if (!tbody) return;
                if (snap.empty) { renderUIState.empty(containerId); return; }
                tbody.innerHTML = "";

                snap.forEach(docSnap => {
                    const u = docSnap.data();
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td>
                            <img src="${u.avatar || u.photoURL || '/assets/images/non.png'}" style="width:28px; height:28px; border-radius:50%; vertical-align:middle; margin-right:6px;">
                            <strong>${escapeHtml(u.username || u.displayName || 'User')}</strong>
                        </td>
                        <td>${escapeHtml(u.email || 'N/A')}</td>
                        <td>Lv.${u.level || 1} (${u.xp || 0} XP)</td>
                        <td>🪙 ${u.coins || 0}</td>
                        <td><span class="badge badge-info">${u.role || 'student'}</span></td>
                        <td>${u.isBanned ? '<span class="badge-disabled">Banned</span>' : '<span class="badge-active">Hoạt động</span>'}</td>
                        <td>
                            <button onclick="adminModule.editUserModal('${docSnap.id}')" class="btn-sm">Sửa</button>
                            <button onclick="adminModule.banUserModal('${docSnap.id}')" class="btn-sm btn-danger">${u.isBanned ? 'Unban' : 'Ban'}</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            } catch (err) {
                renderUIState.error(containerId, "Lỗi tải người dùng", () => this.load());
            }
        }
    },

    // --------------------------------------
    // 3.10 LOGS
    // --------------------------------------
    logs: {
        async load() {
            const containerId = "tblLogs";
            renderUIState.loading(containerId);

            try {
                const snap = await getDocs(query(collection(db, "adminLogs"), orderBy("time", "desc"), limit(40)));
                const tbody = document.getElementById(containerId);
                if (!tbody) return;
                if (snap.empty) { renderUIState.empty(containerId); return; }
                tbody.innerHTML = "";

                snap.forEach(docSnap => {
                    const l = docSnap.data();
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td><strong>${escapeHtml(l.admin || 'Admin')}</strong></td>
                        <td><code>${l.action}</code></td>
                        <td><pre style="font-size:10px; margin:0; max-height:60px; overflow:auto;">OLD: ${JSON.stringify(l.oldValue || {})}\nNEW: ${JSON.stringify(l.newValue || {})}</pre></td>
                        <td>${l.ip || 'N/A'}</td>
                        <td>${formatDate(l.time)}</td>
                    `;
                    tbody.appendChild(tr);
                });
            } catch (err) {
                renderUIState.error(containerId, "Lỗi tải Audit Logs", () => this.load());
            }
        }
    },

    // --------------------------------------
    // 3.11 RECYCLE BIN
    // --------------------------------------
    recyclebin: {
        async load() {
            const containerId = "tblRecycleBin";
            renderUIState.loading(containerId);

            try {
                const collectionsToQuery = ["problems", "submissions", "rubricTemplates", "knowledgeArticles", "topics"];
                const tbody = document.getElementById(containerId);
                if (!tbody) return;
                tbody.innerHTML = "";

                let totalDeleted = 0;
                for (const colName of collectionsToQuery) {
                    const snap = await getDocs(query(collection(db, colName), where("deleted", "==", true)));
                    snap.forEach(docSnap => {
                        totalDeleted++;
                        const data = docSnap.data();
                        const tr = document.createElement("tr");
                        tr.innerHTML = `
                            <td><span class="badge badge-warning">${colName.toUpperCase()}</span></td>
                            <td><code>${docSnap.id}</code></td>
                            <td>${formatDate(data.deletedAt)}</td>
                            <td>${data.deletedBy || 'Admin'}</td>
                            <td>
                                <button onclick="adminModule.restoreItem('${colName}', '${docSnap.id}')" class="btn-sm">Khôi phục</button>
                                <button onclick="adminModule.hardDelete('${colName}', '${docSnap.id}')" class="btn-sm btn-danger">Xóa vĩnh viễn</button>
                            </td>
                        `;
                        tbody.appendChild(tr);
                    });
                }
                if (totalDeleted === 0) renderUIState.empty(containerId, "Thùng rác trống.");
            } catch (err) {
                renderUIState.error(containerId, "Lỗi tải Recycle Bin", () => this.load());
            }
        }
    },

    // --------------------------------------
    // 3.12 SETTINGS
    // --------------------------------------
    settings: {
        async load() {
            try {
                const snap = await getDoc(doc(db, "settings", "global"));
                const s = snap.exists() ? snap.data() : {};

                const fields = [
                    "setSiteName", "setMaintenance", "setCloudinaryKey", "setGeminiModel", 
                    "setWorkerUrl", "setPromptText", "setPromptVersion", "setUploadLimitMb", 
                    "setMaxImages", "setSubmissionTimeoutMs", "setAiTemperature", "setEnableRegister"
                ];

                fields.forEach(f => {
                    const el = document.getElementById(f);
                    if (!el) return;
                    const key = f.replace("set", "").charAt(0).toLowerCase() + f.replace("set", "").slice(1);
                    if (el.type === "checkbox") el.checked = !!s[key];
                    else el.value = s[key] !== undefined ? s[key] : "";
                });
            } catch (err) {
                toast.error("Không thể tải cấu hình hệ thống!");
            }
        }
    }
};

// ==========================================
// 4. CORE ADMIN ACTIONS & CRUD
// ==========================================
export const adminModule = {
    currentUser: null,

    async init() {
        onAuthStateChanged(auth, async (user) => {
            if (!user) { location.replace("login.html"); return; }

            try {
                const userSnap = await getDoc(doc(db, "users", user.uid));
                if (!userSnap.exists() || userSnap.data().role !== "admin") {
                    toast.error("Truy cập bị từ chối: Quyền Quản trị viên là bắt buộc!");
                    setTimeout(() => location.replace("index.html"), 1500);
                    return;
                }

                this.currentUser = { uid: user.uid, ...userSnap.data() };
                const nameEl = document.getElementById("adminProfileName");
                if (nameEl) nameEl.textContent = this.currentUser.username || this.currentUser.displayName || this.currentUser.email;

                AdminRouter.init();
                this.bindGlobalEvents();
            } catch (err) {
                toast.error("Lỗi xác minh tài khoản Admin!");
            }
        });
    },

    bindGlobalEvents() {
        document.getElementById("btnLogout")?.addEventListener("click", () => signOut(auth));
        document.getElementById("frmSettings")?.addEventListener("submit", async (e) => {
            e.preventDefault();
            await this.saveSettings();
        });
    },

    // --------------------------------------
    // COURSE MANAGEMENT MODALS & ACTIONS
    // --------------------------------------
    async openCourseEditorModal(courseId = null) {
        let course = {
            title: "",
            grade: 8,
            topicId: "Đại số",
            level: "Cơ bản",
            estimatedMinutes: 120,
            thumbnail: "assets/images/non.png",
            description: "",
            published: true,
            units: [
                { id: "unit_1", title: "Chương 1: Khái Niệm & Phép Biến Đổi", description: "Nắm vững kiến thức cơ bản" }
            ]
        };

        if (courseId) {
            const detail = await fetchCourseDetailAndLessons(courseId);
            if (detail) course = detail;
        }

        modalManager.open({
            title: courseId ? `Sửa Khóa Học: ${course.title}` : "Tạo Khóa Học Mới",
            width: "700px",
            body: `
                <form id="frmCourseModal" style="display:flex; flex-direction:column; gap:14px;">
                    <div>
                        <label style="font-weight:700; font-size:0.85rem;">Tên khóa học (*)</label>
                        <input type="text" id="courseTitleInput" class="admin-input" value="${escapeHtml(course.title)}" style="width:100%;" required>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px;">
                        <div>
                            <label style="font-weight:700; font-size:0.85rem;">Khối Lớp</label>
                            <select id="courseGradeInput" class="admin-select" style="width:100%;">
                                <option value="6" ${course.grade == 6 ? 'selected' : ''}>Lớp 6</option>
                                <option value="7" ${course.grade == 7 ? 'selected' : ''}>Lớp 7</option>
                                <option value="8" ${course.grade == 8 ? 'selected' : ''}>Lớp 8</option>
                                <option value="9" ${course.grade == 9 ? 'selected' : ''}>Lớp 9</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-weight:700; font-size:0.85rem;">Chủ Đề</label>
                            <input type="text" id="courseTopicInput" class="admin-input" value="${escapeHtml(course.topicId || 'Đại số')}" style="width:100%;">
                        </div>
                        <div>
                            <label style="font-weight:700; font-size:0.85rem;">Thời lượng (phút)</label>
                            <input type="number" id="courseEstInput" class="admin-input" value="${course.estimatedMinutes || 60}" style="width:100%;">
                        </div>
                    </div>

                    <div>
                        <label style="font-weight:700; font-size:0.85rem;">Mô tả chi tiết</label>
                        <textarea id="courseDescInput" class="admin-input" rows="3" style="width:100%;">${escapeHtml(course.description || '')}</textarea>
                    </div>

                    <div>
                        <label style="font-weight:700; font-size:0.85rem;">Chương / Unit Lộ Trình (RAW JSON Format)</label>
                        <textarea id="courseUnitsJson" class="admin-input" rows="3" style="width:100%; font-family:monospace; font-size:0.8rem;">${escapeHtml(JSON.stringify(course.units || [], null, 2))}</textarea>
                        <small style="color:var(--text-muted);">Ví dụ: [{"id":"unit_1", "title":"Chương 1...", "description":"..."}]</small>
                    </div>

                    <div style="display:flex; align-items:center; gap:10px; font-weight:700;">
                        <input type="checkbox" id="coursePublishedChk" ${course.published !== false ? 'checked' : ''}>
                        <label for="coursePublishedChk" style="cursor:pointer;">Công khai khóa học (Published)</label>
                    </div>
                </form>
            `,
            footer: `
                <button class="btn-secondary" onclick="modalManager.close()">Hủy</button>
                <button class="btn-primary" id="btnSaveCourse">Lưu Khóa Học</button>
            `
        });

        document.getElementById("btnSaveCourse").onclick = async () => {
            const title = document.getElementById("courseTitleInput").value.trim();
            if (!title) return toast.warning("Vui lòng nhập tên khóa học!");

            let parsedUnits = [];
            try {
                const raw = document.getElementById("courseUnitsJson").value.trim();
                parsedUnits = raw ? JSON.parse(raw) : [];
            } catch (e) {
                return toast.error("Định dạng JSON Chương/Unit không hợp lệ!");
            }

            const payload = {
                id: courseId || undefined,
                title,
                grade: Number(document.getElementById("courseGradeInput").value),
                topicId: document.getElementById("courseTopicInput").value.trim(),
                estimatedMinutes: Number(document.getElementById("courseEstInput").value) || 60,
                description: document.getElementById("courseDescInput").value.trim(),
                units: parsedUnits,
                published: document.getElementById("coursePublishedChk").checked
            };

            try {
                await saveCourse(payload);
                await this.logAction(courseId ? "EDIT_COURSE" : "CREATE_COURSE", courseId || title, null, payload);
                toast.success("Đã lưu thông tin khóa học thành công!");
                modalManager.close();
                controllers.courses.load();
            } catch (err) {
                toast.error("Lỗi khi lưu khóa học: " + err.message);
            }
        };
    },

    async deleteCourse(courseId) {
        modalManager.confirm({
            title: "Xóa Khóa Học",
            message: "Bạn có chắc chắn muốn xóa khóa học này cùng toàn bộ các bài học trong lộ trình không?",
            onConfirm: async () => {
                try {
                    await deleteCourse(courseId);
                    await this.logAction("DELETE_COURSE", courseId);
                    toast.success("Đã xóa khóa học!");
                    controllers.courses.load();
                } catch (err) {
                    toast.error("Lỗi khi xóa: " + err.message);
                }
            }
        });
    },

    async openCourseLessonsModal(courseId) {
        const course = await fetchCourseDetailAndLessons(courseId);
        if (!course) return toast.error("Không tìm thấy thông tin khóa học!");

        const lessons = course.lessons || [];

        modalManager.open({
            title: `🗺️ Quản lý Lộ Trình: ${course.title}`,
            width: "850px",
            body: `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
                    <div>
                        <span class="badge badge-info">Lớp ${course.grade}</span>
                        <span class="badge badge-warning">${course.topicId || 'Tổng hợp'}</span>
                        <span class="text-muted ms-2">${lessons.length} bài học</span>
                    </div>
                    <button class="btn-primary" onclick="adminModule.openLessonEditorModal('${courseId}')">+ Thêm Bài Học Mới</button>
                </div>

                <div class="data-table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Thứ tự</th>
                                <th>Bài học</th>
                                <th>Chương (Unit)</th>
                                <th>Nguồn Nội Dung</th>
                                <th>Thời lượng</th>
                                <th>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${lessons.length === 0 ? `
                                <tr><td colspan="6" style="text-align:center; padding: 20px; color: var(--text-muted);">Chưa có bài học nào trong lộ trình. Hãy nhấn nút "+ Thêm Bài Học Mới" ở trên.</td></tr>
                            ` : lessons.map((l, idx) => `
                                <tr>
                                    <td><strong>#${l.order || (idx + 1)}</strong></td>
                                    <td>
                                        <div style="font-weight: 800;">${l.icon || '📘'} ${escapeHtml(l.title)}</div>
                                        <div style="font-size:0.78rem; color: var(--text-muted);">${escapeHtml(l.description || '').substring(0, 50)}</div>
                                    </td>
                                    <td><span class="badge badge-secondary">${escapeHtml(l.unitId || 'unit_1')}</span></td>
                                    <td>
                                        ${l.knowledgeId ? `
                                            <span class="badge badge-success" title="ID: ${l.knowledgeId}">📚 Kho kiến thức (${escapeHtml(l.knowledgeId)})</span>
                                        ` : `
                                            <span class="badge badge-info">✍️ Tự soạn nội dung</span>
                                        `}
                                    </td>
                                    <td>${l.estimatedMinutes || 15} phút</td>
                                    <td>
                                        <div style="display:flex; gap:4px;">
                                            <button class="btn-secondary" style="padding: 3px 8px; font-size:0.78rem;" onclick="adminModule.openLessonEditorModal('${courseId}', '${l.id}')"><i class="fa-solid fa-pen"></i></button>
                                            <button class="btn-danger" style="padding: 3px 8px; font-size:0.78rem; background:#ef4444; color:#fff;" onclick="adminModule.deleteCourseLesson('${courseId}', '${l.id}')"><i class="fa-solid fa-trash"></i></button>
                                        </div>
                                    </td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            `,
            footer: `<button class="btn-secondary" onclick="modalManager.close()">Đóng</button>`
        });
    },

    async openLessonEditorModal(courseId, lessonId = null) {
        const [course, articles] = await Promise.all([
            fetchCourseDetailAndLessons(courseId),
            fetchKnowledgeArticlesList()
        ]);

        let lesson = {
            courseId,
            unitId: course?.units?.[0]?.id || "unit_1",
            title: "",
            description: "",
            icon: "📘",
            order: (course?.lessons?.length || 0) + 1,
            estimatedMinutes: 15,
            required: true,
            contentType: "knowledge",
            knowledgeId: "",
            customContent: ""
        };

        if (lessonId && course?.lessons) {
            const found = course.lessons.find(l => l.id === lessonId);
            if (found) {
                lesson = { ...found };
                lesson.contentType = lesson.knowledgeId ? "knowledge" : "custom";
            }
        }

        const units = course?.units || [{ id: "unit_1", title: "Chương 1" }];

        modalManager.open({
            title: lessonId ? `Sửa Bài Học: ${lesson.title}` : "Thêm Bài Học Mới",
            width: "750px",
            body: `
                <form id="frmLessonModal" style="display:flex; flex-direction:column; gap:14px;">
                    <div style="display:grid; grid-template-columns: 2fr 1fr 1fr; gap:10px;">
                        <div>
                            <label style="font-weight:700; font-size:0.85rem;">Tên bài học (*)</label>
                            <input type="text" id="lesTitleInput" class="admin-input" value="${escapeHtml(lesson.title)}" style="width:100%;" required>
                        </div>
                        <div>
                            <label style="font-weight:700; font-size:0.85rem;">Icon Emoji</label>
                            <input type="text" id="lesIconInput" class="admin-input" value="${escapeHtml(lesson.icon || '📘')}" style="width:100%;">
                        </div>
                        <div>
                            <label style="font-weight:700; font-size:0.85rem;">Thứ tự (Order)</label>
                            <input type="number" id="lesOrderInput" class="admin-input" value="${lesson.order}" style="width:100%;">
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                        <div>
                            <label style="font-weight:700; font-size:0.85rem;">Chương / Unit</label>
                            <select id="lesUnitInput" class="admin-select" style="width:100%;">
                                ${units.map(u => `<option value="${u.id}" ${lesson.unitId === u.id ? 'selected' : ''}>${escapeHtml(u.title)}</option>`).join("")}
                            </select>
                        </div>
                        <div>
                            <label style="font-weight:700; font-size:0.85rem;">Thời lượng ước tính (phút)</label>
                            <input type="number" id="lesEstInput" class="admin-input" value="${lesson.estimatedMinutes}" style="width:100%;">
                        </div>
                    </div>

                    <div class="card p-3" style="background:var(--surface-subtle); border:2px solid var(--text-main); border-radius:8px;">
                        <label style="font-weight:900; font-size:0.9rem; margin-bottom:8px; display:block;">🎯 Chọn Dạng Nội Dung Bài Học:</label>
                        
                        <div style="display:flex; gap:20px; margin-bottom:12px;">
                            <label style="font-weight:700; cursor:pointer;">
                                <input type="radio" name="lesContentType" value="knowledge" ${lesson.contentType === 'knowledge' ? 'checked' : ''} onchange="adminModule.toggleLessonContentFields('knowledge')"> Lấy từ Kho Kiến Thức
                            </label>
                            <label style="font-weight:700; cursor:pointer;">
                                <input type="radio" name="lesContentType" value="custom" ${lesson.contentType === 'custom' ? 'checked' : ''} onchange="adminModule.toggleLessonContentFields('custom')"> Tự soạn nội dung mới
                            </label>
                        </div>

                        <!-- KNOWLEDGE SELECT -->
                        <div id="boxKnowledgeSelect" style="display:${lesson.contentType === 'knowledge' ? 'block' : 'none'};">
                            <label style="font-weight:700; font-size:0.85rem;">Chọn bài viết từ Kho Kiến Thức:</label>
                            <select id="lesKnowledgeIdSelect" class="admin-select" style="width:100%;">
                                <option value="">-- Chọn bài viết --</option>
                                ${articles.map(a => `<option value="${a.id}" ${lesson.knowledgeId === a.id ? 'selected' : ''}>[${a.id}] ${escapeHtml(a.title)}</option>`).join("")}
                            </select>
                        </div>

                        <!-- CUSTOM CONTENT -->
                        <div id="boxCustomContent" style="display:${lesson.contentType === 'custom' ? 'block' : 'none'}; margin-top:8px;">
                            <label style="font-weight:700; font-size:0.85rem;">Nội dung bài học tự soạn (Hỗ trợ HTML & LaTeX $\\frac{a}{b}$):</label>
                            <textarea id="lesCustomContentInput" class="admin-input" rows="6" style="width:100%; font-family:sans-serif;">${escapeHtml(lesson.customContent || '')}</textarea>
                        </div>
                    </div>

                    <div>
                        <label style="font-weight:700; font-size:0.85rem;">Tóm tắt ngắn (Gợi ý cho học sinh)</label>
                        <textarea id="lesDescInput" class="admin-input" rows="2" style="width:100%;">${escapeHtml(lesson.description || '')}</textarea>
                    </div>
                </form>
            `,
            footer: `
                <button class="btn-secondary" onclick="adminModule.openCourseLessonsModal('${courseId}')">Quay lại</button>
                <button class="btn-primary" id="btnSaveLesson">Lưu Bài Học</button>
            `
        });

        document.getElementById("btnSaveLesson").onclick = async () => {
            const title = document.getElementById("lesTitleInput").value.trim();
            if (!title) return toast.warning("Vui lòng nhập tên bài học!");

            const contentType = document.querySelector('input[name="lesContentType"]:checked')?.value || "knowledge";
            const knowledgeId = contentType === "knowledge" ? document.getElementById("lesKnowledgeIdSelect").value : "";
            const customContent = contentType === "custom" ? document.getElementById("lesCustomContentInput").value.trim() : "";

            const payload = {
                id: lessonId || undefined,
                courseId,
                unitId: document.getElementById("lesUnitInput").value,
                title,
                icon: document.getElementById("lesIconInput").value.trim() || "📘",
                order: Number(document.getElementById("lesOrderInput").value) || 1,
                estimatedMinutes: Number(document.getElementById("lesEstInput").value) || 15,
                description: document.getElementById("lesDescInput").value.trim(),
                knowledgeId,
                customContent
            };

            try {
                await saveCourseLesson(payload);
                await this.logAction(lessonId ? "EDIT_COURSE_LESSON" : "CREATE_COURSE_LESSON", lessonId || title, null, payload);
                toast.success("Đã lưu bài học thành công!");
                adminModule.openCourseLessonsModal(courseId);
            } catch (err) {
                toast.error("Lỗi khi lưu bài học: " + err.message);
            }
        };
    },

    toggleLessonContentFields(type) {
        const boxK = document.getElementById("boxKnowledgeSelect");
        const boxC = document.getElementById("boxCustomContent");
        if (boxK) boxK.style.display = type === "knowledge" ? "block" : "none";
        if (boxC) boxC.style.display = type === "custom" ? "block" : "none";
    },

    async deleteCourseLesson(courseId, lessonId) {
        modalManager.confirm({
            title: "Xóa Bài Học",
            message: "Bạn có chắc muốn xóa bài học này khỏi lộ trình không?",
            onConfirm: async () => {
                try {
                    await deleteCourseLesson(lessonId);
                    await this.logAction("DELETE_COURSE_LESSON", lessonId);
                    toast.success("Đã xóa bài học!");
                    adminModule.openCourseLessonsModal(courseId);
                } catch (err) {
                    toast.error("Lỗi khi xóa bài học: " + err.message);
                }
            }
        });
    },

    async logAction(action, targetId, oldValue = null, newValue = null, reason = "") {
        try {
            await addDoc(collection(db, "adminLogs"), {
                admin: this.currentUser?.username || this.currentUser?.displayName || this.currentUser?.email || "Admin",
                adminUid: this.currentUser?.uid || "",
                action,
                target: targetId,
                oldValue,
                newValue,
                reason,
                ip: "Client-IP-Auto",
                userAgent: navigator.userAgent,
                time: serverTimestamp()
            });
        } catch (e) {
            console.warn("Audit log error:", e);
        }
    },

    // --------------------------------------
    // 4.1 RUBRIC TEMPLATES CRUD
    // --------------------------------------
    async openRubricTemplateModal(templateId = null) {
        let templateData = {
            name: "",
            slug: "",
            grade: "8",
            topic: "",
            description: "",
            totalScore: 10,
            knowledgeIds: [],
            criteria: [
                { id: "c1", title: "", description: "", defaultScore: 2, defaultKnowledge: [] }
            ]
        };

        if (templateId) {
            try {
                const docSnap = await getDoc(doc(db, "rubricTemplates", templateId));
                if (docSnap.exists()) {
                    templateData = docSnap.data();
                }
            } catch (err) {
                toast.error("Không thể tải thông tin Rubric Template!");
                return;
            }
        }

        let topicsList = [];
        let knowledgeList = [];
        try {
            const [topSnap, knowSnap] = await Promise.all([
                getDocs(collection(db, "topics")),
                getDocs(collection(db, "knowledgeArticles"))
            ]);
            topicsList = topSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            knowledgeList = knowSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.warn("Lỗi tải danh mục phụ trợ cho Rubric Builder:", e);
        }

        modalManager.open({
            title: templateId ? `Sửa Rubric Template: ${templateData.name}` : "Tạo Rubric Template Chuẩn Schema Mới",
            width: "850px",
            body: `
                <form id="frmRubricTemplate" style="display:flex; flex-direction:column; gap:16px;">
                    <div class="form-section">
                        <div class="form-section-title"><i class="fa-solid fa-circle-info"></i> Thông Tin Chung Rubric</div>
                        <div style="display:grid; grid-template-columns: 2fr 1fr; gap:12px; margin-bottom:10px;">
                            <div>
                                <label style="font-weight:600; font-size:0.85rem;">Tên Rubric Template (*)</label>
                                <input type="text" id="tplName" class="admin-input" value="${escapeHtml(templateData.name)}" placeholder="VD: Chứng minh tam giác bằng nhau" required style="width:100%;">
                            </div>
                            <div>
                                <label style="font-weight:600; font-size:0.85rem;">Slug ID (*)</label>
                                <input type="text" id="tplSlug" class="admin-input" value="${escapeHtml(templateData.slug || '')}" placeholder="VD: triangle_proof" ${templateId ? 'disabled' : ''} style="width:100%;">
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px;">
                            <div>
                                <label style="font-weight:600; font-size:0.85rem;">Khối Lớp</label>
                                <select id="tplGrade" class="admin-select" style="width:100%;">
                                    <option value="6" ${String(templateData.grade) === '6' ? 'selected' : ''}>Lớp 6</option>
                                    <option value="7" ${String(templateData.grade) === '7' ? 'selected' : ''}>Lớp 7</option>
                                    <option value="8" ${String(templateData.grade) === '8' ? 'selected' : ''}>Lớp 8</option>
                                    <option value="9" ${String(templateData.grade) === '9' ? 'selected' : ''}>Lớp 9</option>
                                </select>
                            </div>
                            <div>
                                <label style="font-weight:600; font-size:0.85rem;">Chủ đề (Topic Slug)</label>
                                <select id="tplTopic" class="admin-select" style="width:100%;">
                                    <option value="">-- Chọn Topic --</option>
                                    ${topicsList.map(t => `<option value="${t.slug}" ${templateData.topic === t.slug ? 'selected' : ''}>${t.name}</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label style="font-weight:600; font-size:0.85rem;">Tổng điểm</label>
                                <input type="number" id="tplTotalScore" class="admin-input" value="${templateData.totalScore || 10}" style="width:100%;">
                            </div>
                        </div>

                        <div style="margin-top:10px;">
                            <label style="font-weight:600; font-size:0.85rem;">Mô tả tổng quan</label>
                            <textarea id="tplDescription" class="admin-input" rows="2" style="width:100%;">${escapeHtml(templateData.description || '')}</textarea>
                        </div>
                    </div>

                    <div class="form-section">
                        <div class="form-section-title"><i class="fa-solid fa-graduation-cap"></i> Kiến Thức Liên Quan (Knowledge Map)</div>
                        <div class="checkbox-group" id="tplKnowledgeCheckboxes">
                            ${knowledgeList.length === 0 ? '<p style="font-size:0.8rem; color:var(--admin-muted);">Chưa có bài kiến thức nào trong thư viện.</p>' : 
                                knowledgeList.map(k => `
                                    <label class="checkbox-item">
                                        <input type="checkbox" name="tplKnow" value="${k.slug || k.id}" ${(templateData.knowledgeIds || []).includes(k.slug || k.id) ? 'checked' : ''}>
                                        <span>${escapeHtml(k.title)}</span>
                                    </label>
                                `).join('')}
                        </div>
                    </div>

                    <div class="form-section" style="border-bottom:none;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <div class="form-section-title" style="margin:0;"><i class="fa-solid fa-list-check"></i> Danh Sách Tiêu Chí (Criteria)</div>
                            <button type="button" class="btn-secondary" id="btnAddCriterionRow" style="padding:6px 12px; font-size:0.8rem;">
                                <i class="fa-solid fa-plus"></i> Thêm Tiêu Chí
                            </button>
                        </div>

                        <div id="criteriaListContainer" style="display:flex; flex-direction:column; gap:12px; max-height:300px; overflow-y:auto; padding-right:4px;">
                        </div>
                    </div>
                </form>
            `,
            footer: `
                <button class="btn-secondary" onclick="modalManager.close()">Hủy</button>
                <button class="btn-primary" id="btnSaveRubricTemplate">Lưu Template</button>
            `
        });

        this.renderCriteriaRows(templateData.criteria || []);

        const formEl = document.getElementById("frmRubricTemplate");
        if (formEl) {
            formEl.addEventListener("click", (e) => {
                if (e.target.closest("#btnAddCriterionRow")) {
                    e.preventDefault();
                    e.stopPropagation();

                    const currentCriteria = this.collectCriteriaFromUI();
                    currentCriteria.push({
                        id: `c${currentCriteria.length + 1}`,
                        title: "",
                        description: "",
                        defaultScore: 1,
                        defaultKnowledge: []
                    });
                    
                    this.renderCriteriaRows(currentCriteria);
                }
            });
        }

        document.getElementById("btnSaveRubricTemplate").onclick = async () => {
            await this.saveRubricTemplate(templateId);
        };
    },

    renderCriteriaRows(criteria) {
        const container = document.getElementById("criteriaListContainer");
        if (!container) return;

        if (!criteria || criteria.length === 0) {
            criteria = [{ id: "c1", title: "", description: "", defaultScore: 1, defaultKnowledge: [] }];
        }

        container.innerHTML = criteria.map((c, idx) => `
            <div class="criterion-card" data-idx="${idx}">
                <div class="criterion-card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-weight:700; color:var(--admin-primary); font-size:0.85rem;">Tiêu chí #${idx + 1}</span>
                    <button type="button" class="btn-secondary btn-delete-crit" style="color:var(--admin-danger); padding:2px 8px; font-size:0.75rem;">
                        <i class="fa-solid fa-trash"></i> Xóa
                    </button>
                </div>
                <div style="display:grid; grid-template-columns: 3fr 1fr; gap:10px; margin-bottom:8px;">
                    <input type="text" class="admin-input crit-title" value="${escapeHtml(c.title)}" placeholder="Tên tiêu chí (VD: Xét tam giác ABC và DEF)" required style="width:100%;">
                    <div style="display:flex; align-items:center; gap:4px;">
                        <input type="number" class="admin-input crit-score" value="${c.defaultScore ?? c.score ?? 1}" step="0.25" placeholder="Điểm" style="width:100%;">
                        <span style="font-size:0.8rem; font-weight:600;">đ</span>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                    <input type="text" class="admin-input crit-desc" value="${escapeHtml(c.description || '')}" placeholder="Mô tả chi tiết bước làm / yêu cầu" style="font-size:0.8rem; width:100%;">
                    <input type="text" class="admin-input crit-knowledge" value="${(c.defaultKnowledge || c.knowledge || []).join(',')}" placeholder="Mã kiến thức (cách nhau bởi dấu phẩy)" style="font-size:0.8rem; width:100%;">
                </div>
            </div>
        `).join("");

        container.querySelectorAll(".btn-delete-crit").forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                const card = e.target.closest(".criterion-card");
                if (card) {
                    card.remove();
                    const updatedCriteria = this.collectCriteriaFromUI();
                    this.renderCriteriaRows(updatedCriteria);
                }
            };
        });
    },

    collectCriteriaFromUI() {
        const cards = document.querySelectorAll(".criterion-card");
        const criteria = [];

        cards.forEach((card, idx) => {
            const title = card.querySelector(".crit-title")?.value.trim() || "";
            const score = parseFloat(card.querySelector(".crit-score")?.value) || 0;
            const description = card.querySelector(".crit-desc")?.value.trim() || "";
            const knowledgeStr = card.querySelector(".crit-knowledge")?.value.trim() || "";

            criteria.push({
                id: `c${idx + 1}`,
                title: title,
                description: description,
                defaultScore: score,
                defaultKnowledge: knowledgeStr ? knowledgeStr.split(",").map(k => k.trim()).filter(Boolean) : []
            });
        });

        return criteria;
    },

    async saveRubricTemplate(existingId = null) {
        const name = document.getElementById("tplName").value.trim();
        let slug = document.getElementById("tplSlug").value.trim();
        const grade = document.getElementById("tplGrade").value;
        const topic = document.getElementById("tplTopic").value;
        const totalScore = parseFloat(document.getElementById("tplTotalScore").value) || 10;
        const description = document.getElementById("tplDescription").value.trim();

        const knowledgeIds = Array.from(document.querySelectorAll("input[name='tplKnow']:checked")).map(cb => cb.value);
        const criteria = this.collectCriteriaFromUI();

        if (!name) return toast.warning("Vui lòng nhập Tên Rubric Template!");
        if (!slug) slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        if (criteria.length === 0) return toast.warning("Cần có ít nhất 1 tiêu chí trong Rubric!");

        const templatePayload = {
            name,
            slug,
            grade,
            topic,
            totalScore,
            description,
            knowledgeIds,
            criteria,
            updatedAt: serverTimestamp()
        };

        try {
            const docId = existingId || slug;
            if (!existingId) templatePayload.createdAt = serverTimestamp();

            await setDoc(doc(db, "rubricTemplates", docId), templatePayload, { merge: true });
            await this.logAction(existingId ? "UPDATE_RUBRIC_TEMPLATE" : "CREATE_RUBRIC_TEMPLATE", docId, null, templatePayload);

            toast.success("Lưu Rubric Template thành công!");
            modalManager.close();
            controllers.rubrics.load();
        } catch (err) {
            console.error("Lưu Rubric Template thất bại:", err);
            toast.error("Lỗi khi lưu Rubric Template: " + err.message);
        }
    },

    // --------------------------------------
    // 4.2 PROBLEM CREATION & EDIT REDIRECTION
    // --------------------------------------
    async openProblemEditorModal(problemId = null) {
        if (problemId) {
            window.location.href = `problem-create.html?id=${problemId}`;
        } else {
            window.location.href = `problem-create.html`;
        }
    },

    // --------------------------------------
    // 4.3 OTHER ENTITY MODALS
    // --------------------------------------
    async editKnowledgeModal(articleId = null) {
        let kData = {
            title: "",
            slug: "",
            summary: "",
            folderId: "",
            searchable: true,
            aiEnabled: true,
            featured: false,
            hidden: false,
            blocks: []
        };

        if (articleId) {
            const snap = await getDoc(doc(db, "knowledgeArticles", articleId));
            if (snap.exists()) kData = snap.data();
        }

        modalManager.open({
            title: articleId ? `Sửa Bài Học: ${kData.title}` : "Thêm Bài Học Mới",
            width: "700px",
            body: `
                <form id="frmKnowledgeModal" style="display:flex; flex-direction:column; gap:12px;">
                    <div>
                        <label style="font-weight:600; font-size:0.85rem;">Tiêu đề bài học (*)</label>
                        <input type="text" id="kTitle" class="admin-input" value="${escapeHtml(kData.title)}" style="width:100%;" required>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                        <div>
                            <label style="font-weight:600; font-size:0.85rem;">Slug</label>
                            <input type="text" id="kSlug" class="admin-input" value="${escapeHtml(kData.slug || '')}" style="width:100%;">
                        </div>
                        <div>
                            <label style="font-weight:600; font-size:0.85rem;">Folder ID</label>
                            <input type="text" id="kFolderId" class="admin-input" value="${escapeHtml(kData.folderId || '')}" style="width:100%;">
                        </div>
                    </div>
                    <div>
                        <label style="font-weight:600; font-size:0.85rem;">Tóm tắt (Summary)</label>
                        <textarea id="kSummary" class="admin-input" rows="2" style="width:100%;">${escapeHtml(kData.summary || '')}</textarea>
                    </div>
                    <div>
                        <label style="font-weight:600; font-size:0.85rem;">Nội dung Blocks (RAW JSON)</label>
                        <textarea id="kBlocksJson" class="admin-input" rows="6" style="width:100%; font-family:monospace; font-size:0.8rem;">${escapeHtml(JSON.stringify(kData.blocks || [], null, 2))}</textarea>
                    </div>
                </form>
            `,
            footer: `
                <button class="btn-secondary" onclick="modalManager.close()">Hủy</button>
                <button class="btn-primary" id="btnSaveKnowledge">Lưu Bài Học</button>
            `
        });

        document.getElementById("btnSaveKnowledge").onclick = async () => {
            const title = document.getElementById("kTitle").value.trim();
            let slug = document.getElementById("kSlug").value.trim();
            const folderId = document.getElementById("kFolderId").value.trim();
            const summary = document.getElementById("kSummary").value.trim();
            const rawBlocks = document.getElementById("kBlocksJson").value.trim();

            if (!title) return toast.warning("Vui lòng nhập tiêu đề bài học!");
            if (!slug) slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^----+|----+$/g, '');

            let parsedBlocks = [];
            try {
                parsedBlocks = rawBlocks ? JSON.parse(rawBlocks) : [];
            } catch (e) {
                return toast.error("Định dạng Blocks JSON không hợp lệ!");
            }

            const payload = {
                title,
                slug,
                folderId,
                summary,
                blocks: parsedBlocks,
                hidden: false,
                searchable: true,
                aiEnabled: true,
                updatedAt: serverTimestamp()
            };

            try {
                const ref = articleId ? doc(db, "knowledgeArticles", articleId) : doc(collection(db, "knowledgeArticles"));
                if (!articleId) payload.createdAt = serverTimestamp();

                await setDoc(ref, payload, { merge: true });
                await this.logAction(articleId ? "EDIT_KNOWLEDGE_ARTICLE" : "CREATE_KNOWLEDGE_ARTICLE", ref.id, null, payload);
                toast.success("Đã lưu bài học thành công!");
                modalManager.close();
                controllers.knowledge.load();
            } catch (err) {
                toast.error("Lỗi khi lưu bài học: " + err.message);
            }
        };
    },

    async editTopicModal(topicId = null) {
        let tData = { name: "", slug: "", icon: "📐", color: "#3b82f6", order: 1 };
        if (topicId) {
            const snap = await getDoc(doc(db, "topics", topicId));
            if (snap.exists()) tData = snap.data();
        }

        modalManager.open({
            title: topicId ? `Sửa Topic: ${tData.name}` : "Thêm Topic Mới",
            width: "500px",
            body: `
                <form style="display:flex; flex-direction:column; gap:12px;">
                    <div>
                        <label style="font-weight:600; font-size:0.85rem;">Tên Topic (*)</label>
                        <input type="text" id="topName" class="admin-input" value="${escapeHtml(tData.name)}" style="width:100%;" required>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                        <div>
                            <label style="font-weight:600; font-size:0.85rem;">Slug</label>
                            <input type="text" id="topSlug" class="admin-input" value="${escapeHtml(tData.slug || '')}" style="width:100%;">
                        </div>
                        <div>
                            <label style="font-weight:600; font-size:0.85rem;">Thứ tự (Order)</label>
                            <input type="number" id="topOrder" class="admin-input" value="${tData.order || 1}" style="width:100%;">
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                        <div>
                            <label style="font-weight:600; font-size:0.85rem;">Icon Emoji</label>
                            <input type="text" id="topIcon" class="admin-input" value="${escapeHtml(tData.icon || '📐')}" style="width:100%;">
                        </div>
                        <div>
                            <label style="font-weight:600; font-size:0.85rem;">Màu nhận diện</label>
                            <input type="color" id="topColor" value="${tData.color || '#3b82f6'}" style="width:100%; height:38px; border:none; cursor:pointer;">
                        </div>
                    </div>
                </form>
            `,
            footer: `
                <button class="btn-secondary" onclick="modalManager.close()">Hủy</button>
                <button class="btn-primary" id="btnSaveTopic">Lưu Topic</button>
            `
        });

        document.getElementById("btnSaveTopic").onclick = async () => {
            const name = document.getElementById("topName").value.trim();
            let slug = document.getElementById("topSlug").value.trim();
            const order = parseInt(document.getElementById("topOrder").value) || 1;
            const icon = document.getElementById("topIcon").value.trim();
            const color = document.getElementById("topColor").value;

            if (!name) return toast.warning("Vui lòng nhập tên Topic!");
            if (!slug) slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

            const payload = { name, slug, order, icon, color, updatedAt: serverTimestamp() };
            try {
                const ref = topicId ? doc(db, "topics", topicId) : doc(db, "topics", slug);
                await setDoc(ref, payload, { merge: true });
                await this.logAction(topicId ? "EDIT_TOPIC" : "CREATE_TOPIC", slug, null, payload);
                toast.success("Đã lưu Topic!");
                modalManager.close();
                controllers.topics.load();
            } catch (err) {
                toast.error("Lỗi lưu Topic: " + err.message);
            }
        };
    },

    async viewSubmissionFull(submissionId) {
        try {
            const snap = await getDoc(doc(db, "submissions", submissionId));
            if (!snap.exists()) return toast.error("Không tìm thấy bài nộp!");
            const data = snap.data();

            modalManager.open({
                title: `Chi tiết Bài nộp Raw: ${submissionId}`,
                width: "750px",
                body: `<pre style="background:#0f172a; color:#f8fafc; padding:16px; border-radius:8px; font-size:0.8rem; max-height:450px; overflow:auto;">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`,
                footer: `<button class="btn-primary" onclick="modalManager.close()">Đóng</button>`
            });
        } catch (err) {
            toast.error("Lỗi đọc dữ liệu bài nộp!");
        }
    },

    async manualGradeModal(submissionId) {
        let currentScore = 0;
        let note = "";
        try {
            const snap = await getDoc(doc(db, "submissions", submissionId));
            if (snap.exists()) {
                currentScore = snap.data().manualScore ?? snap.data().score ?? 0;
                note = snap.data().manualNote || "";
            }
        } catch (e) {}

        modalManager.open({
            title: `Chấm Điểm Thủ Công (Override AI)`,
            width: "500px",
            body: `
                <form style="display:flex; flex-direction:column; gap:12px;">
                    <div>
                        <label style="font-weight:600; font-size:0.85rem;">Điểm số (Thang điểm 10)</label>
                        <input type="number" id="mGradeScore" class="admin-input" step="0.25" min="0" max="10" value="${currentScore}" style="width:100%;">
                    </div>
                    <div>
                        <label style="font-weight:600; font-size:0.85rem;">Ghi chú chấm tay của Giáo viên/Admin</label>
                        <textarea id="mGradeNote" class="admin-input" rows="3" style="width:100%;">${escapeHtml(note)}</textarea>
                    </div>
                </form>
            `,
            footer: `
                <button class="btn-secondary" onclick="modalManager.close()">Hủy</button>
                <button class="btn-primary" id="btnSaveManualGrade">Cập Nhật Điểm</button>
            `
        });

        document.getElementById("btnSaveManualGrade").onclick = async () => {
            const score = parseFloat(document.getElementById("mGradeScore").value) || 0;
            const manualNote = document.getElementById("mGradeNote").value.trim();

            try {
                await updateDoc(doc(db, "submissions", submissionId), {
                    manualScore: score,
                    manualNote: manualNote,
                    score: score,
                    isManuallyGraded: true,
                    gradedBy: this.currentUser.email,
                    gradedAt: serverTimestamp()
                });

                await this.logAction("MANUAL_GRADE_SUBMISSION", submissionId, null, { score, manualNote });
                toast.success("Đã cập nhật điểm thủ công!");
                modalManager.close();
                controllers.submissions.load();
            } catch (err) {
                toast.error("Lỗi cập nhật điểm!");
            }
        };
    },

    async regradeSubmission(submissionId) {
        modalManager.confirm({
            title: "Yêu cầu AI Chấm Lại",
            message: `Gửi lại bài nộp [${submissionId}] lên Cloudflare Worker để AI chấm lại từ đầu?`,
            onConfirm: async () => {
                try {
                    await updateDoc(doc(db, "submissions", submissionId), {
                        aiStatus: "pending",
                        regradedAt: serverTimestamp()
                    });
                    toast.success("Đã đưa bài nộp vào hàng chờ AI chấm lại!");
                    controllers.submissions.load();
                } catch (err) {
                    toast.error("Lỗi khi gửi yêu cầu chấm lại!");
                }
            }
        });
    },

    async toggleCommentHide(commentPath, isHide) {
        try {
            await updateDoc(doc(db, commentPath), { hidden: isHide });
            toast.success(`Đã ${isHide ? 'ẩn' : 'hiện'} bình luận!`);
            controllers.comments.load();
        } catch (err) {
            toast.error("Lỗi thay đổi trạng thái bình luận!");
        }
    },

    async toggleCommentPin(commentPath, isPin) {
        try {
            await updateDoc(doc(db, commentPath), { isPinned: isPin });
            toast.success(`Đã ${isPin ? 'ghim' : 'bỏ ghim'} bình luận!`);
            controllers.comments.load();
        } catch (err) {
            toast.error("Lỗi thay đổi trạng thái ghim!");
        }
    },

    async softDeleteComment(commentPath) {
        modalManager.confirm({
            title: "Xác nhận xóa bình luận",
            message: "Bạn có chắc chắn muốn xóa bình luận này không?",
            onConfirm: async () => {
                try {
                    await updateDoc(doc(db, commentPath), { 
                        deleted: true, 
                        deletedAt: serverTimestamp(),
                        deletedBy: this.currentUser?.email || "Admin"
                    });
                    toast.success("Đã xóa bình luận!");
                    controllers.comments.load();
                } catch (err) {
                    toast.error("Lỗi khi xóa bình luận!");
                }
            }
        });
    },

    async banUserModal(userId) {
        const snap = await getDoc(doc(db, "users", userId));
        if (!snap.exists()) return;
        const u = snap.data();
        const currentBanned = !!u.isBanned;

        modalManager.confirm({
            title: currentBanned ? "Mở Khóa Tài Khoản" : "Cảnh Báo: Khóa Tài Khoản",
            message: `Bạn có chắc muốn ${currentBanned ? 'Unban' : 'Ban'} tài khoản [${u.username || u.displayName || u.email}]?`,
            onConfirm: async () => {
                await updateDoc(doc(db, "users", userId), {
                    isBanned: !currentBanned,
                    bannedAt: !currentBanned ? serverTimestamp() : null,
                    bannedBy: !currentBanned ? this.currentUser.email : null
                });
                await this.logAction(currentBanned ? "UNBAN_USER" : "BAN_USER", userId);
                toast.success(`Đã ${currentBanned ? 'mở khóa' : 'khóa'} tài khoản!`);
                controllers.users.load();
            }
        });
    },

    async editUserModal(userId) {
        const snap = await getDoc(doc(db, "users", userId));
        if (!snap.exists()) return toast.error("Không tìm thấy thông tin user!");
        const u = snap.data();

        modalManager.open({
            title: `Sửa Thông Tin User: ${u.username || u.displayName || u.email}`,
            width: "500px",
            body: `
                <form style="display:flex; flex-direction:column; gap:12px;">
                    <div>
                        <label style="font-weight:600; font-size:0.85rem;">Role / Quyền hạn</label>
                        <select id="uRole" class="admin-select" style="width:100%;">
                            <option value="student" ${u.role === 'student' ? 'selected' : ''}>Học sinh (Student)</option>
                            <option value="teacher" ${u.role === 'teacher' ? 'selected' : ''}>Giáo viên (Teacher)</option>
                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Quản trị viên (Admin)</option>
                        </select>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                        <div>
                            <label style="font-weight:600; font-size:0.85rem;">Điểm XP</label>
                            <input type="number" id="uXp" class="admin-input" value="${u.xp || 0}" style="width:100%;">
                        </div>
                        <div>
                            <label style="font-weight:600; font-size:0.85rem;">Số Coins</label>
                            <input type="number" id="uCoins" class="admin-input" value="${u.coins || 0}" style="width:100%;">
                        </div>
                    </div>
                </form>
            `,
            footer: `
                <button class="btn-secondary" onclick="modalManager.close()">Hủy</button>
                <button class="btn-primary" id="btnSaveUser">Lưu Thông Tin</button>
            `
        });

        document.getElementById("btnSaveUser").onclick = async () => {
            const role = document.getElementById("uRole").value;
            const xp = parseInt(document.getElementById("uXp").value) || 0;
            const coins = parseInt(document.getElementById("uCoins").value) || 0;

            try {
                await updateDoc(doc(db, "users", userId), { role, xp, coins, updatedAt: serverTimestamp() });
                await this.logAction("EDIT_USER", userId, null, { role, xp, coins });
                toast.success("Đã cập nhật tài khoản!");
                modalManager.close();
                controllers.users.load();
            } catch (err) {
                toast.error("Lỗi cập nhật người dùng!");
            }
        };
    },

    // --------------------------------------
    // 4.4 SOFT DELETE & RECYCLE BIN & SETTINGS
    // --------------------------------------
    async softDelete(colName, id) {
        modalManager.confirm({
            title: "Xác nhận xóa mềm",
            message: `Bạn có chắc muốn chuyển item [${id}] trong ${colName} vào Thùng Rác?`,
            onConfirm: async () => {
                const ref = doc(db, colName, id);
                await updateDoc(ref, {
                    deleted: true,
                    deletedAt: serverTimestamp(),
                    deletedBy: this.currentUser?.email || "Admin"
                });

                await this.logAction(`SOFT_DELETE_${colName.toUpperCase()}`, id);
                toast.success("Đã chuyển vào Thùng rác!");
                
                const controllerKey = colName === 'knowledgeArticles' ? 'knowledge' : colName;
                controllers[controllerKey]?.load();
            }
        });
    },

    async restoreItem(colName, id) {
        await updateDoc(doc(db, colName, id), {
            deleted: false,
            restoredAt: serverTimestamp(),
            restoredBy: this.currentUser?.email || "Admin"
        });
        await this.logAction(`RESTORE_${colName.toUpperCase()}`, id);
        toast.success("Khôi phục thành công!");
        controllers.recyclebin.load();
    },

    async hardDelete(colName, id) {
        modalManager.confirm({
            title: "CẢNH BÁO: XÓA VĨNH VIỄN",
            message: `Hành động này KHÔNG THỂ KHÔI PHỤC. Xóa vĩnh viễn item [${id}]?`,
            onConfirm: async () => {
                await deleteDoc(doc(db, colName, id));
                await this.logAction(`HARD_DELETE_${colName.toUpperCase()}`, id);
                toast.success("Đã xóa vĩnh viễn!");
                controllers.recyclebin.load();
            }
        });
    },

    async saveSettings() {
        try {
            const updatedSettings = {
                siteName: document.getElementById("setSiteName")?.value || "",
                maintenance: document.getElementById("setMaintenance")?.checked || false,
                cloudinaryKey: document.getElementById("setCloudinaryKey")?.value || "",
                geminiModel: document.getElementById("setGeminiModel")?.value || "",
                workerUrl: document.getElementById("setWorkerUrl")?.value || "",
                promptText: document.getElementById("setPromptText")?.value || "",
                enableRegister: document.getElementById("setEnableRegister")?.checked || false,
                updatedAt: serverTimestamp(),
                updatedBy: this.currentUser?.email || "Admin"
            };

            await setDoc(doc(db, "settings", "global"), updatedSettings, { merge: true });
            await this.logAction("UPDATE_GLOBAL_SETTINGS", "settings/global", null, updatedSettings);
            toast.success("Đã lưu cấu hình hệ thống!");
        } catch (err) {
            toast.error("Lỗi lưu cấu hình hệ thống!");
        }
    },

    bindBatchCheckboxes() {
        const selectAll = document.getElementById("chkSelectAll");
        if (!selectAll) return;

        selectAll.onclick = (e) => {
            document.querySelectorAll(".chk-item").forEach(chk => {
                chk.checked = e.target.checked;
                if (e.target.checked) stateStore.selectedItems.add(chk.value);
                else stateStore.selectedItems.clear();
            });
        };

        document.querySelectorAll(".chk-item").forEach(chk => {
            chk.onclick = () => {
                if (chk.checked) stateStore.selectedItems.add(chk.value);
                else stateStore.selectedItems.delete(chk.value);
            };
        });
    }
};
// Đọc dữ liệu cài đặt khi load tab Settings
async function loadSystemSettings() {
    try {
        const snap = await getDoc(doc(db, "settings", "system"));
        if (snap.exists()) {
            const data = snap.data();
            const input = document.getElementById("setMinScoreCreateProblem");
            if (input) input.value = data.minScoreCreateProblem ?? 200;
        }
    } catch (e) {
        console.error("Lỗi nạp settings system:", e);
    }
}

// Hàm lưu cài đặt
document.getElementById("frmSystemSettings")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const val = Number(document.getElementById("setMinScoreCreateProblem").value) || 0;
    
    try {
        await setDoc(doc(db, "settings", "system"), {
            minScoreCreateProblem: val,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.uid || "admin"
        }, { merge: true });
        
        toast.success("Đã cập nhật điểm tối thiểu đăng bài!");
    } catch (err) {
        toast.error("Lỗi khi lưu cài đặt: " + err.message);
    }
});
// ==========================================
// 5. HELPERS & GLOBAL EXPOSURE
// ==========================================
function escapeHtml(str = "") {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDate(timestamp) {
    if (!timestamp) return "--/--/----";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString("vi-VN");
}

window.adminModule = adminModule;
window.AdminRouter = AdminRouter;
window.modalManager = modalManager;
window.controllers = controllers;

document.addEventListener("DOMContentLoaded", () => adminModule.init());