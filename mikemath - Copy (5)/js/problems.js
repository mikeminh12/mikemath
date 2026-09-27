import { db,auth } from "./firebase.js";
import {
    collection,
    query,
    orderBy,
    getDocs,
    getDoc,
    doc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
// DOM Elements
const listView = document.getElementById("listView");
const postView = document.getElementById("postView");
const resultCount = document.getElementById("resultCount");

const searchInput = document.getElementById("searchInput");
const gradeFilter = document.getElementById("gradeFilter");
const topicFilter = document.getElementById("topicFilter");
const difficultyFilter = document.getElementById("difficultyFilter");

const listViewBtn = document.getElementById("listViewBtn");
const postViewBtn = document.getElementById("postViewBtn");
const createProblemBtn = document.getElementById("createProblemBtn");
const mySubmissionsBtn= document.getElementById("mySubmissionsBtn");
const firstPageBtn = document.getElementById("firstPageBtn");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const lastPageBtn = document.getElementById("lastPageBtn");
const paginationNumbers = document.getElementById("paginationNumbers");

// Application State
const state = {
    problems: [],
    filteredProblems: [],
    currentProblems: [],

    page: 1,
    pageSize: 8,

    view: "list", // 'list' hoặc 'post'

    filters: {
        keyword: "",
        grade: "",
        topic: "",
        difficulty: ""
    }
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
    bindEvents();
    checkUserPermissionAndUI(); 
    await loadProblems();
    await loadTopicsFilter(); // Tải động các chủ đề vào dropdown bộ lọc
    applyFiltersAndPaginate();
       
}

/* ==========================================================================
   1. Data Fetching & Processing
   ========================================================================== */
async function loadProblems() {
    try {
        const q = query(
            collection(db, "problems"),
            orderBy("createdAt", "desc")
        );

        const snapshot = await getDocs(q);

        state.problems = snapshot.docs
            .map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            .filter(p => p.visibility !== "onlycourse" && !p.deleted && !p.hidden);
    } catch (error) {
        console.error("Lỗi tải bài tập:", error);
    }
}

/**
 * Tải danh sách topic từ collection 'topics' và tổng hợp các topic đã xuất hiện trong bài tập
 */
async function loadTopicsFilter() {
    if (!topicFilter) return;

    try {
        // Tải topic từ collection 'topics'
        const topicsSnapshot = await getDocs(collection(db, "topics"));
        const customTopics = topicsSnapshot.docs.map(doc => doc.data().name).filter(Boolean);

        // Gom các topic thực tế có trong bài tập
        const usedTopics = state.problems.map(p => p.topic).filter(Boolean);

        // Mặc định
        const defaultTopics = ["Đại số", "Hình học", "Số học", "Tổ hợp"];

        // Hợp nhất và loại bỏ trùng lặp bằng Set
        const allTopicsSet = new Set([...defaultTopics, ...customTopics, ...usedTopics]);

        // Giữ nguyên option đầu tiên ("Tất cả chủ đề")
        const currentValue = topicFilter.value;
        topicFilter.innerHTML = `<option value="">Tất cả chủ đề</option>`;

        allTopicsSet.forEach(topic => {
            const option = document.createElement("option");
            option.value = topic;
            option.textContent = topic;
            topicFilter.appendChild(option);
        });

        // Giữ lại lựa chọn hiện tại nếu có
        topicFilter.value = currentValue;
    } catch (error) {
        console.error("Lỗi khi tải bộ lọc chủ đề:", error);
    }
}

function applyFiltersAndPaginate() {
    filterProblems();
    paginate();
    render();
}

function filterProblems() {
    const { keyword, grade, topic, difficulty } = state.filters;
    const kw = keyword.toLowerCase().trim();

    state.filteredProblems = state.problems.filter(problem => {
        const titleText = typeof problem.title === "string" ? problem.title : "";
        let contentText = "";

        if (typeof problem.contentText === "string") {
            contentText = problem.contentText;
        } else if (typeof problem.contentHtml === "string") {
            contentText = problem.contentHtml;
        } else if (typeof problem.content === "string") {
            contentText = problem.content;
        } else if (typeof problem.content === "object" && problem.content !== null) {
            try {
                contentText = JSON.stringify(problem.content);
            } catch (e) {
                contentText = "";
            }
        }

        const matchTitle = titleText.toLowerCase().includes(kw);
        const matchContent = contentText.toLowerCase().includes(kw);
        const matchKeyword = !kw || matchTitle || matchContent;

        const matchGrade = !grade || String(problem.grade) === String(grade);
        const matchTopic = !topic || problem.topic === topic;
        const matchDifficulty = !difficulty || problem.difficulty === difficulty;

        return matchKeyword && matchGrade && matchTopic && matchDifficulty;
    });
}

function paginate() {
    const totalPages = getTotalPages();
    if (state.page > totalPages) state.page = Math.max(1, totalPages);

    const start = (state.page - 1) * state.pageSize;
    const end = start + state.pageSize;

    state.currentProblems = state.filteredProblems.slice(start, end);
}

function getTotalPages() {
    return Math.ceil(state.filteredProblems.length / state.pageSize) || 1;
}

/* ==========================================================================
   2. Render Functions
   ========================================================================== */
function render() {
    renderResultCount();
    renderContent();
    renderPagination();
}

function renderResultCount() {
    if (resultCount) {
        resultCount.textContent = `${state.filteredProblems.length} bài tập`;
    }
}

function renderContent() {
    const container = state.view === "list" ? listView : postView;

    if (state.view === "list") {
        listView.classList.remove("hidden");
        postView.classList.add("hidden");
    } else {
        postView.classList.remove("hidden");
        listView.classList.add("hidden");
    }

    container.innerHTML = "";

    if (state.currentProblems.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align: center; width: 100%;">
                <p style="margin: 0;">Không tìm thấy bài tập phù hợp.</p>
            </div>
        `;
        return;
    }

    state.currentProblems.forEach(problem => {
        const card = createProblemCard(problem);
        container.appendChild(card);
    });
}

function createProblemCard(problem) {
    const card = document.createElement("div");
    card.className = state.view === "list" ? "card problem-card problem-item" : "card post-item";

    card.addEventListener("click", () => {
        window.location.href = `problem-detail.html?id=${problem.id}`;
    });

    const diffText = { easy: "Dễ", medium: "Trung bình", hard: "Khó" }[problem.difficulty] || "Chưa rõ";
    const gradeText = problem.grade ? `Lớp ${problem.grade}` : "Mọi lớp";
    const authorText = problem.authorName || "Ẩn danh";

    card.innerHTML = `
        <div style="flex: 1;">
            <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap;">
                <span class="badge" style="margin-bottom: 0;">${gradeText}</span>
                ${problem.topic ? `<span class="badge" style="margin-bottom: 0; background: #e0f2fe; color: #0369a1; border-color: #7dd3fc;">${escapeHtml(problem.topic)}</span>` : ""}
                <span class="badge" style="margin-bottom: 0; background: #fef3c7; color: #b45309; border-color: #fde68a;">${diffText}</span>
            </div>
            <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 6px;">${escapeHtml(problem.title || "Bài tập không tên")}</h3>
            <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">${escapeHtml(truncate(problem.contentText || problem.contentHtml || problem.content, 120))}</p>
        </div>
        <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); border-top: 1px dashed var(--border-color); padding-top: 8px; margin-top: 8px;">
            👤 ${escapeHtml(authorText)}
        </div>
    `;

    return card;
}

function renderPagination() {
    const totalPages = getTotalPages();

    firstPageBtn.disabled = state.page === 1;
    prevPageBtn.disabled = state.page === 1;
    nextPageBtn.disabled = state.page === totalPages;
    lastPageBtn.disabled = state.page === totalPages;

    paginationNumbers.innerHTML = "";

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement("button");
        btn.textContent = i;
        if (i === state.page) btn.classList.add("active");

        btn.addEventListener("click", () => {
            state.page = i;
            paginate();
            render();
        });

        paginationNumbers.appendChild(btn);
    }
}
let minScoreToCreate = 200; 


/**
 * Đọc settings và user score để xử lý trạng thái nút "Đăng bài tập"
 */
/**
 * Đọc settings và user score để xử lý trạng thái nút "Đăng bài tập"
 */
function checkUserPermissionAndUI() {
    // onAuthStateChanged bây giờ đã được import chuẩn xác
    onAuthStateChanged(auth, async (user) => {
        const createBtn = document.getElementById("createProblemBtn");
        if (!createBtn) return;
        if(!user){
            mySubmissionsBtn.style.display="none";
        }
        try {
            // 1. Tải cấu hình ngưỡng điểm từ system settings
            let minScoreToCreate = 200;
            const sysSnap = await getDoc(doc(db, "settings", "system"));
            if (sysSnap.exists()) {
                minScoreToCreate = sysSnap.data().minScoreCreateProblem ?? 200;
            }

            // 2. Nếu chưa đăng nhập -> Disable nút
            if (!user) {
                setButtonLocked(createBtn, "Vui lòng đăng nhập để đăng bài");
                return;
            }

            // 3. Đọc điểm totalScore của User hiện tại
            const userSnap = await getDoc(doc(db, "users", user.uid));
            const userData = userSnap.exists() ? userSnap.data() : {};
            const userScore = userData.totalScore || 0;

            // 4. So sánh điểm và mở/khóa nút
            if (userScore >= minScoreToCreate) {
                createBtn.disabled = false;
                createBtn.innerHTML = `+ Đăng bài tập`;
                createBtn.title = "";
                createBtn.style.opacity = "1";
                createBtn.style.cursor = "pointer";
            } else {
                setButtonLocked(createBtn, `🔒 Cần ${minScoreToCreate} điểm (Hiện tại: ${userScore}đ)`);
            }
        } catch (err) {
            console.error("Lỗi kiểm tra quyền đăng bài:", err);
        }
    });
}

function setButtonLocked(btn, message) {
    btn.disabled = true;
    btn.innerHTML = ``;
    btn.style.display="none";
}
/* ==========================================================================
   3. Event Handlers
   ========================================================================== */
function bindEvents() {
    searchInput?.addEventListener("input", e => {
        state.filters.keyword = e.target.value;
        state.page = 1;
        applyFiltersAndPaginate();
    });

    gradeFilter?.addEventListener("change", e => {
        state.filters.grade = e.target.value;
        state.page = 1;
        applyFiltersAndPaginate();
    });

    topicFilter?.addEventListener("change", e => {
        state.filters.topic = e.target.value;
        state.page = 1;
        applyFiltersAndPaginate();
    });

    difficultyFilter?.addEventListener("change", e => {
        state.filters.difficulty = e.target.value;
        state.page = 1;
        applyFiltersAndPaginate();
    });

    listViewBtn?.addEventListener("click", () => {
        if (state.view === "list") return;
        state.view = "list";
        listViewBtn.classList.add("active");
        postViewBtn.classList.remove("active");
        renderContent();
    });

    postViewBtn?.addEventListener("click", () => {
        if (state.view === "post") return;
        state.view = "post";
        postViewBtn.classList.add("active");
        listViewBtn.classList.remove("active");
        renderContent();
    });

    createProblemBtn?.addEventListener("click", () => {
        window.location.href = "problem-create.html";
    });
    mySubmissionsBtn?.addEventListener("click", () => {
        window.location.href = "submitted.html";
    });
    firstPageBtn?.addEventListener("click", () => {
        if (state.page === 1) return;
        state.page = 1;
        paginate();
        render();
    });

    prevPageBtn?.addEventListener("click", () => {
        if (state.page > 1) {
            state.page--;
            paginate();
            render();
        }
    });

    nextPageBtn?.addEventListener("click", () => {
        const totalPages = getTotalPages();
        if (state.page < totalPages) {
            state.page++;
            paginate();
            render();
        }
    });

    lastPageBtn?.addEventListener("click", () => {
        const totalPages = getTotalPages();
        if (state.page === totalPages) return;
        state.page = totalPages;
        paginate();
        render();
    });
}

/* ==========================================================================
   4. Utilities
   ========================================================================== */
function extractPlainText(data) {
    if (!data) return "";
    if (typeof data === "string") {
        return data.replace(/<[^>]*>/g, "").trim();
    }
    if (typeof data === "object" && data !== null) {
        if (data.type === "doc" && Array.isArray(data.content)) {
            const extractNodes = (nodes) => {
                return nodes.map(node => {
                    if (node.type === "text") return node.text || "";
                    if (node.type === "math") return node.attrs?.latex ? `$${node.attrs.latex}$` : "";
                    if (Array.isArray(node.content)) return extractNodes(node.content);
                    return "";
                }).join(" ");
            };
            return extractNodes(data.content).trim();
        }
        try {
            return JSON.stringify(data);
        } catch (e) {
            return "";
        }
    }
    return String(data);
}

function truncate(input = "", length = 120) {
    const text = extractPlainText(input);
    if (!text) return "Chưa có nội dung mô tả.";
    if (text.length <= length) return text;
    return text.substring(0, length) + "...";
}

function escapeHtml(str = "") {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}