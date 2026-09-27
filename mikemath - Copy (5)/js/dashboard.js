// js/dashboard.js

import { auth, db } from "/js/firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    doc,
    getDoc,
    collection,
    getDocs,
    query,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import toast from "/components/toast.js";

// =========================
// Elements
// =========================

const usernameElement = document.getElementById("username");

const scoreElement = document.getElementById("score");

const streakElement = document.getElementById("streak");

const levelElement = document.getElementById("level");

const problemList = document.getElementById("problemList");

const leaderboard = document.getElementById("leaderboard");

const knowledgeList = document.getElementById("knowledgeList");

// =========================
// Init
// =========================

onAuthStateChanged(auth, async (user) => {

    if (!user) {

        window.location.href = "login.html";

        return;

    }

    try {

        await loadProfile(user.uid);

        await Promise.all([

            loadProblems(),

            loadLeaderboard(),

            loadKnowledge()

        ]);

    }

    catch (error) {

        console.error(error);

        toast.error("Không thể tải dữ liệu.");

    }

});

// =========================
// Profile
// =========================

async function loadProfile(uid) {

    const snapshot = await getDoc(
        doc(db, "users", uid)
    );

    if (!snapshot.exists()) {

        toast.error("Không tìm thấy hồ sơ.");

        return;

    }

const data = snapshot.data();

usernameElement.textContent =
    data.displayName ||
    data.username ||
    "";

const score =
    data.totalScore ??
    data.score ??
    0;

scoreElement.textContent =
    score.toLocaleString();

streakElement.textContent =
    data.streak ?? 0;

levelElement.textContent =
    "Lv." + (data.level ?? 1);

}

// =========================
// Problems
// =========================

async function loadProblems() {

    problemList.innerHTML = "";

    const q = query(

        collection(db, "problems"),

        orderBy("createdAt", "desc"),

        limit(10)

    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {

        problemList.innerHTML = `
            <div class="empty">
                Chưa có bài tập.
            </div>
        `;

        return;

    }

    snapshot.forEach(docSnap => {

        const data = docSnap.data();

        const card = document.createElement("div");

        card.className = "problem-card";

        card.innerHTML = `

            <h3>${data.title ?? ""}</h3>

            <p>${data.topic ?? ""}</p>

        `;

        card.addEventListener("click", () => {

            window.location.href =
                `problem-detail.html?id=${docSnap.id}`;

        });

        problemList.appendChild(card);

    });

}

// =========================
// Leaderboard
// =========================

async function loadLeaderboard() {

    leaderboard.innerHTML = "";

    const q = query(

        collection(db, "users"),

        orderBy("totalScore", "desc"),

        limit(10)

    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {

        leaderboard.innerHTML = `
            <li>Chưa có dữ liệu.</li>
        `;

        return;

    }

    let rank = 1;

    snapshot.forEach(docSnap => {

        const data = docSnap.data();

        const li = document.createElement("li");

        li.className = "leaderboard-item";

        if (docSnap.id === auth.currentUser?.uid) {
            li.classList.add("current-user");
        }

        li.innerHTML = `

            <span>

                ${rank}. ${escapeHtml(
                    data.username ||
                    data.displayName ||
                    "Người dùng"
                )}
                ${docSnap.id === auth.currentUser?.uid ? " (Bạn)" : ""}

            </span>

            <strong>

                ${(data.totalScore ?? 0).toLocaleString()} đ

            </strong>

        `;

        leaderboard.appendChild(li);

        rank++;

    });

}

// =========================
// Knowledge
// =========================

async function loadKnowledge() {

    knowledgeList.innerHTML = "";

    const snapshot = await getDocs(

        collection(db, "knowledge")

    );

    if (snapshot.empty) {

        knowledgeList.innerHTML = `
            <div class="empty">
                Chưa có dữ liệu.
            </div>
        `;

        return;

    }

    snapshot.forEach(docSnap => {

        const data = docSnap.data();

        const button = document.createElement("button");

        button.className = "knowledge-tag";

        button.textContent =
            data.name ?? "";

        button.addEventListener("click", () => {

            window.location.href =
                `knowledge.html?id=${docSnap.id}`;

        });

        knowledgeList.appendChild(button);

    });

}



function escapeHtml(str = "") {

    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}