/**
 * MIKE MATH - VISUAL COURSE & ROADMAP EDITOR CONTROLLER
 * File: js/course-create.js
 */

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { 
    collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, 
    query, where, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
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
// STATE MANAGEMENT
// ==========================================
const state = {
    currentUser: null,
    coursesList: [],
    knowledgeArticles: [],
    problemsList: [],
    editingCourseId: null,
    editingCourse: createBlankCourse(),
    activeLessonIndex: -1
};

function createBlankCourse() {
    return {
        title: "",
        grade: 8,
        topicId: "Đại số",
        level: "Cơ bản",
        estimatedMinutes: 120,
        thumbnail: "assets/images/non.png",
        description: "",
        published: true,
        units: [
            { id: "unit_1", title: "Chương 1: Khái Niệm & Phép Biến Đổi", description: "Các kiến thức nền tảng" },
            { id: "unit_2", title: "Chương 2: Phép Tính & Phương Trình", description: "Vận dụng giải bài tập" }
        ],
        lessons: [
            {
                id: `temp_${Date.now()}_1`,
                title: "1. Khái niệm & Điều kiện xác định",
                icon: "📘",
                unitId: "unit_1",
                order: 1,
                estimatedMinutes: 15,
                required: true,
                contentType: "knowledge",
                knowledgeId: "",
                customContent: "",
                problemId: "",
                description: "Nắm vững định nghĩa và điều kiện mẫu khác 0"
            }
        ]
    };
}

// ==========================================
// INITIALIZATION & EVENT BINDING
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    initAuthListener();
    bindFormEvents();
    bindModalEvents();
    await loadInitialData();
});

function initAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            toast.error("Vui lòng đăng nhập tài khoản Quản trị viên!");
            setTimeout(() => location.href = "login.html", 1500);
            return;
        }

        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (!userSnap.exists() || userSnap.data().role !== "admin") {
            toast.error("Truy cập bị từ chối: Cần có quyền Admin!");
            setTimeout(() => location.href = "index.html", 1500);
            return;
        }

        state.currentUser = user;
    });
}

async function loadInitialData() {
    try {
        const [courses, articles, problemsSnap] = await Promise.all([
            fetchAllCoursesAdmin(),
            fetchKnowledgeArticlesList(),
            getDocs(query(collection(db, "problems"), orderBy("createdAt", "desc")))
        ]);

        state.coursesList = courses || [];
        state.knowledgeArticles = articles || [];
        state.problemsList = problemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        renderSidebarCourses();
        renderCourseForm();
        renderLivePreview();
        populateKnowledgeDropdown();
        populateProblemDropdown();

    } catch (err) {
        console.error("Lỗi khởi tạo dữ liệu Course Creator:", err);
        toast.error("Lỗi khi tải dữ liệu khởi tạo!");
    }
}

// ==========================================
// SIDEBAR & LIST RENDERING
// ==========================================
function renderSidebarCourses() {
    const container = document.getElementById("courseTreeContainer");
    if (!container) return;

    if (state.coursesList.length === 0) {
        container.innerHTML = `<p class="text-muted text-center p-3">Chưa có khóa học nào.</p>`;
        return;
    }

    const queryStr = (document.getElementById("searchCourseInput")?.value || "").toLowerCase().trim();
    const filtered = state.coursesList.filter(c => !queryStr || (c.title || "").toLowerCase().includes(queryStr));

    container.innerHTML = filtered.map(c => `
        <div class="sidebar-course-item ${state.editingCourseId === c.id ? 'active' : ''}" 
             data-id="${c.id}"
             style="padding: 10px 12px; border: 2px solid var(--text-main); border-radius: var(--radius-sm); background: ${state.editingCourseId === c.id ? 'var(--primary-light)' : '#ffffff'}; cursor: pointer;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="badge badge-info" style="font-size:0.75rem;">Lớp ${c.grade}</span>
                <span class="badge ${c.published ? 'badge-success' : 'badge-danger'}" style="font-size:0.72rem;">${c.published ? 'Published' : 'Draft'}</span>
            </div>
            <div style="font-weight: 800; margin-top: 4px; font-size: 0.9rem; color: var(--text-main);">${escapeHtml(c.title)}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600;">${c.lessons ? c.lessons.length : 0} bài học • ${c.estimatedMinutes || 60}m</div>
        </div>
    `).join("");

    container.querySelectorAll(".sidebar-course-item").forEach(item => {
        item.onclick = async () => {
            const courseId = item.dataset.id;
            await loadCourseForEdit(courseId);
        };
    });
}

async function loadCourseForEdit(courseId) {
    try {
        toast.info("Đang nạp chi tiết khóa học...");
        const detail = await fetchCourseDetailAndLessons(courseId);
        if (detail) {
            state.editingCourseId = courseId;
            state.editingCourse = {
                ...detail,
                units: detail.units || [{ id: "unit_1", title: "Chương 1: Khái Niệm" }],
                lessons: detail.lessons || []
            };

            renderSidebarCourses();
            renderCourseForm();
            renderLivePreview();
            toast.success("Đã chọn khóa học!");
        }
    } catch (e) {
        toast.error("Lỗi khi tải chi tiết khóa học!");
    }
}

// ==========================================
// FORM RENDERING & BINDING
// ==========================================
function renderCourseForm() {
    const c = state.editingCourse;
    const badge = document.getElementById("editingStatusBadge");
    const deleteBtn = document.getElementById("btnDeleteCurrentCourse");

    if (badge) {
        badge.className = state.editingCourseId ? "badge badge-warning" : "badge badge-success";
        badge.textContent = state.editingCourseId ? `✏️ Đang ở chế độ: SỬA KHÓA HỌC [ID: ${state.editingCourseId}]` : "✨ Chế độ: TẠO MỚI KHÓA HỌC";
    }

    if (deleteBtn) {
        if (state.editingCourseId) deleteBtn.classList.remove("hidden");
        else deleteBtn.classList.add("hidden");
    }

    document.getElementById("courseTitle").value = c.title || "";
    document.getElementById("courseGrade").value = c.grade || 8;
    document.getElementById("courseTopic").value = c.topicId || "Đại số";
    document.getElementById("courseEstTime").value = c.estimatedMinutes || 120;
    document.getElementById("courseThumbnail").value = c.thumbnail || "assets/images/non.png";
    document.getElementById("courseDescription").value = c.description || "";
    document.getElementById("chkCoursePublished").checked = c.published !== false;

    renderUnitsList();
    renderLessonsList();
}

function renderUnitsList() {
    const container = document.getElementById("unitListContainer");
    if (!container) return;

    const units = state.editingCourse.units || [];

    container.innerHTML = units.map((u, idx) => `
        <div class="unit-card-item">
            <div style="flex:1;">
                <input type="text" class="unit-title-input form-control" data-idx="${idx}" value="${escapeHtml(u.title)}" placeholder="Tên chương (VD: Chương 1: Phép biến đổi)" style="font-weight:800; font-size:0.9rem; border:1.5px solid var(--text-main);">
                <input type="text" class="unit-desc-input form-control mt-1" data-idx="${idx}" value="${escapeHtml(u.description || '')}" placeholder="Mô tả chương..." style="font-size:0.8rem;">
            </div>
            <button type="button" class="btn-sm btn-danger btn-delete-unit ms-2" data-idx="${idx}" style="background:#ef4444; color:#fff; border:1.5px solid var(--text-main); font-weight:800;">🗑️</button>
        </div>
    `).join("");

    container.querySelectorAll(".unit-title-input").forEach(input => {
        input.oninput = (e) => {
            const idx = Number(e.target.dataset.idx);
            state.editingCourse.units[idx].title = e.target.value;
            renderLivePreview();
        };
    });

    container.querySelectorAll(".unit-desc-input").forEach(input => {
        input.oninput = (e) => {
            const idx = Number(e.target.dataset.idx);
            state.editingCourse.units[idx].description = e.target.value;
            renderLivePreview();
        };
    });

    container.querySelectorAll(".btn-delete-unit").forEach(btn => {
        btn.onclick = (e) => {
            const idx = Number(e.currentTarget.dataset.idx);
            state.editingCourse.units.splice(idx, 1);
            renderUnitsList();
            renderLivePreview();
        };
    });
}

function renderLessonsList() {
    const container = document.getElementById("lessonListContainer");
    if (!container) return;

    const lessons = state.editingCourse.lessons || [];

    if (lessons.length === 0) {
        container.innerHTML = `<p class="text-muted text-center p-3">Chưa có bài học nào trong lộ trình.</p>`;
        return;
    }

    container.innerHTML = lessons.map((l, idx) => {
        let pillClass = "pill-custom";
        let pillText = "✍️ Nội dung soạn";

        if (l.knowledgeId) {
            pillClass = "pill-knowledge";
            pillText = `📚 Kho kiến thức (${l.knowledgeId})`;
        } else if (l.problemId) {
            pillClass = "pill-problem";
            pillText = `🧩 Bài tập (${l.problemId})`;
        }

        return `
            <div class="lesson-card-item">
                <div class="lesson-item-header">
                    <div>
                        <span style="font-weight:900; color:var(--primary); margin-right:6px;">#${l.order || (idx + 1)}</span>
                        <span style="font-size:1.1rem;">${l.icon || '📘'}</span>
                        <strong style="font-size:0.95rem; margin-left:4px;">${escapeHtml(l.title)}</strong>
                    </div>
                    <span class="source-type-pill ${pillClass}">${pillText}</span>
                </div>
                <div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:10px;">${escapeHtml(l.description || 'Chưa có tóm tắt')} • Ước tính ${l.estimatedMinutes || 15}m</div>
                
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="badge badge-secondary" style="font-size:0.75rem;">Unit: ${escapeHtml(l.unitId || 'unit_1')}</span>
                    <div style="display:flex; gap:6px;">
                        <button type="button" class="btn-sm btn-secondary btn-move-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>⬆️</button>
                        <button type="button" class="btn-sm btn-secondary btn-move-down" data-idx="${idx}" ${idx === lessons.length - 1 ? 'disabled' : ''}>⬇️</button>
                        <button type="button" class="btn-sm btn-primary btn-edit-lesson" data-idx="${idx}">✏️ Nguồn Nội Dung</button>
                        <button type="button" class="btn-sm btn-danger btn-delete-lesson" data-idx="${idx}" style="background:#ef4444; color:#fff; border:1.5px solid var(--text-main);">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    container.querySelectorAll(".btn-edit-lesson").forEach(btn => {
        btn.onclick = (e) => {
            const idx = Number(e.currentTarget.dataset.idx);
            openLessonModal(idx);
        };
    });

    container.querySelectorAll(".btn-delete-lesson").forEach(btn => {
        btn.onclick = (e) => {
            const idx = Number(e.currentTarget.dataset.idx);
            state.editingCourse.lessons.splice(idx, 1);
            renderLessonsList();
            renderLivePreview();
        };
    });

    container.querySelectorAll(".btn-move-up").forEach(btn => {
        btn.onclick = (e) => {
            const idx = Number(e.currentTarget.dataset.idx);
            if (idx > 0) {
                const temp = state.editingCourse.lessons[idx];
                state.editingCourse.lessons[idx] = state.editingCourse.lessons[idx - 1];
                state.editingCourse.lessons[idx - 1] = temp;
                reorderLessons();
                renderLessonsList();
                renderLivePreview();
            }
        };
    });

    container.querySelectorAll(".btn-move-down").forEach(btn => {
        btn.onclick = (e) => {
            const idx = Number(e.currentTarget.dataset.idx);
            if (idx < state.editingCourse.lessons.length - 1) {
                const temp = state.editingCourse.lessons[idx];
                state.editingCourse.lessons[idx] = state.editingCourse.lessons[idx + 1];
                state.editingCourse.lessons[idx + 1] = temp;
                reorderLessons();
                renderLessonsList();
                renderLivePreview();
            }
        };
    });
}

function reorderLessons() {
    (state.editingCourse.lessons || []).forEach((l, i) => {
        l.order = i + 1;
    });
}

function bindFormEvents() {
    document.getElementById("courseTitle")?.addEventListener("input", (e) => {
        state.editingCourse.title = e.target.value;
        renderLivePreview();
    });

    document.getElementById("courseGrade")?.addEventListener("change", (e) => {
        state.editingCourse.grade = Number(e.target.value);
        renderLivePreview();
    });

    document.getElementById("courseTopic")?.addEventListener("input", (e) => {
        state.editingCourse.topicId = e.target.value;
    });

    document.getElementById("courseEstTime")?.addEventListener("input", (e) => {
        state.editingCourse.estimatedMinutes = Number(e.target.value) || 60;
    });

    document.getElementById("courseDescription")?.addEventListener("input", (e) => {
        state.editingCourse.description = e.target.value;
        renderLivePreview();
    });

    document.getElementById("chkCoursePublished")?.addEventListener("change", (e) => {
        state.editingCourse.published = e.target.checked;
    });

    document.getElementById("searchCourseInput")?.addEventListener("input", () => {
        renderSidebarCourses();
    });

    document.getElementById("btnNewCourse")?.addEventListener("click", () => {
        state.editingCourseId = null;
        state.editingCourse = createBlankCourse();
        renderSidebarCourses();
        renderCourseForm();
        renderLivePreview();
        toast.info("Đã reset form tạo khóa học mới!");
    });

    document.getElementById("btnAddUnitBtn")?.addEventListener("click", () => {
        if (!state.editingCourse.units) state.editingCourse.units = [];
        const newUnitId = `unit_${state.editingCourse.units.length + 1}`;
        state.editingCourse.units.push({
            id: newUnitId,
            title: `Chương ${state.editingCourse.units.length + 1}: Chủ đề mới`,
            description: "Mô tả chương..."
        });
        renderUnitsList();
        renderLivePreview();
    });

    document.getElementById("btnAddLessonBtn")?.addEventListener("click", () => {
        if (!state.editingCourse.lessons) state.editingCourse.lessons = [];
        const firstUnitId = state.editingCourse.units?.[0]?.id || "unit_1";
        state.editingCourse.lessons.push({
            id: `temp_${Date.now()}`,
            title: `${state.editingCourse.lessons.length + 1}. Bài học mới`,
            icon: "📘",
            unitId: firstUnitId,
            order: state.editingCourse.lessons.length + 1,
            estimatedMinutes: 15,
            required: true,
            contentType: "knowledge",
            knowledgeId: "",
            customContent: "",
            problemId: "",
            description: ""
        });
        renderLessonsList();
        renderLivePreview();
    });

    document.getElementById("btnSaveCourseGlobal")?.addEventListener("click", saveEntireCourse);
    document.getElementById("btnDeleteCurrentCourse")?.addEventListener("click", deleteCurrentCourseAction);
}

// ==========================================
// LIVE ROADMAP PREVIEW
// ==========================================
function renderLivePreview() {
    const c = state.editingCourse;
    const titleEl = document.getElementById("prevCourseTitle");
    const descEl = document.getElementById("prevCourseDesc");
    const gradeEl = document.getElementById("prevGradeBadge");
    const container = document.getElementById("liveRoadmapPreview");

    if (titleEl) titleEl.textContent = c.title || "Khóa Học Chưa Đặt Tên";
    if (descEl) descEl.textContent = c.description || "Chưa có mô tả khóa học.";
    if (gradeEl) gradeEl.textContent = `Lớp ${c.grade || 8}`;

    if (!container) return;

    const units = c.units || [];
    const lessons = c.lessons || [];

    if (units.length === 0 && lessons.length === 0) {
        container.innerHTML = `<p class="text-muted text-center p-3">Bản đồ học tập sẽ hiển thị tại đây...</p>`;
        return;
    }

    let html = "";
    units.forEach((u) => {
        html += `
            <div style="background:var(--primary); color:#fff; border:2px solid var(--text-main); border-radius:6px; padding:8px 12px; font-weight:800; font-size:0.85rem;">
                📌 ${escapeHtml(u.title)}
            </div>
        `;

        const unitLessons = lessons.filter(l => (l.unitId || "unit_1") === u.id);
        unitLessons.forEach((l) => {
            html += `
                <div style="margin-left: 16px; background:#fff; border:2px solid var(--text-main); border-radius:8px; padding:8px 12px; display:flex; align-items:center; justify-content:space-between; box-shadow:2px 2px 0px var(--text-main);">
                    <div>
                        <span style="font-size:1.1rem; margin-right:6px;">${l.icon || '📘'}</span>
                        <strong style="font-size:0.85rem;">${escapeHtml(l.title)}</strong>
                    </div>
                    <span style="font-size:0.75rem;" class="badge badge-info">${l.estimatedMinutes || 15}m</span>
                </div>
            `;
        });
    });

    container.innerHTML = html;
}

// ==========================================
// LESSON EDITOR MODAL
// ==========================================
function openLessonModal(lessonIndex) {
    state.activeLessonIndex = lessonIndex;
    const lesson = state.editingCourse.lessons[lessonIndex];
    if (!lesson) return;

    const modal = document.getElementById("lessonModalOverlay");
    if (!modal) return;

    document.getElementById("lesTitleInput").value = lesson.title || "";
    document.getElementById("lesIconInput").value = lesson.icon || "📘";
    document.getElementById("lesEstInput").value = lesson.estimatedMinutes || 15;
    document.getElementById("lesRequiredChk").checked = lesson.required !== false;
    document.getElementById("lesDescInput").value = lesson.description || "";

    // Populate Unit Dropdown
    const unitSelect = document.getElementById("lesUnitInput");
    if (unitSelect) {
        const units = state.editingCourse.units || [{ id: "unit_1", title: "Chương 1" }];
        unitSelect.innerHTML = units.map(u => `<option value="${u.id}" ${lesson.unitId === u.id ? 'selected' : ''}>${escapeHtml(u.title)}</option>`).join("");
    }

    // Set content type radio
    const contentType = lesson.problemId ? "problem" : (lesson.knowledgeId ? "knowledge" : (lesson.contentType || "custom"));
    const radio = document.querySelector(`input[name="lesContentType"][value="${contentType}"]`);
    if (radio) radio.checked = true;

    toggleContentBoxes(contentType);

    if (contentType === "knowledge" && document.getElementById("lesKnowledgeIdSelect")) {
        document.getElementById("lesKnowledgeIdSelect").value = lesson.knowledgeId || "";
    }
    if (contentType === "custom" && document.getElementById("lesCustomContentInput")) {
        document.getElementById("lesCustomContentInput").value = lesson.customContent || "";
    }
    if (contentType === "problem" && document.getElementById("lesProblemIdSelect")) {
        document.getElementById("lesProblemIdSelect").value = lesson.problemId || "";
    }

    modal.classList.add("active");
}

function closeLessonModal() {
    const modal = document.getElementById("lessonModalOverlay");
    if (modal) modal.classList.remove("active");
}

function toggleContentBoxes(type) {
    const boxK = document.getElementById("boxKnowledgeSelect");
    const boxC = document.getElementById("boxCustomContent");
    const boxP = document.getElementById("boxProblemSelect");

    if (boxK) boxK.classList.toggle("hidden", type !== "knowledge");
    if (boxC) boxC.classList.toggle("hidden", type !== "custom");
    if (boxP) boxP.classList.toggle("hidden", type !== "problem");
}

function populateKnowledgeDropdown() {
    const select = document.getElementById("lesKnowledgeIdSelect");
    if (!select) return;

    select.innerHTML = `<option value="">-- Chọn bài viết kho kiến thức --</option>` +
        state.knowledgeArticles.map(a => `<option value="${a.id}">[${a.id}] ${escapeHtml(a.title)}</option>`).join("");
}

function populateProblemDropdown() {
    const select = document.getElementById("lesProblemIdSelect");
    if (!select) return;

    select.innerHTML = `<option value="">-- Chọn bài tập vận dụng --</option>` +
        state.problemsList.map(p => `
            <option value="${p.id}">
                [${p.visibility === 'onlycourse' ? '🔒 Course' : '🌐 Public'}] ${p.grade ? `Lớp ${p.grade} - ` : ''}${escapeHtml(p.title || p.id)}
            </option>
        `).join("");
}

function bindModalEvents() {
    document.getElementById("closeLessonModalBtn")?.addEventListener("click", closeLessonModal);
    document.getElementById("btnCancelLessonModal")?.addEventListener("click", closeLessonModal);

    document.querySelectorAll('input[name="lesContentType"]').forEach(radio => {
        radio.addEventListener("change", (e) => {
            toggleContentBoxes(e.target.value);
        });
    });

    document.getElementById("btnSaveLessonModal")?.addEventListener("click", () => {
        if (state.activeLessonIndex < 0) return;
        const lesson = state.editingCourse.lessons[state.activeLessonIndex];
        if (!lesson) return;

        const contentType = document.querySelector('input[name="lesContentType"]:checked')?.value || "knowledge";

        lesson.title = document.getElementById("lesTitleInput").value.trim();
        lesson.icon = document.getElementById("lesIconInput").value.trim() || "📘";
        lesson.estimatedMinutes = Number(document.getElementById("lesEstInput").value) || 15;
        lesson.unitId = document.getElementById("lesUnitInput").value;
        lesson.required = document.getElementById("lesRequiredChk").checked;
        lesson.description = document.getElementById("lesDescInput").value.trim();
        lesson.contentType = contentType;

        if (contentType === "knowledge") {
            lesson.knowledgeId = document.getElementById("lesKnowledgeIdSelect").value;
            lesson.customContent = "";
            lesson.problemId = "";
        } else if (contentType === "custom") {
            lesson.knowledgeId = "";
            lesson.customContent = document.getElementById("lesCustomContentInput").value.trim();
            lesson.problemId = "";
        } else if (contentType === "problem") {
            lesson.knowledgeId = "";
            lesson.customContent = "";
            lesson.problemId = document.getElementById("lesProblemIdSelect").value;
        }

        closeLessonModal();
        renderLessonsList();
        renderLivePreview();
        toast.success("Đã cập nhật bài học!");
    });

    // Quick problem creator modal trigger
    document.getElementById("btnQuickCreateProblem")?.addEventListener("click", () => {
        const overlay = document.getElementById("quickProblemOverlay");
        if (overlay) overlay.classList.add("active");
    });

    document.getElementById("closeQuickProblemBtn")?.addEventListener("click", closeQuickProblemModal);
    document.getElementById("btnCancelQuickProblem")?.addEventListener("click", closeQuickProblemModal);
    document.getElementById("btnSaveQuickProblem")?.addEventListener("click", saveQuickProblem);
}

function closeQuickProblemModal() {
    const overlay = document.getElementById("quickProblemOverlay");
    if (overlay) overlay.classList.remove("active");
}

async function saveQuickProblem() {
    const title = document.getElementById("qpTitle").value.trim();
    const grade = Number(document.getElementById("qpGrade").value);
    const difficulty = document.getElementById("qpDifficulty").value;
    const visibility = document.getElementById("qpVisibility").value;
    const contentText = document.getElementById("qpContent").value.trim();
    const solutionText = document.getElementById("qpSolution").value.trim();

    if (!title || !contentText) {
        return toast.warning("Vui lòng nhập đầy đủ tiêu đề và nội dung bài tập!");
    }

    try {
        const payload = {
            title,
            grade,
            difficulty,
            visibility,
            topic: state.editingCourse.topicId || "Đại số",
            contentText,
            solutionText,
            rubric: [
                { id: "r1", title: "Thực hiện phép tính & Lập luận", description: "Các bước tính toán", score: 10, knowledge: [] }
            ],
            authorId: state.currentUser?.uid || "admin",
            authorName: state.currentUser?.displayName || "Admin",
            createdAt: serverTimestamp(),
            likes: 0,
            comments: 0
        };

        const ref = await addDoc(collection(db, "problems"), payload);
        toast.success("Đã tạo bài tập vận dụng mới!");

        // Reload problem list
        const snap = await getDocs(query(collection(db, "problems"), orderBy("createdAt", "desc")));
        state.problemsList = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        populateProblemDropdown();

        // Auto select created problem in current lesson
        const select = document.getElementById("lesProblemIdSelect");
        if (select) select.value = ref.id;

        closeQuickProblemModal();
    } catch (e) {
        toast.error("Lỗi khi tạo nhanh bài tập: " + e.message);
    }
}

// ==========================================
// SAVE ENTIRE COURSE ACTION
// ==========================================
async function saveEntireCourse() {
    const c = state.editingCourse;
    if (!c.title || !c.title.trim()) {
        return toast.warning("Vui lòng nhập tên khóa học trước khi lưu!");
    }

    try {
        toast.info("Đang ghi dữ liệu khóa học...");

        // 1. Save Course Metadata
        const courseId = await saveCourse({
            id: state.editingCourseId || undefined,
            title: c.title.trim(),
            grade: Number(c.grade) || 8,
            topicId: c.topicId || "Đại số",
            estimatedMinutes: Number(c.estimatedMinutes) || 120,
            description: c.description || "",
            thumbnail: c.thumbnail || "assets/images/non.png",
            units: c.units || [],
            published: c.published !== false
        });

        // 2. Save Course Lessons
        const lessons = c.lessons || [];
        for (let i = 0; i < lessons.length; i++) {
            const l = lessons[i];
            const isNew = String(l.id).startsWith("temp_");
            await saveCourseLesson({
                id: isNew ? undefined : l.id,
                courseId: courseId,
                unitId: l.unitId || "unit_1",
                title: l.title,
                icon: l.icon || "📘",
                order: i + 1,
                estimatedMinutes: Number(l.estimatedMinutes) || 15,
                required: l.required !== false,
                description: l.description || "",
                knowledgeId: l.knowledgeId || "",
                customContent: l.customContent || "",
                problemId: l.problemId || ""
            });
        }

        toast.success("🚀 Đã lưu khóa học và toàn bộ lộ trình bài học thành công!");

        // Refresh Sidebar & State
        state.editingCourseId = courseId;
        const snap = await fetchAllCoursesAdmin();
        state.coursesList = snap;
        renderSidebarCourses();

    } catch (err) {
        console.error("Lỗi khi lưu khóa học:", err);
        toast.error("Lỗi khi lưu khóa học: " + err.message);
    }
}

async function deleteCurrentCourseAction() {
    if (!state.editingCourseId) return;

    if (confirm(`Bạn có chắc chắn muốn xóa khóa học "${state.editingCourse.title}" không?`)) {
        try {
            await deleteCourse(state.editingCourseId);
            toast.success("Đã xóa khóa học!");
            state.editingCourseId = null;
            state.editingCourse = createBlankCourse();
            
            const snap = await fetchAllCoursesAdmin();
            state.coursesList = snap;
            renderSidebarCourses();
            renderCourseForm();
            renderLivePreview();
        } catch (e) {
            toast.error("Lỗi khi xóa khóa học: " + e.message);
        }
    }
}

function escapeHtml(str = "") {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
