/**
 * MIKE MATH - SUBMITTED LIST PAGE
 * File: js/submitted.js
 */

import { db, auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    startAfter, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// STATE MANAGEMENT
const PAGE_SIZE = 20;
let currentUser = null;
let lastVisibleDoc = null;
let allSubmissions = []; // Chứa dữ liệu đã tải từ Firestore
let filteredSubmissions = []; // Chứa dữ liệu sau khi filter client-side
//elements.;
//elements.;

// DOM ELEMENTS
const elements = {
    container: document.getElementById("submissionsContainer"),
    emptyState: document.getElementById("emptyState"),
    btnLoadMore: document.getElementById("btnLoadMore"),

    // Stats
    statTotal: document.getElementById("statTotalSubmitted"),
    statAvgScore: document.getElementById("statAvgScore"),
    statRate: document.getElementById("statCompletionRate"),
    statToday: document.getElementById("statTodayCount"),

    // Filters
    filterSearch: document.getElementById("filterSearch"),
    filterGrade: document.getElementById("filterGrade"),
    filterScore: document.getElementById("filterScore"),
    filterStatus: document.getElementById("filterStatus"),
    filterType: document.getElementById("filterType"),
    listViewBtn: document.getElementById("listViewBtn"),
    postViewBtn: document.getElementById("postViewBtn")
};
let currentView = "post";
    elements.postViewBtn.classList.add("active");
    elements.listViewBtn.classList.remove("active");
// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    renderSkeletons();
    
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            initPage();
        } else {
            window.location.href = "login.html";
        }
    });
});

async function initPage() {
    bindFilterEvents();
    await fetchSubmissions(true);
}

// 1. FIRESTORE DATA FETCHING
async function fetchSubmissions(isInitial = false) {
    if (isInitial) {
        lastVisibleDoc = null;
        allSubmissions = [];
        renderSkeletons();
    }

    try {
        let q = query(
            collection(db, "submissions"),
            where("userId", "==", currentUser.uid),
            orderBy("createdAt", "desc"),
            limit(PAGE_SIZE)
        );

        if (lastVisibleDoc && !isInitial) {
            q = query(
                collection(db, "submissions"),
                where("userId", "==", currentUser.uid),
                orderBy("createdAt", "desc"),
                startAfter(lastVisibleDoc),
                limit(PAGE_SIZE)
            );
        }

        const snapshot = await getDocs(q);

        if (snapshot.empty && isInitial) {
            showEmptyState(true);
            updateStatistics([]);
            return;
        }

        showEmptyState(false);
        lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];

        const newDocs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        allSubmissions = [...allSubmissions, ...newDocs];

        // Toggle nút Xem thêm
        if (snapshot.docs.length < PAGE_SIZE) {
            elements.btnLoadMore.classList.add("hidden");
        } else {
            elements.btnLoadMore.classList.remove("hidden");
        }

        updateStatistics(allSubmissions);
        applyFilters();

    } catch (err) {
        console.error("Lỗi khi tải lịch sử bài nộp:", err);
        elements.container.innerHTML = `<p class="text-danger text-center">Không thể tải dữ liệu: ${err.message}</p>`;
    }
}

// 2. STATISTICS CALCULATOR
function updateStatistics(list) {
    if (!list || list.length === 0) {
        elements.statTotal.textContent = "0";
        elements.statAvgScore.textContent = "0.0";
        elements.statRate.textContent = "0%";
        elements.statToday.textContent = "0";
        return;
    }

    const total = list.length;
    let completedCount = 0;
    let sumScore = 0;
    let scoreCount = 0;
    let todayCount = 0;

    const todayStr = new Date().toDateString();

    list.forEach(item => {
        // Tỷ lệ hoàn thành
        if (item.status === "completed") {
            completedCount++;
        }

        // Điểm trung bình
        if (typeof item.score === "number" && !isNaN(item.score)) {
            sumScore += item.score;
            scoreCount++;
        }

        // Lần nộp hôm nay
        if (item.createdAt && item.createdAt.toDate) {
            const dateObj = item.createdAt.toDate();
            if (dateObj.toDateString() === todayStr) {
                todayCount++;
            }
        }
    });

    const avgScore = scoreCount > 0 ? (sumScore / scoreCount).toFixed(1) : "0.0";
    const completionRate = Math.round((completedCount / total) * 100);

    elements.statTotal.textContent = total;
    elements.statAvgScore.textContent = avgScore;
    elements.statRate.textContent = `${completionRate}%`;
    elements.statToday.textContent = todayCount;
}

// 3. FILTERING LOGIC
function bindFilterEvents() {
    const filterInputs = [
        elements.filterSearch, 
        elements.filterGrade, 
        elements.filterScore, 
        elements.filterStatus, 
        elements.filterType
    ];

    filterInputs.forEach(input => {
        input?.addEventListener("input", applyFilters);
        input?.addEventListener("change", applyFilters);
    });
elements.listViewBtn?.addEventListener("click", () => {
    if (currentView === "list") return;
    currentView = "list";
    elements.listViewBtn.classList.add("active");
    elements.postViewBtn.classList.remove("active");
    renderCards(filteredSubmissions);
});

elements.postViewBtn?.addEventListener("click", () => {
    if (currentView === "post") return;
    currentView = "post";
    elements.postViewBtn.classList.add("active");
    elements.listViewBtn.classList.remove("active");
    renderCards(filteredSubmissions);
});

    elements.btnLoadMore?.addEventListener("click", () => fetchSubmissions(false));
}

function applyFilters() {
    const searchVal = elements.filterSearch.value.trim().toLowerCase();
    const gradeVal = elements.filterGrade.value;
    const scoreVal = elements.filterScore.value;
    const statusVal = elements.filterStatus.value;
    const typeVal = elements.filterType.value;

    filteredSubmissions = allSubmissions.filter(item => {
        // Filter tên bài
        if (searchVal && !item.problemTitle?.toLowerCase().includes(searchVal)) return false;

        // Filter Lớp
        if (gradeVal && String(item.grade) !== String(gradeVal)) return false;

        // Filter Trạng thái
        if (statusVal && item.status !== statusVal) return false;

        // Filter Loại
        if (typeVal && item.type !== typeVal) return false;

        // Filter Điểm
        if (scoreVal) {
            const score = item.score ?? -1;
            if (scoreVal === "0-5" && (score < 0 || score > 5)) return false;
            if (scoreVal === "5-8" && (score <= 5 || score > 8)) return false;
            if (scoreVal === "8-10" && (score <= 8 || score > 10)) return false;
        }

        return true;
    });

    renderCards(filteredSubmissions);
}

// 4. CARD RENDERER (Cập nhật chuẩn style Grid/List Neo-Brutalist)
function renderCards(list) {
    if (list.length === 0) {
        elements.container.innerHTML = `
            <div class="card" style="text-align: center; width: 100%; padding: 24px;">
                <p style="margin: 0; font-weight: 700; color: var(--text-muted);">
                    Không tìm thấy bài nộp phù hợp với bộ lọc.
                </p>
            </div>
        `;
        return;
    }

    // Đảm bảo class container
    elements.container.className = currentView === "list" ? "problem-list" : "problem-posts";

    elements.container.innerHTML = list.map(item => {
        const dateFormatted = item.createdAt?.toDate 
            ? item.createdAt.toDate().toLocaleString('vi-VN', { 
                hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' 
              })
            : "Vừa xong";

        const { badgeClass, badgeText } = getStatusBadge(item.status);
        const scoreDisplay = typeof item.score === "number" ? `${item.score}/10 đ` : "Chưa có điểm";

        // 1. GIAO DIỆN DẠNG DANH SÁCH (List View - Dàn 2 cột ngang gọn gàng)
        if (currentView === "list") {
            return `
                <div class="card problem-card problem-item" 
                     style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 20px;" 
                     onclick="window.location.href='submit-detail.html?id=${item.id}'">
                    
                    <!-- Cột trái: Thông tin bài nộp -->
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap;">
                            <span class="badge" style="margin-bottom: 0;">Lớp ${item.grade || '--'}</span>
                            <span class="badge" style="margin-bottom: 0; background: #e0f2fe; color: #0369a1; border-color: #7dd3fc;">
                                ${getTypeLabel(item.type)}
                            </span>
                            <span class="badge ${badgeClass}" style="margin-bottom: 0;">
                                ${badgeText}
                            </span>
                        </div>

                        <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 6px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${escapeHtml(item.problemTitle || 'Bài tập toán')}
                        </h3>

                        <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; gap: 16px; align-items: center;">
                            <span>🕒 ${dateFormatted}</span>
                            ${item.attemptCount ? `<span>🔄 Nộp ${item.attemptCount} lần</span>` : ''}
                        </div>
                    </div>

                    <!-- Cột phải: Điểm AI + Cụm nút thao tác -->
                    <div style="display: flex; align-items: center; gap: 16px; flex-shrink: 0;" onclick="event.stopPropagation()">
                        <div style="text-align: right; border-right: 2px dashed var(--border-color, #cbd5e1); padding-right: 16px;">
                            <div style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Điểm AI</div>
                            <div style="font-size: 1.2rem; font-weight: 900; color: var(--primary);">${scoreDisplay}</div>
                        </div>

                        <div style="display: flex; gap: 8px;">
                            <a href="submit-detail.html?id=${item.id}" class="btn-primary" style="font-size: 0.85rem; padding: 8px 14px;">
                                Chi tiết
                            </a>
                            <a href="problem-detail.html?id=${item.problemId}" class="btn-secondary" style="font-size: 0.85rem; padding: 8px 14px;">
                                Xem đề
                            </a>
                            <a href="problem-detail.html?id=${item.problemId}&redo=true" class="btn-secondary" style="font-size: 0.85rem; padding: 8px 14px; background: #fef3c7;">
                                Làm lại
                            </a>
                        </div>
                    </div>

                </div>
            `;
        }

        // 2. GIAO DIỆN DẠNG BÀI ĐĂNG (Post / Grid View - Dạng thẻ dọc 3-4 cột)
        return `
            <div class="card post-item" 
                 style="cursor: pointer; display: flex; flex-direction: column; justify-content: space-between;" 
                 onclick="window.location.href='submit-detail.html?id=${item.id}'">
                
                <div>
                    <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap;">
                        <span class="badge" style="margin-bottom: 0;">Lớp ${item.grade || '--'}</span>
                        <span class="badge" style="margin-bottom: 0; background: #e0f2fe; color: #0369a1; border-color: #7dd3fc;">
                            ${getTypeLabel(item.type)}
                        </span>
                        <span class="badge ${badgeClass}" style="margin-bottom: 0;">
                            ${badgeText}
                        </span>
                    </div>

                    <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 8px; line-height: 1.4;">
                        ${escapeHtml(item.problemTitle || 'Bài tập toán')}
                    </h3>

                    <div style="font-size: 0.9rem; font-weight: 700; color: var(--primary); margin-bottom: 8px;">
                        🎯 Điểm AI: <span style="font-size: 1.05rem; font-weight: 900;">${scoreDisplay}</span>
                    </div>

                    <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px;">
                        <span>🕒 ${dateFormatted}</span>
                    </div>
                </div>

                <div style="border-top: 2px dashed var(--border-color, #cbd5e1); padding-top: 12px; margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;" 
                     onclick="event.stopPropagation()">
                    <a href="submit-detail.html?id=${item.id}" class="btn-primary" style="font-size: 0.8rem; padding: 6px 12px;">
                        Chi tiết
                    </a>
                    <a href="problem-detail.html?id=${item.problemId}" class="btn-secondary" style="font-size: 0.8rem; padding: 6px 12px;">
                        Xem đề
                    </a>
                    <a href="problem-detail.html?id=${item.problemId}&redo=true" class="btn-secondary" style="font-size: 0.8rem; padding: 6px 12px; background: #fef3c7;">
                        Làm lại
                    </a>
                </div>

            </div>
        `;
    }).join("");
}

function renderMetrics(item) {
    if (item.status === "processing") {
        return `<div class="processing-bar">🟡 Hệ thống AI đang chấm bài...</div>`;
    }
    if (item.status === "failed") {
        return `<div class="error-bar">🔴 Xử lý AI gặp sự cố</div>`;
    }

    const score = item.score !== undefined ? item.score : "--";
    const confidence = item.confidence ? `${item.confidence}%` : "--%";

    return `
        <div class="metric-box">
            <span class="metric-label">Điểm</span>
            <span class="metric-score ${score >= 8 ? 'high' : score >= 5 ? 'medium' : 'low'}">${score}</span>
        </div>
        <div class="metric-box">
            <span class="metric-label">Độ tin cậy AI</span>
            <span class="metric-confidence">${confidence}</span>
        </div>
    `;
}

// 5. HELPERS & UI STATES
function renderSkeletons() {
    let skeletonHtml = "";
    for (let i = 0; i < 8; i++) {
        skeletonHtml += `
            <div class="card submission-card skeleton-card">
                <div class="skeleton-thumb"></div>
                <div class="skeleton-body">
                    <div class="skeleton-line short"></div>
                    <div class="skeleton-line medium"></div>
                    <div class="skeleton-line full"></div>
                </div>
            </div>
        `;
    }
    elements.container.innerHTML = skeletonHtml;
}

function showEmptyState(show) {
    if (show) {
        elements.container.innerHTML = "";
        elements.emptyState.classList.remove("hidden");
    } else {
        elements.emptyState.classList.add("hidden");
    }
}
function getStatusBadge(status) {
    switch (status) {
        case "completed":
            return { badgeClass: "", badgeText: "🟢 Complete" };
        case "failed":
            return { badgeClass: "", badgeText: "🔴 AI Lỗi" };
        case "processing":
        default:
            return { badgeClass: "", badgeText: "🟡 Đang chấm..." };
    }
}

function getTypeLabel(type) {
    switch (type) {
        case "image": return "📷 Ảnh";
        case "text": return "✍️ Text";
        case "mixed": return "📦 Mixed";
        default: return "📄 Bài nộp";
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

window.reSubmit = function(submissionId) {
    alert(`Đã gửi yêu cầu chấm lại cho bài nộp ID: ${submissionId}`);
};