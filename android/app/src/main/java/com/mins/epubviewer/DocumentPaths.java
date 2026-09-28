package com.mins.epubviewer;

import java.io.File;
import java.io.IOException;

final class DocumentPaths {
    static File resolve(File directory, String path) throws IOException {
        if (path == null || path.isEmpty()) throw new IOException("문서 경로가 없습니다.");
        File file = new File(path).getCanonicalFile();
        if (!directory.getCanonicalFile().equals(file.getParentFile())) {
            throw new IOException("앱 보관함의 문서만 접근할 수 있습니다.");
        }
        return file;
    }

    static boolean same(File directory, String first, String second) throws IOException {
        return resolve(directory, first).equals(resolve(directory, second));
    }
}
