// js/problems/render-list.js

import { state } from "./state.js";

const container = document.getElementById("listView");
const resultCount = document.getElementById("resultCount");

export function renderList() {

    console.log("Problems", state.problems);
    console.log("Filtered", state.filteredProblems);
    console.log("Current", state.currentProblems);
    if (!container) return;

    container.innerHTML = "";

    resultCount.textContent =
        `${state.filteredProblems.length} bài tập`;

    if (state.currentProblems.length === 0) {

        container.innerHTML = `
            <div class="empty-state card">

                <h3>Không tìm thấy bài tập</h3>

                <p>
                    Hãy thử thay đổi từ khóa hoặc bộ lọc.
                </p>

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

    card.className = "problem-list-card card";

    card.innerHTML = `

        <div class="problem-list-header">

            <div>

                <h3 class="problem-title">

                    ${problem.title ?? "Chưa có tiêu đề"}

                </h3>

                <div class="problem-meta">

                    <span>Lớp ${problem.grade ?? "-"}</span>

                    <span>${problem.topic ?? "-"}</span>

                    <span>${difficultyText(problem.difficulty)}</span>

                </div>

            </div>

        </div>

        <div class="problem-description">

            ${shortText(problem.description)}

        </div>

        <div class="problem-footer">

            <div class="problem-author">

                👤 ${problem.authorName ?? "Ẩn danh"}

            </div>

            <div class="problem-stats">

                <span>👍 ${problem.likes ?? 0}</span>

                <span>💬 ${problem.comments ?? 0}</span>

                <span>👁 ${problem.views ?? 0}</span>

            </div>

            <button class="btn-primary">

                Làm bài

            </button>

        </div>

    `;

    card.querySelector("button").addEventListener("click", () => {

        window.location.href =
            `problem.html?id=${problem.id}`;

    });

    return card;

}

function shortText(text = "") {

    if (text.length <= 150) {

        return text;

    }

    return text.substring(0, 150) + "...";

}

function difficultyText(level) {

    switch (level) {

        case "easy":
            return "🟢 Dễ";

        case "medium":
            return "🟡 Trung bình";

        case "hard":
            return "🔴 Khó";

        default:
            return "Không xác định";

    }

}