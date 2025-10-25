js
// routes/files.js
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

const FileMeta = require('../models/FileMeta');

const router = express.Router();

const STORAGE_TYPE = (process.env.STORAGE_TYPE || 'local').toLowerCase();
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_BYTES || '200000000', 10);

// configure multer
let upload;
if (STORAGE_TYPE === 'local') {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `${unique}-${file.originalname}`);
    }
  });
  upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE } });
} else {
  // gridfs: use memory storage, then stream into GridFS
  upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });
}

// helper to get GridFSBucket (create once)
let gridfsBucket = null;
function ensureGridFSBucket() {
  if (gridfsBucket) return gridfsBucket;
  const conn = mongoose.connection;
  if (!conn || !conn.db) throw new Error('MongoDB not connected');
  gridfsBucket = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: 'uploads' });
  return gridfsBucket;
}

/**
 * POST /api/upload
 * form field name: file (single file)
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (use field name "file")' });

    if (STORAGE_TYPE === 'local') {
      // file saved to disk already by multer
      const meta = await FileMeta.create({
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        storageType: 'local',
        path: req.file.path
      });
      return res.json({
        message: 'Uploaded (local)',
        file: {
          id: meta._id,
          originalname: meta.originalname,
          mimetype: meta.mimetype,
          size: meta.size,
          url: `${BASE_URL}/api/files/${meta._id}`
        }
      });
    } else {
      // GridFS upload from buffer
      const bucket = ensureGridFSBucket();
      const readable = new Readable();
      readable.push(req.file.buffer);
      readable.push(null);

      const uploadStream = bucket.openUploadStream(req.file.originalname, {
        contentType: req.file.mimetype,
        metadata: { originalname: req.file.originalname }
      });

      readable.pipe(uploadStream)
        .on('error', err => {
          console.error('GridFS upload error', err);
          return res.status(500).json({ error: 'GridFS upload failed' });
        })
        .on('finish', async (file) => {
          // save meta linking to gridfs id
          const meta = await FileMeta.create({
            filename: file.filename,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: file.length,
            storageType: 'gridfs',
            gridFsId: file._id,
            uploadDate: file.uploadDate
          });
          return res.json({
            message: 'Uploaded (gridfs)',
            file: {
              id: file._id,
              originalname: req.file.originalname,
              mimetype: req.file.mimetype,
              size: file.length,
              url: `${BASE_URL}/api/files/${file._id}`
            }
          });
        });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

/**
 * GET /api/files
 * List files (for both local and gridfs)
 */
router.get('/files', async (req, res) => {
  try {
    if (STORAGE_TYPE === 'local') {
      const metas = await FileMeta.find({ storageType: 'local' }).sort({ uploadDate: -1 }).lean();
      const files = metas.map(m => ({
        id: m._id,
        originalname: m.originalname,
        filename: m.filename,
        mimetype: m.mimetype,
        size: m.size,
        uploadDate: m.uploadDate,
        url: `${BASE_URL}/api/files/${m._id}`
      }));
      return res.json({ storageType: 'local', files });
    } else {
      // list GridFS files
      const conn = mongoose.connection;
      const filesColl = conn.db.collection('uploads.files');
      const rows = await filesColl.find({}).sort({ uploadDate: -1 }).toArray();
      const files = rows.map(f => ({
        id: f._id,
        filename: f.filename,
        contentType: f.contentType,
        length: f.length,
        uploadDate: f.uploadDate,
        url: `${BASE_URL}/api/files/${f._id}`
      }));
      return res.json({ storageType: 'gridfs', files });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not list files', details: err.message });
  }
});

/**
 * GET /api/files/:id
 * Download/stream a file by id.
 * - For local: id is FileMeta _id
 * - For gridfs: id is GridFS file id
 */
router.get('/files/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (STORAGE_TYPE === 'local') {
      const meta = await FileMeta.findById(id).lean();
      if (!meta) return res.status(404).json({ error: 'File not found' });
      if (!meta.path || !fs.existsSync(meta.path)) return res.status(404).json({ error: 'File file missing on disk' });

      res.setHeader('Content-Type', meta.mimetype || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${meta.originalname}"`);
      const stream = fs.createReadStream(meta.path);
      return stream.pipe(res);
    } else {
      const objectId = new mongoose.Types.ObjectId(id);
      const bucket = ensureGridFSBucket();

      // check file exists
      const filesColl = mongoose.connection.db.collection('uploads.files');
      const fileDoc = await filesColl.findOne({ _id: objectId });
      if (!fileDoc) return res.status(404).json({ error: 'File not found in GridFS' });

      res.setHeader('Content-Type', fileDoc.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileDoc.filename}"`);

      const downloadStream = bucket.openDownloadStream(objectId);
      downloadStream.on('error', err => {
        console.error('GridFS download error', err);
        return res.status(500).json({ error: 'Error streaming file' });
      });
      return downloadStream.pipe(res);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching file', details: err.message });
  }
});

/**
 * DELETE /api/files/:id
 * Delete file by id.
 * - For local: id is FileMeta _id (deletes file from disk + meta)
 * - For gridfs: id is GridFS file id (deletes from GridFS, and best-effort deletes meta entries)
 */
router.delete('/files/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (STORAGE_TYPE === 'local') {
      const meta = await FileMeta.findById(id);
      if (!meta) return res.status(404).json({ error: 'File not found' });
      if (meta.path && fs.existsSync(meta.path)) fs.unlinkSync(meta.path);
      await FileMeta.deleteOne({ _id: id });
      return res.json({ message: 'Deleted (local)', id });
    } else {
      const objectId = new mongoose.Types.ObjectId(id);
      const bucket = ensureGridFSBucket();
      bucket.delete(objectId, async (err) => {
        if (err) {
          console.error('GridFS delete error', err);
          return res.status(500).json({ error: 'Error deleting file from GridFS' });
        }
        // remove any linked metadata rows (best-effort)
        await FileMeta.deleteMany({ gridFsId: objectId }).catch(() => {});
        return res.json({ message: 'Deleted (gridfs)', id });
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delete failed', details: err.message });
  }
});

module.exports = router;