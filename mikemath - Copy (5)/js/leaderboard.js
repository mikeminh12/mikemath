/**
 * leaderboard.js - MikeMath Leaderboard Handler
 * Runtime: ES Module / Browser
 */

import { db, auth } from "./firebase.js";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// DOM Elements
const podiumContainer = document.getElementById("podiumContainer");
const boardList = document.getElementById("boardList");
const loadingBox = document.getElementById("loadingBox");
const emptyBox = document.getElementById("emptyBox");

let currentUserId = null;

// Khởi chạy ứng dụng
document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUserId = user.uid;
    }
    loadLeaderboard();
  });
});

/**
 * Tải danh sách người dùng từ Firestore sắp xếp theo totalScore
 */
async function loadLeaderboard() {
  try {
    // Lấy TOP 50 người dùng có tổng điểm cao nhất
    const q = query(
      collection(db, "users"),
      orderBy("totalScore", "desc"),
      limit(50)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      showState("empty");
      return;
    }

    const leaderboardData = snapshot.docs.map((docSnap) => ({
      uid: docSnap.id,
      ...docSnap.data()
    }));

    renderLeaderboard(leaderboardData);
    showState("data");

  } catch (error) {
    console.error("Lỗi khi tải Bảng xếp hạng:", error);
    showState("empty");
  }
}

/**
 * Hiển thị dữ liệu Podium TOP 3 & Danh sách người chơi
 */
function renderLeaderboard(list) {
  // 1. Render Podium (TOP 3)
  const top3 = list.slice(0, 3);
  if (top3.length > 0) {
    podiumContainer.style.display = "flex";
    podiumContainer.innerHTML = "";

    // Sắp xếp thứ tự hiển thị bệ đứng: Top 2 -> Top 1 -> Top 3
    const podiumOrder = [];
    if (top3[1]) podiumOrder.push({ data: top3[1], rank: 2 });
    if (top3[0]) podiumOrder.push({ data: top3[0], rank: 1 });
    if (top3[2]) podiumOrder.push({ data: top3[2], rank: 3 });

    podiumOrder.forEach((item) => {
      const user = item.data;
      const rank = item.rank;
      const avatarUrl = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || user.displayName || 'U')}&background=random`;

      const card = document.createElement("div");
      card.className = `podium-card rank-${rank}`;
      card.innerHTML = `
        <div class="crown-icon"><i class="fa-solid fa-crown"></i></div>
        <img class="podium-avatar" src="${avatarUrl}" alt="Avatar" />
        <div class="username" title="${escapeHtml(user.username || user.displayName)}">
          ${escapeHtml(user.username || user.displayName || "Người dùng")}
        </div>
        <div class="score-badge">${user.totalScore || 0} <small style="font-size:0.75rem;">đ</small></div>
      `;
      podiumContainer.appendChild(card);
    });
  } else {
    podiumContainer.style.display = "none";
  }

  // 2. Render Danh sách bảng xếp hạng (Hạng 4 trở đi)
  const restList = list.slice(3);
  boardList.innerHTML = "";

  if (restList.length === 0 && top3.length <= 3) {
    // Nếu chỉ có từ 1-3 người thì chỉ hiện Podium
    return;
  }

  restList.forEach((user, index) => {
    const actualRank = index + 4;
    const isMe = currentUserId && user.uid === currentUserId;
    const avatarUrl = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || user.displayName || 'U')}&background=random`;

    const row = document.createElement("div");
    row.className = `board-item ${isMe ? "current-user-highlight" : ""}`;
    row.innerHTML = `
      <div class="item-rank">#${actualRank}</div>
      <div class="item-user">
        <img class="item-avatar" src="${avatarUrl}" alt="Avatar" />
        <span class="item-name">${escapeHtml(user.username || user.displayName || "Người dùng")} ${isMe ? "(Bạn)" : ""}</span>
      </div>
      <div class="item-score">${user.totalScore || 0} đ</div>
    `;
    boardList.appendChild(row);
  });
}

function showState(state) {
  if (state === "loading") {
    loadingBox.style.display = "block";
    boardList.style.display = "none";
    emptyBox.style.display = "none";
  } else if (state === "data") {
    loadingBox.style.display = "none";
    boardList.style.display = "block";
    emptyBox.style.display = "none";
  } else {
    loadingBox.style.display = "none";
    boardList.style.display = "none";
    emptyBox.style.display = "block";
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