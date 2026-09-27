// js/problems/service.js

import { db } from "../firebase.js";

import {
    collection,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
    state,
    setProblems
} from "./state.js";

// =========================
// Collection
// =========================

const problemsCollection = collection(db, "problems");

// =========================
// Load All Problems
// =========================

export async function loadProblems() {

    const q = query(
        problemsCollection,
        orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);

    const problems = [];

    snapshot.forEach(document => {
        const data = document.data();
        if (!data.deleted && !data.hidden && data.visibility !== "onlycourse") {
            problems.push({
                id: document.id,
                ...data
            });
        }
    });

    setProblems(problems);

    return problems;

}

// =========================
// Get Problem
// =========================

export async function getProblem(id) {

    const snapshot = await getDoc(

        doc(db, "problems", id)

    );

    if (!snapshot.exists()) {

        return null;

    }

    return {

        id: snapshot.id,

        ...snapshot.data()

    };

}

// =========================
// Create Problem
// =========================

export async function createProblem(problem) {

    return await addDoc(

        problemsCollection,

        {

            ...problem,

            createdAt: serverTimestamp(),

            updatedAt: serverTimestamp()

        }

    );

}

// =========================
// Update Problem
// =========================

export async function updateProblem(id, data) {

    await updateDoc(

        doc(db, "problems", id),

        {

            ...data,

            updatedAt: serverTimestamp()

        }

    );

}

// =========================
// Delete Problem
// =========================

export async function deleteProblem(id) {

    await deleteDoc(

        doc(db, "problems", id)

    );

}

// =========================
// Reload
// =========================

export async function reloadProblems() {

    return await loadProblems();

}