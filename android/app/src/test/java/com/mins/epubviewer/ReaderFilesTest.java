package com.mins.epubviewer;

import static org.junit.Assert.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ReaderFilesTest {
    @Rule public TemporaryFolder temp = new TemporaryFolder();

    @Test public void recentFilesMatchCanonicalAliasesForEpubAndMarkdown() throws Exception {
        File library = temp.newFolder("library");
        assertTrue(new File(library, "alias").mkdir());
        for (String name : new String[] { "book.epub", "notes.md" }) {
            File file = new File(library, name);
            assertTrue(file.createNewFile());
            String savedPath = new File(library, "alias/../" + name).getAbsolutePath();
            assertNotEquals(file.getCanonicalPath(), savedPath);
            assertTrue(DocumentPaths.same(library, savedPath, file.getCanonicalPath()));
            assertTrue(DocumentPaths.resolve(library, savedPath).isFile());
        }
    }

    @Test public void recentPathsCannotEscapeTheLibrary() throws Exception {
        File library = temp.newFolder("library");
        try { DocumentPaths.resolve(library, new File(library, "../private.json").getPath()); fail("Must reject external paths"); }
        catch (IOException expected) { assertTrue(expected.getMessage().contains("보관함")); }
    }

    private void entry(ZipOutputStream zip, String name, String text) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(text.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    @Test public void largeArchiveStreamsToDiskAndCacheCanBeReusedAfterRestart() throws Exception {
        File book = temp.newFile("large.epub");
        try (ZipOutputStream zip = new ZipOutputStream(new FileOutputStream(book))) {
            zip.setLevel(0);
            entry(zip, "META-INF/container.xml", "<container/>");
            entry(zip, "chapter.xhtml", "<html><body>한글</body></html>");
            zip.putNextEntry(new ZipEntry("images/large.bin"));
            byte[] chunk = new byte[64 * 1024];
            for (int i = 0; i < 1120; i++) zip.write(chunk); // 70MiB; above the old native cap.
            zip.closeEntry();
        }
        assertTrue(book.length() > 64L * 1024 * 1024);
        File cache = temp.newFolder("cache");
        EpubArchive.Prepared first = EpubArchive.prepare(book, cache);
        assertEquals(70L * 1024 * 1024, new File(first.directory, "images/large.bin").length());
        assertEquals(64, first.bookId.length());
        long extractedTime = new File(first.directory, "chapter.xhtml").lastModified();
        EpubArchive.Prepared reopened = EpubArchive.prepare(new File(book.getCanonicalPath()), cache);
        assertEquals(first.bookId, reopened.bookId);
        assertEquals(extractedTime, new File(reopened.directory, "chapter.xhtml").lastModified());
    }

    @Test public void failedExtractionDoesNotLeaveAReusablePartialCache() throws Exception {
        File book = temp.newFile("invalid.epub");
        try (ZipOutputStream zip = new ZipOutputStream(new FileOutputStream(book))) {
            entry(zip, "META-INF/container.xml", "<container/>");
            entry(zip, "../escaped.txt", "bad");
        }
        File cache = temp.newFolder("cache");
        try { EpubArchive.prepare(book, cache); fail("Must reject traversal"); }
        catch (IOException expected) { assertTrue(expected.getMessage().contains("경로")); }
        assertFalse(new File(cache, "escaped.txt").exists());
        assertFalse(new File(cache, "invalid.epub.unpacked/.reader-complete").exists());
    }

    @Test public void nativeContentHashPreservesJavaScriptBookIdentity() throws Exception {
        File file = temp.newFile("id.epub");
        Files.write(file.toPath(), new byte[] { 0, 1, 127, (byte)128, (byte)255 });
        assertEquals("d9901cb695da1c58d9901cb695da1c58d9901cb695da1c58d9901cb695da1c58", EpubArchive.contentId(file));
    }
}
