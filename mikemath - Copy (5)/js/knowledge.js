/**
 * MIKE MATH - KNOWLEDGE EXPLORER
 * File: js/knowledge.js
 */

import { db,auth } from "./firebase.js";
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    getDoc,
    doc,
    orderBy
    
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
// STATE MANAGEMENT
const state = {
    currentFolderId: null, // null = Root
    folderPath: [],        // Cây thư mục cha -> con
    allItems: [],          // Danh sách toàn bộ (Folder + Article) thu được từ Firestore
    filteredItems: [],     // Danh sách sau khi áp dụng lọc (Search, Grade, Topic)
    viewMode: "grid",      // "grid" | "list"
    currentPage: 1,
    pageSize: 12
};

// DOM ELEMENTS
const elements = {
    breadcrumbList: document.getElementById("breadcrumbList"),
    folderTitle: document.getElementById("folderTitle"),
    folderDesc: document.getElementById("folderDesc"),
    resultCount: document.getElementById("resultCount"),
    
    // Controls
    searchInput: document.getElementById("searchArticleInput"),
    gradeFilter: document.getElementById("gradeFilter"),
    topicFilter: document.getElementById("topicFilter"),
    gridViewBtn: document.getElementById("gridViewBtn"),
    listViewBtn: document.getElementById("listViewBtn"),
    createArticleBtn: document.getElementById("createArticleBtn"),
    
    // Container Views
    gridView: document.getElementById("gridView"),
    listView: document.getElementById("listView"),
    knowledgeGrid: document.getElementById("knowledgeGrid"),
    
    // Pagination
    firstPageBtn: document.getElementById("firstPageBtn"),
    prevPageBtn: document.getElementById("prevPageBtn"),
    nextPageBtn: document.getElementById("nextPageBtn"),
    lastPageBtn: document.getElementById("lastPageBtn"),
    paginationNumbers: document.getElementById("paginationNumbers")
};

// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    state.currentFolderId = urlParams.get("folder") || null;
checkAdminPermission();
    initExplorer();
    bindEvents();
});
function checkAdminPermission() {
    onAuthStateChanged(auth, async (user) => {
        const createBtn = elements.createArticleBtn;
        if (!createBtn) return;

        if (!user) {
            createBtn.style.display = "none";
            return;
        }

        try {
            const userSnap = await getDoc(doc(db, "users", user.uid));
            if (userSnap.exists() && userSnap.data().role === "admin") {
                createBtn.style.display = "inline-block"; // Hiện nút cho Admin
            } else {
                createBtn.style.display = "none"; // Ẩn với Student / Teacher
            }
        } catch (err) {
            console.error("Lỗi xác minh quyền Admin:", err);
            createBtn.style.display = "none";
        }
    });
}

function bindEvents() {
    // Search & Filter Events
    elements.searchInput?.addEventListener("input", filterAndRender);
    elements.gradeFilter?.addEventListener("change", filterAndRender);
    elements.topicFilter?.addEventListener("change", filterAndRender);

    // View Switcher Events
    elements.gridViewBtn?.addEventListener("click", () => switchViewMode("grid"));
    elements.listViewBtn?.addEventListener("click", () => switchViewMode("list"));

    // Add Article Button
    elements.createArticleBtn?.addEventListener("click", () => {
        const folderParam = state.currentFolderId ? `?folderId=${state.currentFolderId}` : "";
        window.location.href = `knowledge-create.html`;
    });

    // Pagination Events
    elements.firstPageBtn?.addEventListener("click", () => goToPage(1));
    elements.prevPageBtn?.addEventListener("click", () => goToPage(state.currentPage - 1));
    elements.nextPageBtn?.addEventListener("click", () => goToPage(state.currentPage + 1));
    elements.lastPageBtn?.addEventListener("click", () => {
        const totalPages = Math.ceil(state.filteredItems.length / state.pageSize) || 1;
        goToPage(totalPages);
    });
}

async function initExplorer() {
    await buildBreadcrumbPath(state.currentFolderId);
    renderBreadcrumb();
    await loadContents(state.currentFolderId);
}

// 1. DỰNG TẬP HỢP ĐƯỜNG DẪN BREADCRUMB
async function buildBreadcrumbPath(folderId) {
    state.folderPath = [];
    let currentId = folderId;

    while (currentId) {
        try {
            const folderSnap = await getDoc(doc(db, "knowledgeFolders", currentId));
            if (folderSnap.exists()) {
                const data = folderSnap.data();
                state.folderPath.unshift({ id: folderSnap.id, ...data });
                currentId = data.parentId || null;
            } else {
                currentId = null;
            }
        } catch (err) {
            console.error("Lỗi dựng breadcrumb:", err);
            currentId = null;
        }
    }
}

// 2. RENDER BREADCRUMB HOÀN CHỈNH
function renderBreadcrumb() {
    let html = `<a href="knowledge.html">🏠 Root</a>`;
    
    state.folderPath.forEach((item, idx) => {
        const isLast = idx === state.folderPath.length - 1;
        if (isLast) {
            html += ` &gt; <span class="active">${escapeHtml(item.name)}</span>`;
            if (elements.folderTitle) elements.folderTitle.textContent = item.name;
            if (elements.folderDesc && item.description) {
                elements.folderDesc.textContent = item.description;
            }
        } else {
            html += ` &gt; <a href="knowledge.html?folder=${item.id}">${escapeHtml(item.name)}</a>`;
        }
    });

    if (state.folderPath.length === 0) {
        if (elements.folderTitle) elements.folderTitle.textContent = "Thư viện kiến thức";
        if (elements.folderDesc) elements.folderDesc.textContent = "Duyệt, tra cứu và tổng hợp kiến thức môn Toán THCS theo cây thư mục.";
    }

    if (elements.breadcrumbList) elements.breadcrumbList.innerHTML = html;
}

// 3. TẢI DỮ LIỆU TỪ FIRESTORE
// 3. TẢI DỮ LIỆU TỪ FIRESTORE
async function loadContents(parentId) {
    showLoading();

    try {
        const targetParentId = parentId || null;

        // Query thư mục con
        const folderQ = query(
            collection(db, "knowledgeFolders"),
            where("parentId", "==", targetParentId),
            where("hidden", "==", false)
        );

        // Query bài học thuộc thư mục hiện tại
        const articleQ = query(
            collection(db, "knowledgeArticles"),
            where("folderId", "==", targetParentId),
            where("hidden", "==", false)
        );

        const [foldersSnap, articlesSnap] = await Promise.all([
            getDocs(folderQ),
            getDocs(articleQ)
        ]);

        // 🟢 BỔ SUNG: Lọc bỏ các mục đã bị Soft Delete (deleted === true)
        const folders = foldersSnap.docs
            .map(docSnap => ({
                id: docSnap.id,
                type: "folder",
                ...docSnap.data()
            }))
            .filter(item => item.deleted !== true); // Loại bỏ thư mục đã xoá mềm

        const articles = articlesSnap.docs
            .map(docSnap => ({
                id: docSnap.id,
                type: "article",
                ...docSnap.data()
            }))
            .filter(item => item.deleted !== true && item.visibility !== "onlycourse");

        // Gộp dữ liệu hiển thị
        state.allItems = [...folders, ...articles];
        filterAndRender();

    } catch (error) {
        console.error("Lỗi khi tải dữ liệu explorer:", error);
        showError("⚠️ Lỗi khi tải dữ liệu! Vui lòng kiểm tra lại kết nối hoặc quyền truy cập Firestore.");
    }
}

// 4. BỘ LỌC VÀ PHÂN TRANG (FILTER & RENDER)
function filterAndRender() {
    const searchTerm = elements.searchInput?.value.toLowerCase().trim() || "";
    const selectedGrade = elements.gradeFilter?.value || "";
    const selectedTopic = elements.topicFilter?.value || "";

    state.filteredItems = state.allItems.filter(item => {
        // Tìm kiếm tên bài / thư mục
        const title = (item.name || item.title || "").toLowerCase();
        const matchesSearch = !searchTerm || title.includes(searchTerm);

        // Lọc theo Lớp (Chỉ áp dụng cho Bài học hoặc Folder có gán grade)
        const matchesGrade = !selectedGrade || String(item.grade) === selectedGrade;

        // Lọc theo Phân môn / Chủ đề
        const matchesTopic = !selectedTopic || item.topic === selectedTopic;

        return matchesSearch && matchesGrade && matchesTopic;
    });

    // Cập nhật số lượng
    if (elements.resultCount) {
        elements.resultCount.textContent = `${state.filteredItems.length} mục`;
    }

    state.currentPage = 1;
    renderCurrentPage();
}

// 5. RENDER TRANG HIỆN TẠI TƯƠNG ỨNG VỚI VIEW MODE
function renderCurrentPage() {
    const startIdx = (state.currentPage - 1) * state.pageSize;
    const endIdx = startIdx + state.pageSize;
    const pageItems = state.filteredItems.slice(startIdx, endIdx);

    if (state.viewMode === "grid") {
        renderGridView(pageItems);
    } else {
        renderListView(pageItems);
    }

    renderPagination();
}

// 6. RENDER DẠNG GRID
function renderGridView(items) {
    if (items.length === 0) {
        elements.knowledgeGrid.innerHTML = `<p class="text-muted card" style="grid-column: 1/-1; padding: 20px;">Không tìm thấy bài học hoặc thư mục phù hợp.</p>`;
        return;
    }

    elements.knowledgeGrid.innerHTML = items.map(item => {
        if (item.type === "folder") {
            const icon = item.icon || "📁";
            return `
                <a href="knowledge.html?folder=${item.id}" class="card">
                    <div class="card-type-badge folder-badge">Thư mục</div>
                    <div class="card-main-icon">${icon}</div>
                    <h3 class="card-title">${escapeHtml(item.name)}</h3>
                </a>
            `;
        } else {
            const gradeBadge = item.grade ? `<span class="badge">Lớp ${item.grade}</span>` : "";
            const topicBadge = item.topic ? `<span class="badge badge-sub">${escapeHtml(item.topic)}</span>` : "";
            
            return `
                <a href="knowledge-detail.html?id=${item.id}" class="card">
                    <div class="card-type-badge article-badge">📄 Bài học</div>
                    <h3 class="card-title">${escapeHtml(item.title)}</h3>
                    <div class="card-tags">${gradeBadge} ${topicBadge}</div>
                    <p class="card-summary">${escapeHtml(item.summary || "Xem chi tiết lý thuyết, công thức & ví dụ...")}</p>
                    <div class="card-footer">
                        <span>👁️ ${item.views || 0} lượt xem</span>
                        <span class="btn-read">Đọc bài &rarr;</span>
                    </div>
                </a>
            `;
        }
    }).join("");
}

// 7. RENDER DẠNG LIST (ĐỒNG BỘ VỚI LIST VIEW BÀI TẬP)
function renderListView(items) {
    if (items.length === 0) {
        elements.listView.innerHTML = `<p class="text-muted card" style="padding: 20px;">Không tìm thấy dữ liệu phù hợp.</p>`;
        return;
    }

    elements.listView.innerHTML = items.map(item => {
        if (item.type === "folder") {
            return `
                <div class="card list-item-row">
                    <div class="list-item-main">
                        <span class="list-icon">📁</span>
                        <a href="knowledge.html?folder=${item.id}" class="list-title">${escapeHtml(item.name)}</a>
                    </div>
                    <div class="list-item-meta">
                        <span class="badge folder-badge">Thư mục</span>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="card list-item-row">
                    <div class="list-item-main">
                        <span class="list-icon">📄</span>
                        <a href="knowledge-detail.html?id=${item.id}" class="list-title">${escapeHtml(item.title)}</a>
                    </div>
                    <div class="list-item-meta">
                        ${item.grade ? `<span class="badge">Lớp ${item.grade}</span>` : ""}
                        ${item.topic ? `<span class="badge badge-sub">${escapeHtml(item.topic)}</span>` : ""}
                        <span class="views-count">👁️ ${item.views || 0}</span>
                    </div>
                </div>
            `;
        }
    }).join("");
}

// 8. CHUYỂN ĐỔI CHẾ ĐỘ XEM (GRID / LIST)
function switchViewMode(mode) {
    state.viewMode = mode;
    
    if (mode === "grid") {
        elements.gridViewBtn?.classList.add("active");
        elements.listViewBtn?.classList.remove("active");
        elements.gridView?.classList.remove("hidden");
        elements.listView?.classList.add("hidden");
    } else {
        elements.listViewBtn?.classList.add("active");
        elements.gridViewBtn?.classList.remove("active");
        elements.listView?.classList.remove("hidden");
        elements.gridView?.classList.add("hidden");
    }

    renderCurrentPage();
}

// 9. XỬ LÝ PHÂN TRANG (PAGINATION)
function renderPagination() {
    const totalPages = Math.ceil(state.filteredItems.length / state.pageSize) || 1;
    
    // Disable / Enable buttons
    if (elements.firstPageBtn) elements.firstPageBtn.disabled = state.currentPage === 1;
    if (elements.prevPageBtn) elements.prevPageBtn.disabled = state.currentPage === 1;
    if (elements.nextPageBtn) elements.nextPageBtn.disabled = state.currentPage === totalPages;
    if (elements.lastPageBtn) elements.lastPageBtn.disabled = state.currentPage === totalPages;

    // Render số trang
    if (elements.paginationNumbers) {
        let pagesHtml = "";
        for (let i = 1; i <= totalPages; i++) {
            pagesHtml += `
                <button class="page-num ${i === state.currentPage ? 'active' : ''}" onclick="window.goToKnowledgePage(${i})">
                    ${i}
                </button>
            `;
        }
        elements.paginationNumbers.innerHTML = pagesHtml;
    }
}

function goToPage(page) {
    const totalPages = Math.ceil(state.filteredItems.length / state.pageSize) || 1;
    if (page < 1 || page > totalPages) return;
    state.currentPage = page;
    renderCurrentPage();
}

// Expose hàm phân trang ra Window cho inline onclick
window.goToKnowledgePage = goToPage;

// HELPER FUNCTIONS
function showLoading() {
    if (elements.knowledgeGrid) {
        elements.knowledgeGrid.innerHTML = `<div class="loading-spinner">Đang tải dữ liệu...</div>`;
    }
}

function showError(msg) {
    if (elements.knowledgeGrid) {
        elements.knowledgeGrid.innerHTML = `<p class="error-msg card" style="grid-column: 1/-1;">${msg}</p>`;
    }
}

function escapeHtml(str = "") {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}