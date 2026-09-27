// Cấu hình Cloudinary
const CLOUD_NAME = "dmxz0m1x3"; // Thay bằng Cloud Name của bạn
const UPLOAD_PRESET = "mikemath"; // Thay bằng Upload Preset unsigned của bạn

/**
 * Upload 1 file ảnh lên Cloudinary
 * @param {File} file 
 * @returns {Promise<Object>} Trả về thông tin file từ Cloudinary
 */
export async function uploadImage(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);

    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

    const response = await fetch(url, {
        method: "POST",
        body: formData
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Lỗi khi tải ảnh lên Cloudinary");
    }

    const data = await response.json();

    return {
        url: data.secure_url,
        publicId: data.public_id,
        width: data.width,
        height: data.height,
        format: data.format,
        bytes: data.bytes
    };
}

/**
 * Upload danh sách nhiều file ảnh song song
 * @param {File[]} files 
 * @returns {Promise<Array>} Danh sách các object chứa thông tin ảnh đã upload
 */
export async function uploadImages(files = []) {
    if (!files || files.length === 0) return [];
    
    // Upload song song tất cả các file
    const uploadPromises = files.map(file => uploadImage(file));
    return await Promise.all(uploadPromises);
}