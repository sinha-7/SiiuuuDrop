const fs = require('fs');
const path = require('path');
const os = require('os');

// Track filenames matching fileId for download header
const fileMetaData = new Map();

module.exports = {
  getTmpPath: (fileId) => {
    return path.join(os.tmpdir(), `swiftdrop_${fileId}`);
  },
  registerFile: (fileId, fileName) => {
    fileMetaData.set(fileId, fileName);
  },
  getFileName: (fileId) => {
    return fileMetaData.get(fileId) || 'downloaded_file';
  },
  scheduleDelete: (filePath, fileId) => {
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`Deleted temp file: ${filePath}`);
        } catch(e) {}
      }
      fileMetaData.delete(fileId);
    }, 10 * 60 * 1000); // 10 minutes
  }
};
