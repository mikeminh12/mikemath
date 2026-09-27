/**
 * MIKE MATH - COURSE MANAGER
 * Quản lý đọc/ghi Khóa học (courses) và Bài học (courseLessons)
 * File: js/course-engine/course-manager.js
 */

import { db } from "../firebase.js";
import { 
    collection, 
    getDocs, 
    getDoc, 
    doc, 
    query, 
    where, 
    orderBy, 
    addDoc, 
    setDoc, 
    deleteDoc,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/**
 * Lấy danh sách các Khóa học công khai
 */
export async function fetchPublishedCourses() {
    try {
        const snap = await getDocs(collection(db, "courses"));
        if (snap.empty) {
            await seedSampleCourseIfEmpty();
            const snapRe = await getDocs(collection(db, "courses"));
            return snapRe.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error("Lỗi khi tải danh sách courses:", err);
        return getSampleFallbackCourses();
    }
}

/**
 * Lấy chi tiết Khóa học kèm danh sách Bài học (courseLessons) xếp theo thứ tự (order)
 */
export async function fetchCourseDetailAndLessons(courseId, userId = null) {
    if (!courseId) return null;

    try {
        let courseData;
        
        const cSnap = await getDoc(doc(db, "courses", courseId));
        if (!cSnap.exists()) {
            const fallbackList = getSampleFallbackCourses();
            courseData = fallbackList.find(c => c.id === courseId) || fallbackList[0];
        } else {
            courseData = { id: cSnap.id, ...cSnap.data() };
        }

        // Tải courseLessons gốc
        let lessons = [];
        try {
            const lessonsQuery = query(
                collection(db, "courseLessons"),
                where("courseId", "==", courseId)
            );
            const lessonsSnap = await getDocs(lessonsQuery);
            lessons = lessonsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.warn("Không đọc được collection courseLessons, dùng fallback:", e);
        }

        if (lessons.length === 0 && Array.isArray(courseData.lessons)) {
            lessons = [...courseData.lessons];
        }

        // Đọc customLessons cá nhân hóa do AI khởi tạo trong userCourseState của user đó từ Firestore
        if (userId) {
            try {
                const stateSnap = await getDoc(doc(db, "userCourseState", `${userId}_${courseId}`));
                if (stateSnap.exists()) {
                    const stateData = stateSnap.data();
                    if (Array.isArray(stateData.customLessons) && stateData.customLessons.length > 0) {
                        for (const customL of stateData.customLessons) {
                            if (!lessons.some(l => l.id === customL.id)) {
                                lessons.push(customL);
                            }
                        }
                    }
                }
            } catch (uErr) {
                console.warn("Không đọc được customLessons từ userCourseState:", uErr);
            }
        }

        // Sắp xếp thứ tự bài học (gốc + bài củng cố AI chèn vào)
        lessons.sort((a, b) => (a.order || 0) - (b.order || 0));

        return {
            ...courseData,
            lessons: lessons
        };
    } catch (err) {
        console.error("Lỗi khi tải courseLessons:", err);
        const fallbackList = getSampleFallbackCourses();
        return fallbackList.find(c => c.id === courseId) || fallbackList[0];
    }
}

/**
 * Mẫu Khóa học mặc định phục vụ khởi tạo & thử nghiệm
 */
export function getSampleFallbackCourses() {
    return [
        {
            id: "course_algebra_fraction_01",
            title: "Phân Thức Đại Số & Rút Gọn",
            description: "Lộ trình chuẩn thích ứng giúp làm chủ các phép toán phân thức, điều kiện xác định và phương trình chứa ẩn ở mẫu.",
            grade: 8,
            topicId: "Đại số",
            level: "Cơ bản đến Nâng cao",
            thumbnail: "assets/images/non.png",
            estimatedMinutes: 120,
            published: true,
            units: [
                {
                    id: "unit_1",
                    title: "Chương 1: Khái Niệm & Phép Biến Đổi",
                    description: "Nắm vững định nghĩa, điều kiện xác định và rút gọn phân thức"
                },
                {
                    id: "unit_2",
                    title: "Chương 2: Phép Tính & Phương Trình",
                    description: "Cộng, trừ, nhân, chia và giải phương trình chứa ẩn ở mẫu"
                }
            ],
            lessons: [
                {
                    id: "lesson_frac_1",
                    courseId: "course_algebra_fraction_01",
                    unitId: "unit_1",
                    title: "1. Khái niệm Phân thức Đại số & ĐKXĐ",
                    description: "Hiểu thế nào là một phân thức đại số A/B và tìm điều kiện để mẫu thức B ≠ 0.",
                    knowledgeId: "knowledge_fraction_intro",
                    order: 1,
                    required: true,
                    estimatedMinutes: 15,
                    icon: "📘"
                },
                {
                    id: "lesson_frac_2",
                    courseId: "course_algebra_fraction_01",
                    unitId: "unit_1",
                    title: "2. Rút gọn Phân thức & Quy đồng Mẫu thức",
                    description: "Áp dụng tính chất cơ bản để rút gọn và đưa các phân thức về cùng mẫu thức.",
                    knowledgeId: "knowledge_fraction_simplify",
                    order: 2,
                    required: true,
                    estimatedMinutes: 20,
                    icon: "✂️"
                },
                {
                    id: "lesson_frac_3",
                    courseId: "course_algebra_fraction_01",
                    unitId: "unit_1",
                    title: "3. Phép Cộng & Phép Trừ Phân thức",
                    description: "Cộng trừ các phân thức cùng mẫu và khác mẫu thức.",
                    knowledgeId: "knowledge_fraction_addition",
                    order: 3,
                    required: true,
                    estimatedMinutes: 20,
                    icon: "➕"
                },
                {
                    id: "lesson_frac_4",
                    courseId: "course_algebra_fraction_01",
                    unitId: "unit_2",
                    title: "4. Phép Nhân & Phép Chia Phân thức",
                    description: "Nhân phân thức với phân thức và chia phân thức bằng cách nhân nghịch đảo.",
                    knowledgeId: "knowledge_fraction_multiplication",
                    order: 4,
                    required: true,
                    estimatedMinutes: 20,
                    icon: "✖️"
                },
                {
                    id: "lesson_frac_5",
                    courseId: "course_algebra_fraction_01",
                    unitId: "unit_2",
                    title: "5. Phương trình Chứa ẩn ở Mẫu",
                    description: "Các bước tìm ĐKXĐ, quy đồng, khử mẫu và đối chiếu điều kiện để tìm nghiệm.",
                    knowledgeId: "knowledge_fraction_equation",
                    order: 5,
                    required: true,
                    estimatedMinutes: 25,
                    icon: "⚖️"
                },
                {
                    id: "lesson_frac_6",
                    courseId: "course_algebra_fraction_01",
                    unitId: "unit_2",
                    title: "6. Ôn tập & Bài tập Tổng hợp Chuyên sâu",
                    description: "Thử thách vận dụng tổng hợp toàn bộ chương phân thức đại số.",
                    knowledgeId: "knowledge_fraction_mastery",
                    order: 6,
                    required: true,
                    estimatedMinutes: 25,
                    icon: "🏆"
                }
            ]
        },
        {
            id: "course_geometry_pythagoras_02",
            title: "Hình Học: Tam Giác & Định Lý Pythagore",
            description: "Khám phá hình học trực quan, định lý Pythagore và ứng dụng tính độ dài cạnh trong tam giác vuông.",
            grade: 8,
            topicId: "Hình học",
            level: "Cơ bản",
            thumbnail: "assets/images/non.png",
            estimatedMinutes: 90,
            published: true,
            units: [
                {
                    id: "unit_geom_1",
                    title: "Chương 1: Tam Giác Vuông & Bất Đẳng Thức",
                    description: "Các tính chất góc, cạnh và khoảng cách trong tam giác"
                }
            ],
            lessons: [
                {
                    id: "lesson_geom_1",
                    courseId: "course_geometry_pythagoras_02",
                    unitId: "unit_geom_1",
                    title: "1. Tổng Các Góc Trong Tam Giác & Tam Giác Vuông",
                    description: "Tính số đo góc còn lại và nhận biết các trường hợp bằng nhau của tam giác vuông.",
                    knowledgeId: "knowledge_triangle_angles",
                    order: 1,
                    required: true,
                    estimatedMinutes: 20,
                    icon: "📐"
                },
                {
                    id: "lesson_geom_2",
                    courseId: "course_geometry_pythagoras_02",
                    unitId: "unit_geom_1",
                    title: "2. Định lý Pythagore Thuận & Đảo",
                    description: "Công thức $a^2 + b^2 = c^2$ trong tam giác vuông và cách chứng minh tam giác vuông.",
                    knowledgeId: "knowledge_pythagoras",
                    order: 2,
                    required: true,
                    estimatedMinutes: 25,
                    icon: "🔺"
                },
                {
                    id: "lesson_geom_3",
                    courseId: "course_geometry_pythagoras_02",
                    unitId: "unit_geom_1",
                    title: "3. Ứng dụng Thực tế & Bài tập Tổng hợp",
                    description: "Giải bài toán thực tế tính khoảng cách, chiều cao bằng định lý Pythagore.",
                    knowledgeId: "knowledge_pythagoras_app",
                    order: 3,
                    required: true,
                    estimatedMinutes: 25,
                    icon: "🎯"
                }
            ]
        }
    ];
}

/**
 * Seed dữ liệu mẫu Khóa học vào Firestore nếu Firestore chưa có dữ liệu
 */
export async function seedSampleCourseIfEmpty() {
    try {
        const sampleCourses = getSampleFallbackCourses();
        for (const course of sampleCourses) {
            const courseRef = doc(db, "courses", course.id);
            const snap = await getDoc(courseRef);
            if (!snap.exists()) {
                const { lessons, ...courseMeta } = course;
                await setDoc(courseRef, {
                    ...courseMeta,
                    createdAt: serverTimestamp()
                });

                for (const lesson of lessons) {
                    const lessonRef = doc(db, "courseLessons", lesson.id);
                    await setDoc(lessonRef, {
                        ...lesson,
                        createdAt: serverTimestamp()
                    });
                }
            }
        }
    } catch (e) {
        console.warn("Lỗi khi seed dữ liệu khóa học mẫu:", e);
    }
}

/**
 * Lấy tất cả khóa học cho trang Admin (bao gồm cả draft/chưa xuất bản)
 */
export async function fetchAllCoursesAdmin() {
    try {
        const snap = await getDocs(collection(db, "courses"));
        if (snap.empty) {
            await seedSampleCourseIfEmpty();
            const snapRe = await getDocs(collection(db, "courses"));
            return snapRe.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error("Lỗi khi tải danh sách courses cho admin:", err);
        return getSampleFallbackCourses();
    }
}

/**
 * Tạo hoặc cập nhật thông tin Khóa học
 */
export async function saveCourse(courseData) {
    try {
        const { id, ...data } = courseData;
        const payload = {
            ...data,
            grade: Number(data.grade) || 8,
            estimatedMinutes: Number(data.estimatedMinutes) || 60,
            published: Boolean(data.published),
            updatedAt: serverTimestamp()
        };

        if (id) {
            const ref = doc(db, "courses", id);
            await setDoc(ref, payload, { merge: true });
            return id;
        } else {
            payload.createdAt = serverTimestamp();
            const ref = await addDoc(collection(db, "courses"), payload);
            return ref.id;
        }
    } catch (err) {
        console.error("Lỗi khi lưu khóa học:", err);
        throw err;
    }
}

/**
 * Xóa Khóa học và toàn bộ Bài học tương ứng
 */
export async function deleteCourse(courseId) {
    if (!courseId) return;
    try {
        // Xóa document khóa học
        await deleteDoc(doc(db, "courses", courseId));

        // Xóa tất cả lessons thuộc về course này
        const q = query(collection(db, "courseLessons"), where("courseId", "==", courseId));
        const snap = await getDocs(q);
        const deletePromises = snap.docs.map(d => deleteDoc(doc(db, "courseLessons", d.id)));
        await Promise.all(deletePromises);
    } catch (err) {
        console.error("Lỗi khi xóa khóa học:", err);
        throw err;
    }
}

/**
 * Tạo hoặc cập nhật Bài học trong lộ trình
 */
export async function saveCourseLesson(lessonData) {
    try {
        const { id, ...data } = lessonData;
        const payload = {
            ...data,
            order: Number(data.order) || 1,
            estimatedMinutes: Number(data.estimatedMinutes) || 15,
            required: data.required !== false,
            updatedAt: serverTimestamp()
        };

        if (id) {
            const ref = doc(db, "courseLessons", id);
            await setDoc(ref, payload, { merge: true });
            return id;
        } else {
            payload.createdAt = serverTimestamp();
            const ref = await addDoc(collection(db, "courseLessons"), payload);
            return ref.id;
        }
    } catch (err) {
        console.error("Lỗi khi lưu bài học:", err);
        throw err;
    }
}

/**
 * Xóa một bài học
 */
export async function deleteCourseLesson(lessonId) {
    if (!lessonId) return;
    try {
        await deleteDoc(doc(db, "courseLessons", lessonId));
    } catch (err) {
        console.error("Lỗi khi xóa bài học:", err);
        throw err;
    }
}

/**
 * Lấy danh sách Bài viết từ Kho kiến thức (knowledgeArticles & knowledge) để làm dropdown chọn trong bài học
 */
export async function fetchKnowledgeArticlesList() {
    try {
        const snap = await getDocs(collection(db, "knowledgeArticles"));
        const articles = snap.docs.map(d => ({
            id: d.id,
            title: d.data().title || d.id,
            summary: d.data().summary || "",
            slug: d.data().slug || ""
        }));

        // Nếu trống, thử đọc collection legacy "knowledge"
        if (articles.length === 0) {
            const legacySnap = await getDocs(collection(db, "knowledge"));
            return legacySnap.docs.map(d => ({
                id: d.id,
                title: d.data().title || d.id,
                summary: d.data().summary || "",
                slug: d.data().slug || ""
            }));
        }
        return articles;
    } catch (err) {
        console.error("Lỗi khi tải danh sách kho kiến thức:", err);
        return [];
    }
}

