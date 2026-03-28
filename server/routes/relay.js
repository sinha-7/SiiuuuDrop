const express = require('express');
const router = express.Router();
const busboy = require('busboy');
const fs = require('fs');
const fileManager = require('../utils/fileManager');

router.post('/chunk', (req, res) => {
  const bb = busboy({
    headers: req.headers,
    limits: { fileSize: Infinity }
  });

  const { fileId, fileName } = req.query;
  
  if (fileName) {
    fileManager.registerFile(fileId, fileName);
  }

  bb.on('file', (name, file, info) => {
    const tmpPath = fileManager.getTmpPath(fileId);
    // Append to file to collect all chunks
    const writeStream = fs.createWriteStream(tmpPath, { flags: 'a' });
    file.pipe(writeStream);
    
    file.on('end', () => {
      fileManager.scheduleDelete(tmpPath, fileId);
    });

    writeStream.on('finish', () => {
      res.json({ success: true });
    });
    
    writeStream.on('error', (err) => {
      res.status(500).json({ error: err.message });
    });
  });

  bb.on('error', (err) => res.status(500).json({ error: err.message }));
  req.pipe(bb);
});

router.get('/download/:fileId', (req, res) => {
  const { fileId } = req.params;
  const filePath = fileManager.getTmpPath(fileId);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found or expired');
  }

  const fileName = fileManager.getFileName(fileId);
  const stat = fs.statSync(filePath);

  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  const readStream = fs.createReadStream(filePath);
  readStream.pipe(res);
  
  readStream.on('close', () => {
    // Delete immediately after download completes
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch(e) {}
    }
  });
});

router.delete('/:fileId', (req, res) => {
  const { fileId } = req.params;
  const filePath = fileManager.getTmpPath(fileId);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch(e) {}
  }
  res.json({ success: true });
});

module.exports = router;
