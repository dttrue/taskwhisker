// src/lib/cloudinary.js
export function uploadImage(file, { folder }) {
  return cloudinary.uploader.upload(file, {
    folder,
  });
}
