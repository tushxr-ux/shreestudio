const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'previews');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const EXT = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = EXT[file.mimetype] || path.extname(file.originalname).toLowerCase() || '.mp4';
    cb(null, Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + ext);
  },
});

const uploadPreview = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) return cb(null, true);
    cb(new Error('Preview must be an MP4, WebM, or MOV video.'));
  },
}).single('previewVideo');

function handlePreviewUpload(req, res, next) {
  uploadPreview(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      err.message = 'Preview video must be 80MB or smaller.';
    }
    err.status = 400;
    next(err);
  });
}

function publicPreviewUrl(filename) {
  return '/uploads/previews/' + filename;
}

function removePreviewFile(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('/uploads/previews/')) return;
  const file = path.join(__dirname, '..', 'public', url.replace(/^\//, ''));
  fs.promises.unlink(file).catch(() => {});
}

module.exports = { handlePreviewUpload, publicPreviewUrl, removePreviewFile };
