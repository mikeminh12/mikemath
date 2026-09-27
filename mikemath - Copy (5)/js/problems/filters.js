// js/problems/filters.js

import { state } from "./state.js";

export function applyFilters() {

    let problems = [...state.problems];

    // Tìm kiếm
    if (state.keyword) {

        const keyword = state.keyword.toLowerCase();

        problems = problems.filter(problem => {
            const title = typeof problem.title === "string" ? problem.title.toLowerCase() : "";
            
            let contentStr = "";
            if (typeof problem.contentText === "string") {
                contentStr = problem.contentText;
            } else if (typeof problem.contentHtml === "string") {
                contentStr = problem.contentHtml;
            } else if (typeof problem.content === "string") {
                contentStr = problem.content;
            } else if (typeof problem.content === "object" && problem.content !== null) {
                try {
                    contentStr = JSON.stringify(problem.content);
                } catch (e) {
                    contentStr = "";
                }
            }
            const content = contentStr.toLowerCase();

            return title.includes(keyword) || content.includes(keyword);
        });

    }

    // Lọc theo lớp
    if (state.grade) {

        problems = problems.filter(problem =>
            problem.grade === state.grade
        );

    }

    // Lọc theo chủ đề
    if (state.topic) {

        problems = problems.filter(problem =>
            problem.topic === state.topic
        );

    }

    // Lọc theo độ khó
    if (state.difficulty) {

        problems = problems.filter(problem =>
            problem.difficulty === state.difficulty
        );

    }

    // Sắp xếp
    switch (state.sort) {

        case "oldest":

            problems.sort((a, b) => {

                const timeA = a.createdAt?.seconds || 0;
                const timeB = b.createdAt?.seconds || 0;

                return timeA - timeB;

            });

            break;

        case "popular":

            problems.sort((a, b) =>
                (b.views || 0) - (a.views || 0)
            );

            break;

        case "newest":
        default:

            problems.sort((a, b) => {

                const timeA = a.createdAt?.seconds || 0;
                const timeB = b.createdAt?.seconds || 0;

                return timeB - timeA;

            });

            break;

    }

    state.filteredProblems = problems;

}