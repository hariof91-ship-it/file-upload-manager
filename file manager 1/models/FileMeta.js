js
// models/FileMeta.js
const mongoose = require('mongoose');

const FileMetaSchema = new mongoose.Schema({
  filename: String,         // stored filename or gridfs filename
  originalname: String,
  mimetype: String,
  size: Number,
  storageType: { type: String, enum: ['local', 'gridfs'], default: 'local' },
  path: String,             // filesystem path for local files
  gridFsId: mongoose.Schema.Types.ObjectId, // GridFS file id (when storageType === 'gridfs')
  uploadDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FileMeta', FileMetaSchema);