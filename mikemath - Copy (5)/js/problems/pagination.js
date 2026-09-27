// js/problems/pagination.js

import { state } from "./state.js";

const container = document.getElementById("pagination");

export function paginate() {

    const total = state.filteredProblems.length;

    state.totalPages = Math.max(
        1,
        Math.ceil(total / state.pageSize)
    );

    if (state.currentPage > state.totalPages) {
        state.currentPage = state.totalPages;
    }

    if (state.currentPage < 1) {
        state.currentPage = 1;
    }

    const start = (state.currentPage - 1) * state.pageSize;

    const end = start + state.pageSize;

    state.currentProblems = state.filteredProblems.slice(start, end);

}

export function renderPagination(refreshCallback = null) {

    if (!container) return;

    container.innerHTML = "";

    if (state.totalPages <= 1) return;

    // Previous

    const prev = document.createElement("button");

    prev.textContent = "‹";

    prev.disabled = state.currentPage === 1;

    prev.onclick = () => {

        state.currentPage--;

        paginate();

        refreshCallback?.();

    };

    container.appendChild(prev);

    // Pages

    for (let i = 1; i <= state.totalPages; i++) {

        const button = document.createElement("button");

        button.textContent = i;

        if (i === state.currentPage) {
            button.classList.add("active");
        }

        button.onclick = () => {

            state.currentPage = i;

            paginate();

            refreshCallback?.();

        };

        container.appendChild(button);

    }

    // Next

    const next = document.createElement("button");

    next.textContent = "›";

    next.disabled = state.currentPage === state.totalPages;

    next.onclick = () => {

        state.currentPage++;

        paginate();

        refreshCallback?.();

    };

    container.appendChild(next);

}