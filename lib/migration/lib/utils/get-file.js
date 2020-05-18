const fs = require('fs');

module.exports = filePath => {
  return {
    filePath,
    fileContent: fs.readFileSync(filePath, 'utf8').toString()
  };
};
