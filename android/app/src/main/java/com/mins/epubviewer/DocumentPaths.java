package com.mins.epubviewer;

import java.io.File;
import java.io.IOException;

final class DocumentPaths {
    static File resolve(File directory, String path) throws IOException {
        if (path == null || path.isEmpty()) throw new IOException("native.pathMissing");
        File file = new File(path).getCanonicalFile();
        if (!directory.getCanonicalFile().equals(file.getParentFile())) {
            throw new IOException("native.outsideLibrary");
        }
        return file;
    }

    static boolean same(File directory, String first, String second) throws IOException {
        return resolve(directory, first).equals(resolve(directory, second));
    }
}
