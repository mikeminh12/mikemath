/**
 * MIKE MATH - ADAPTIVE ENGINE
 * Quản lý trạng thái học thích ứng (userCourseState) & Priority Queue củng cố điểm yếu
 * Nguyên tắc: Không sửa Course gốc, chỉ tạo Adaptive State riêng cho từng User
 * File: js/course-engine/adaptive-engine.js
 */

import { db } from "../firebase.js";
import { 
    doc, 
    getDoc, 
    setDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { recordKnowledgeAttempt, getUserKnowledgeItem } from "./learning-profile.js";
import { MASTERY_GATE_THRESHOLD } from "./mastery-engine.js";

/**
 * Lấy hoặc khởi tạo trạng thái lộ trình cá nhân của User đối với 1 Khóa học
 */
export async function getUserCourseState(userId, courseId, defaultLessons = []) {
    if (!userId || !courseId) return null;

    const docId = `${userId}_${courseId}`;
    try {
        const docRef = doc(db, "userCourseState", docId);
        const snap = await getDoc(docRef);

        if (snap.exists()) {
            return { id: snap.id, ...snap.data() };
        }

        const firstLessonId = defaultLessons.length > 0 ? defaultLessons[0].id : null;
        const newState = {
            userId,
            courseId,
            currentLessonId: firstLessonId,
            completedLessons: [],
            masteredLessons: [],
            adaptiveQueue: [], // Hàng chờ củng cố cá nhân hóa do AI phát hiện
            lastActiveAt: serverTimestamp()
        };

        await setDoc(docRef, newState);
        return newState;

    } catch (err) {
        console.error("Lỗi khi đọc userCourseState:", err);
        return {
            userId,
            courseId,
            currentLessonId: defaultLessons[0]?.id || null,
            completedLessons: [],
            masteredLessons: [],
            adaptiveQueue: []
        };
    }
}

import { generateRemedialLesson } from "../ai.js";

/**
 * Đánh giá kết quả sau lượt học / làm bài của Học sinh tại 1 Lesson
 * Xử lý Mastery Gate: 
 * - Nếu >= 80% -> Unlock lesson tiếp theo;
 * - Nếu < 80% -> AI đọc nội dung sai, tự động sinh BÀI HỌC CỦNG CỐ MỚI (Remedial Lesson) và CHÈN VÀO lộ trình riêng của user lưu vào Firestore!
 */
export async function processLessonEvaluation(userId, courseId, lesson, score = 0, allLessons = [], aiMistakes = [], studentSolution = "", courseTitle = "") {
    if (!userId || !courseId || !lesson) return { success: false };

    const isPassed = score >= MASTERY_GATE_THRESHOLD;
    const knowledgeId = lesson.knowledgeId || `knowledge_${lesson.id}`;

    // Determine primary error category from AI mistakes or fallback
    const primaryErrorType = aiMistakes.length > 0 ? (aiMistakes[0].type || "procedural") : "PROCEDURE_ERROR";

    // 1. Cập nhật profile năng lực userKnowledge
    const updatedKnowledge = await recordKnowledgeAttempt(
        userId, 
        knowledgeId, 
        isPassed, 
        isPassed ? null : primaryErrorType, 
        "course"
    );

    // 2. Đọc userCourseState
    const currentState = await getUserCourseState(userId, courseId, allLessons);
    const completedLessons = Array.isArray(currentState.completedLessons) ? [...currentState.completedLessons] : [];
    const masteredLessons = Array.isArray(currentState.masteredLessons) ? [...currentState.masteredLessons] : [];
    let adaptiveQueue = Array.isArray(currentState.adaptiveQueue) ? [...currentState.adaptiveQueue] : [];
    let customLessons = Array.isArray(currentState.customLessons) ? [...currentState.customLessons] : [];

    let nextLessonId = currentState.currentLessonId;
    let message = "";
    let generatedRemedialLesson = null;

    if (isPassed) {
        // Đạt ngưỡng Mastery Gate (>= 80%)
        if (!completedLessons.includes(lesson.id)) completedLessons.push(lesson.id);
        if (!masteredLessons.includes(lesson.id)) masteredLessons.push(lesson.id);

        // Nếu bài này là bài củng cố AI -> Đánh dấu mở khóa cả bài gốc
        if (lesson.parentLessonId) {
            if (!completedLessons.includes(lesson.parentLessonId)) completedLessons.push(lesson.parentLessonId);
            if (!masteredLessons.includes(lesson.parentLessonId)) masteredLessons.push(lesson.parentLessonId);
        }

        // Xóa khỏi hàng chờ củng cố
        adaptiveQueue = adaptiveQueue.filter(item => 
            item.lessonId !== lesson.id && 
            item.knowledgeId !== knowledgeId &&
            item.parentLessonId !== (lesson.parentLessonId || lesson.id)
        );

        // Tìm bài học tiếp theo trong lộ trình (bao gồm bài học đã gộp)
        const currentIndex = allLessons.findIndex(l => l.id === lesson.id);
        if (currentIndex !== -1 && currentIndex < allLessons.length - 1) {
            nextLessonId = allLessons[currentIndex + 1].id;
        }

        message = `🎉 Tuyệt vời! Bạn đã đạt ${score}% thành thạo và mở khóa bài tiếp theo!`;

    } else {
        // Không đạt ngưỡng (< 80%) -> AI ĐỌC NỘI DUNG SAI VÀ TỰ TẠO / CẬP NHẬT BÀI HỌC CỦNG CỐ TRONG FIRESTORE
        try {
            console.log("🤖 AI đang tự tạo / cập nhật bài học củng cố cá nhân hóa cho học sinh...");
            const aiRemedialData = await generateRemedialLesson({
                lesson,
                mistakes: aiMistakes,
                studentSolution,
                score,
                courseTitle
            });

            // Xác định bài học gốc (parentLessonId) để tránh tạo trùng lặp nhiều bài học củng cố giống nhau
            const targetParentId = lesson.parentLessonId || lesson.id;
            
            // Tìm bài học củng cố đã tồn tại trước đó cho bài học này trong customLessons
            const existingIndex = customLessons.findIndex(cl => 
                cl.parentLessonId === targetParentId || 
                cl.id === lesson.id ||
                cl.id === `remedial_${targetParentId}`
            );

            const remedialId = existingIndex !== -1 ? customLessons[existingIndex].id : `remedial_${targetParentId}`;
            const remedialOrder = existingIndex !== -1 ? (customLessons[existingIndex].order || ((lesson.order || 1) + 0.1)) : ((lesson.order || 1) + 0.1);

            generatedRemedialLesson = {
                id: remedialId,
                courseId: courseId,
                parentLessonId: targetParentId,
                unitId: lesson.unitId || "unit_1",
                title: aiRemedialData.title || `⚡ Bài Củng Cố AI: Sửa Lỗi "${lesson.title}"`,
                description: aiRemedialData.description || `Bài học củng cố cá nhân hóa do AI khởi tạo để chữa lỗi bài ${lesson.title}`,
                customContent: aiRemedialData.customContent || "",
                problem: aiRemedialData.problem || null,
                problemId: aiRemedialData.problem ? `prob_${remedialId}` : null,
                knowledgeId: knowledgeId,
                order: remedialOrder,
                estimatedMinutes: 10,
                icon: "🤖",
                isAiGenerated: true,
                updatedAt: new Date().toISOString(),
                createdAt: existingIndex !== -1 ? (customLessons[existingIndex].createdAt || new Date().toISOString()) : new Date().toISOString()
            };

            if (existingIndex !== -1) {
                // Cập nhật đè lên bài học củng cố hiện có (tránh tạo mới nhiều bài trùng lặp)
                customLessons[existingIndex] = generatedRemedialLesson;
            } else {
                // Thêm mới nếu chưa có bài củng cố nào cho bài học gốc này
                customLessons.push(generatedRemedialLesson);
            }

            // Lọc trùng lặp customLessons theo ID và parentLessonId
            const uniqueCustomLessonsMap = new Map();
            customLessons.forEach(cl => {
                const key = cl.parentLessonId || cl.id;
                uniqueCustomLessonsMap.set(key, cl);
            });
            customLessons = Array.from(uniqueCustomLessonsMap.values());

            // Chuyển currentLessonId sang bài học củng cố vừa được AI tạo ra/cập nhật!
            nextLessonId = remedialId;

            const mistakeReason = aiMistakes.length > 0 
                ? aiMistakes.map(m => `[${m.type || 'lỗi'}]: ${m.description}`).join('; ')
                : `Bài làm (${score}%) chưa đạt ngưỡng 80%`;

            adaptiveQueue = adaptiveQueue.filter(item => item.lessonId !== remedialId && item.parentLessonId !== targetParentId);

            adaptiveQueue.unshift({
                id: `reinforce_${targetParentId}`,
                lessonId: remedialId,
                parentLessonId: targetParentId,
                knowledgeId: knowledgeId,
                title: generatedRemedialLesson.title,
                reason: mistakeReason,
                priority: Math.min(100, Math.max(50, 100 - score)),
                targetMastery: MASTERY_GATE_THRESHOLD,
                createdAt: new Date().toISOString()
            });

            message = `🤖 AI đã phân tích nội dung sai và cập nhật bài học củng cố cá nhân hóa trong khóa học của bạn!`;

        } catch (genErr) {
            console.error("Lỗi khi sinh bài học củng cố từ AI:", genErr);
            message = `⚠️ Bạn đạt ${score}%. Hãy ôn tập kỹ lại lý thuyết và thử làm lại!`;
        }
    }

    const updatedState = {
        ...currentState,
        completedLessons,
        masteredLessons,
        currentLessonId: nextLessonId,
        adaptiveQueue,
        customLessons,
        lastActiveAt: serverTimestamp()
    };

    try {
        const docRef = doc(db, "userCourseState", `${userId}_${courseId}`);
        await setDoc(docRef, updatedState, { merge: true });
    } catch (e) {
        console.error("Lỗi lưu userCourseState vào Firestore:", e);
    }

    return {
        success: true,
        isPassed,
        score,
        message,
        nextLessonId,
        remedialLesson: generatedRemedialLesson,
        adaptiveQueue,
        updatedKnowledge,
        userCourseState: updatedState
    };
}
