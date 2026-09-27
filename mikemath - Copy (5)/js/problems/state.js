// js/problems/state.js

export const state = {

    // =========================
    // Dữ liệu
    // =========================

    problems: [],

    filteredProblems: [],

    currentProblems: [],

    // =========================
    // Pagination
    // =========================

    currentPage: 1,

    pageSize: 10,

    totalPages: 1,

    // =========================
    // View
    // =========================

    view: "list", // list | post

    // =========================
    // Search
    // =========================

    keyword: "",

    // =========================
    // Filters
    // =========================

    grade: "",

    topic: "",

    difficulty: "",

    sort: "newest", // newest | oldest | popular

    // =========================
    // Loading
    // =========================

    loading: false,

    // =========================
    // Error
    // =========================

    error: null

};



export function setProblems(problems) {

    state.problems = problems;

}

export function setFilteredProblems(problems) {

    state.filteredProblems = problems;

}

export function setCurrentProblems(problems) {

    state.currentProblems = problems;

}

export function setCurrentPage(page) {

    state.currentPage = page;

}

export function setView(view) {

    state.view = view;

}