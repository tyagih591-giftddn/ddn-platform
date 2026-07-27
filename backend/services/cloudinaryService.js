const cloudinary = require("../config/cloudinary");

const uploadBufferToCloudinary = ({
  buffer,
  folder,
  publicId
}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "image",
        overwrite: true,
        unique_filename: false,
        transformation: [
          {
            width: 1600,
            height: 1600,
            crop: "limit",
            quality: "auto:good",
            fetch_format: "jpg"
          }
        ]
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        resolve(result);
      }
    );

    uploadStream.end(buffer);
  });
};

module.exports = {
  uploadBufferToCloudinary
};