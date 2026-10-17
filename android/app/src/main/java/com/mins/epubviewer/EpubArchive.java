package com.mins.epubviewer;

import java.io.*;
import java.util.Enumeration;
import java.util.Locale;
import java.util.Properties;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** Unpack on disk with bounded buffers; the WebView only loads visible chapters. */
final class EpubArchive {
    static final long MAX_ARCHIVE = 512L * 1024 * 1024;
    static final long MAX_EXPANDED = 2L * 1024 * 1024 * 1024;
    static final long MAX_ENTRY = 256L * 1024 * 1024;

    static final class Prepared {
        final File directory;
        final String bookId;
        Prepared(File directory, String bookId) { this.directory = directory; this.bookId = bookId; }
    }

    static Prepared prepare(File source, File cache) throws IOException {
        if (source.length() == 0 || source.length() > MAX_ARCHIVE) throw new IOException("native.epubTooLarge");
        if (!cache.isDirectory() && !cache.mkdirs()) throw new IOException("native.tempDirFailed");
        File output = new File(cache, source.getName() + ".unpacked").getCanonicalFile();
        if (!cache.getCanonicalFile().equals(output.getParentFile())) throw new IOException("native.invalidEpubPath");
        File marker = new File(output, ".reader-complete");
        String identity = source.length() + ":" + source.lastModified();
        Properties metadata = new Properties();
        if (marker.isFile()) {
            try (InputStream input = new FileInputStream(marker)) { metadata.load(input); }
            catch (IOException | IllegalArgumentException ignored) { metadata.clear(); }
            if (identity.equals(metadata.getProperty("source")) && metadata.getProperty("bookId", "").matches("[0-9a-f]{64}")
                && new File(output, "META-INF/container.xml").isFile()) {
                return new Prepared(output, metadata.getProperty("bookId"));
            }
        }
        deleteInside(output, cache);
        if (!output.mkdirs()) throw new IOException("native.tempDirFailed");
        String bookId = contentId(source);
        byte[] buffer = new byte[64 * 1024];
        long expanded = 0;
        int entries = 0;
        try (ZipFile archive = new ZipFile(source)) {
            Enumeration<? extends ZipEntry> files = archive.entries();
            while (files.hasMoreElements()) {
                ZipEntry entry = files.nextElement();
                if (++entries > 50000) throw new IOException("native.tooManyEntries");
                String name = entry.getName().replace('\\', '/');
                File destination = new File(output, name).getCanonicalFile();
                if (entry.isDirectory() && destination.equals(output)) continue;
                if (name.startsWith("/") || name.contains(":") || !destination.getPath().startsWith(output.getPath() + File.separator)
                    || destination.equals(marker)) throw new IOException("native.invalidEntryPath");
                if (entry.isDirectory()) { if (!destination.isDirectory() && !destination.mkdirs()) throw new IOException("native.folderCreateFailed"); continue; }
                if (!destination.getParentFile().isDirectory() && !destination.getParentFile().mkdirs()) throw new IOException("native.folderCreateFailed");
                long length = 0;
                try (InputStream input = archive.getInputStream(entry); OutputStream stream = new FileOutputStream(destination)) {
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        length += count;
                        expanded += count;
                        if (length > MAX_ENTRY || expanded > MAX_EXPANDED) throw new IOException("native.expandedTooLarge");
                        stream.write(buffer, 0, count);
                    }
                }
            }
            if (!new File(output, "META-INF/container.xml").isFile()) throw new IOException("native.missingContainer");
            metadata.setProperty("source", identity);
            metadata.setProperty("bookId", bookId);
            try (OutputStream stream = new FileOutputStream(marker)) { metadata.store(stream, "Reader EPUB cache"); }
            return new Prepared(output, bookId);
        } catch (IOException error) {
            deleteInside(output, cache);
            throw error;
        }
    }

    // Preserve the shared core's existing content IDs and their bookmarks/CFIs.
    static String contentId(File file) throws IOException {
        int hashA = 0x811c9dc5;
        int hashB = 0x01000193;
        byte[] buffer = new byte[64 * 1024];
        try (InputStream input = new FileInputStream(file)) {
            int count;
            while ((count = input.read(buffer)) != -1) for (int i = 0; i < count; i++) {
                int value = buffer[i] & 0xff;
                hashA = (hashA ^ value) * 0x01000193;
                hashB = (hashB ^ value) * 0x85ebca6b;
            }
        }
        String seed = String.format(Locale.ROOT, "%08x%08x", hashA, hashB);
        return seed + seed + seed + seed;
    }

    private static void deleteInside(File file, File root) throws IOException {
        if (!file.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator)) throw new IOException("native.invalidTempPath");
        if (!file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteInside(child, root);
        if (!file.delete()) throw new IOException("native.cleanupFailed");
    }
}
