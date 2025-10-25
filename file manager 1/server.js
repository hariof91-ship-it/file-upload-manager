
js
// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const filesRouter = require('./routes/files');

const app = express();
app.use(express.json());
app.use(cors());

// serve frontend static
app.use(express.static(path.join(__dirname, 'public')));

// ensure uploads dir exists for local storage
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// DB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/file_uploads';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
const conn = mongoose.connection;
conn.on('error', err => console.error('MongoDB error:', err));
conn.once('open', () => console.log('MongoDB connected'));

// mount routes (filesRouter will use mongoose connection internally)
app.use('/api', filesRouter);

// simple health
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));