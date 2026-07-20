const path = require("node:path");

const supportedExtensions = new Map([
  [".epub", "epub"],
  [".md", "markdown"],
  [".markdown", "markdown"]
]);

function getSupportedFileKind(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    return null;
  }

  return supportedExtensions.get(path.extname(filePath).toLowerCase()) || null;
}

function findSupportedFilePath(argv = [], workingDirectory = process.cwd()) {
  for (const value of argv) {
    if (typeof value !== "string" || !getSupportedFileKind(value)) {
      continue;
    }

    return path.isAbsolute(value)
      ? path.normalize(value)
      : path.resolve(workingDirectory, value);
  }

  return null;
}

module.exports = {
  findSupportedFilePath,
  getSupportedFileKind
};
