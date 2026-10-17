package com.mins.epubviewer;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.AtomicFile;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/** App-owned document copies; no broad external-storage permission is required. */
@CapacitorPlugin(name = "ReaderDocuments")
public class ReaderDocumentsPlugin extends Plugin {
    @PluginMethod
    public void setFullscreen(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getActivity().runOnUiThread(() -> {
            androidx.core.view.WindowInsetsControllerCompat controller = androidx.core.view.WindowCompat.getInsetsController(getActivity().getWindow(), getActivity().getWindow().getDecorView());
            controller.setSystemBarsBehavior(androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            if (enabled) controller.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars());
            else controller.show(androidx.core.view.WindowInsetsCompat.Type.systemBars());
            call.resolve();
        });
    }
    private static final long EPUB_LIMIT = EpubArchive.MAX_ARCHIVE;
    private static final long PDF_LIMIT = 512L * 1024 * 1024;
    private static final long DOCUMENT_LIMIT = 64L * 1024 * 1024;
    private static final long MARKDOWN_LIMIT = 16L * 1024 * 1024;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private volatile boolean pickerActive = false;

    // BridgeActivity forwards both the launch intent and subsequent deliveries.
    // Retain results until the reader has restored its saved session and listens.
    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_VIEW.equals(action) && !Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;
        java.util.LinkedHashSet<Uri> uris = new java.util.LinkedHashSet<>();
        try {
            if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) uris.add(intent.getData());
            if (Intent.ACTION_SEND.equals(action)) {
                Uri stream = androidx.core.content.IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri.class);
                if (stream != null) uris.add(stream);
            }
            if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                java.util.ArrayList<Uri> streams = androidx.core.content.IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri.class);
                if (streams != null) uris.addAll(streams);
            }
            if (uris.isEmpty() && intent.getClipData() != null) {
                for (int i = 0; i < intent.getClipData().getItemCount(); i++) {
                    Uri uri = intent.getClipData().getItemAt(i).getUri();
                    if (uri != null) uris.add(uri);
                }
            }
        } catch (RuntimeException error) {
            notifyListeners("externalDocument", new JSObject().put("error", "native.sharedInfoFailed"), true);
            return;
        }
        if (uris.isEmpty()) {
            notifyListeners("externalDocument", new JSObject().put("error", "native.shareTextNotFile"), true);
            return;
        }
        io.execute(() -> {
            for (Uri uri : uris) {
                try {
                    if (!"content".equals(uri.getScheme()) || (getContext().getPackageName() + ".fileprovider").equals(uri.getAuthority())) throw new IOException("native.selectSharedFile");
                    notifyListeners("externalDocument", new JSObject().put("file", importDocument(uri, null)), true);
                } catch (Exception error) {
                    notifyListeners("externalDocument", new JSObject().put("error", "native.sharedOpenFailed").put("detail", error.getMessage()), true);
                }
            }
        });
    }

    private interface Work { void run() throws Exception; }

    private void work(PluginCall call, Work task) {
        io.execute(() -> {
            try { task.run(); }
            catch (Exception error) { call.reject(error.getMessage(), error); }
        });
    }

    private File documentsDir() throws IOException {
        File dir = new File(getContext().getFilesDir(), "reader-documents");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("native.libraryCreateFailed");
        return dir;
    }

    private AtomicFile stateFile(String name) {
        return new AtomicFile(new File(getContext().getFilesDir(), name));
    }

    private JSONObject readJson(String name) throws Exception {
        AtomicFile file = stateFile(name);
        if (!file.getBaseFile().exists() && !new File(file.getBaseFile() + ".bak").exists()) return new JSONObject();
        return new JSONObject(new String(file.readFully(), StandardCharsets.UTF_8));
    }

    private void writeJson(String name, JSONObject data) throws Exception {
        writeBytes(stateFile(name), data.toString().getBytes(StandardCharsets.UTF_8));
    }

    private void writeBytes(AtomicFile target, byte[] bytes) throws IOException {
        FileOutputStream output = null;
        try {
            output = target.startWrite();
            output.write(bytes);
            target.finishWrite(output);
        } catch (IOException error) {
            if (output != null) target.failWrite(output);
            throw error;
        }
    }

    private String documentKind(String name) throws IOException {
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".epub")) return "epub";
        if (lower.endsWith(".pdf")) return "pdf";
        // DOCX, HWP and HWPX are converted to HTML by the reader.
        if (lower.endsWith(".docx") || lower.endsWith(".hwp") || lower.endsWith(".hwpx")) return "document";
        if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt")) return "markdown";
        throw new IOException("native.chooseSupportedFile");
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0 && !cursor.isNull(index)) return cursor.getString(index);
            }
        }
        return uri.getLastPathSegment() == null ? "document" : uri.getLastPathSegment();
    }

    private String uriId(Uri uri) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(uri.toString().getBytes(StandardCharsets.UTF_8));
        StringBuilder id = new StringBuilder();
        for (byte value : digest) id.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return id.toString();
    }

    private File managedFile(String path) throws IOException {
        return DocumentPaths.resolve(documentsDir(), path);
    }

    private JSObject descriptor(File file, String name, String kind) {
        JSObject data = new JSObject();
        data.put("name", name);
        data.put("kind", kind);
        // Keep the same logical path returned by getFilesDir(), even when a
        // canonical file uses Android's /data/data alias for /data/user/0.
        data.put("path", new File(getContext().getFilesDir(), "reader-documents/" + file.getName()).getAbsolutePath());
        data.put("size", file.length());
        return data;
    }

    private void remember(JSObject entry) throws Exception {
        JSONObject data = readJson("reader-recent.json");
        JSONArray previous = data.optJSONArray("files");
        JSONArray next = new JSONArray();
        next.put(entry);
        if (previous != null) {
            for (int i = 0; i < previous.length() && next.length() < 50; i++) {
                JSONObject old = previous.getJSONObject(i);
                if (!DocumentPaths.same(documentsDir(), entry.getString("path"), old.optString("path"))) next.put(old);
            }
        }
        data.put("files", next);
        writeJson("reader-recent.json", data);
    }

    private JSObject importDocument(Uri uri, String requestedKind) throws Exception {
        String name = displayName(uri);
        String kind = documentKind(name);
        if (requestedKind != null && !requestedKind.equals(kind)) throw new IOException("native.kindMismatch");
        long limit = kind.equals("epub") ? EPUB_LIMIT : kind.equals("pdf") ? PDF_LIMIT : kind.equals("document") ? DOCUMENT_LIMIT : MARKDOWN_LIMIT;
        // Stable within this installation, even when two documents have the same name.
        String extension = kind.equals("markdown") ? ".md" : kind.equals("document") ? name.substring(name.lastIndexOf('.')).toLowerCase(Locale.ROOT) : "." + kind;
        File destination = new File(documentsDir(), uriId(uri) + extension);
        // Re-selecting an imported document opens the saved app copy, preserving edits.
        if (!destination.exists()) {
            AtomicFile target = new AtomicFile(destination);
            FileOutputStream output = null;
            try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
                if (input == null) throw new IOException("native.readFailed");
                output = target.startWrite();
                byte[] buffer = new byte[64 * 1024];
                long total = 0;
                int count;
                while ((count = input.read(buffer)) != -1) {
                    total += count;
                    if (total > limit) throw new IOException("native." + kind + "TooLarge");
                    output.write(buffer, 0, count);
                }
                if (total == 0 && kind.equals("epub")) throw new IOException("native.emptyEpub");
                if (total == 0 && kind.equals("pdf")) throw new IOException("native.emptyPdf");
                target.finishWrite(output);
                output = null;
            } catch (Exception error) {
                if (output != null) target.failWrite(output);
                throw error;
            }
        }
        JSObject result = descriptor(destination, name, kind);
        remember(result);
        return result;
    }

    private boolean startPicker(PluginCall call, Intent intent, String callback) {
        if (pickerActive) { call.reject("native.pickerBusy"); return false; }
        pickerActive = true;
        try { startActivityForResult(call, intent, callback); return true; }
        catch (Exception error) { pickerActive = false; call.reject("native.pickerFailed", error); return false; }
    }

    @PluginMethod
    public void pickFile(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        // Providers often label .md and .epub as octet-stream. Validate the name after selection.
        intent.setType("*/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startPicker(call, intent, "filePicked");
    }

    @ActivityCallback
    private void filePicked(PluginCall call, ActivityResult result) {
        pickerActive = false;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.resolve(new JSObject().put("cancelled", true)); return;
        }
        Uri uri = result.getData().getData();
        work(call, () -> call.resolve(importDocument(uri, call.getString("kind"))));
    }

    @PluginMethod
    public void listRecent(PluginCall call) {
        work(call, () -> {
            JSONArray entries = readJson("reader-recent.json").optJSONArray("files");
            JSArray files = new JSArray();
            if (entries != null) for (int i = 0; i < entries.length(); i++) {
                JSONObject entry = entries.getJSONObject(i);
                if (managedFile(entry.optString("path")).isFile()) files.put(entry);
            }
            call.resolve(new JSObject().put("files", files));
        });
    }

    @PluginMethod
    public void openRecent(PluginCall call) {
        work(call, () -> {
            File file = managedFile(call.getString("path"));
            if (!file.isFile()) throw new IOException("native.libraryFileMissing");
            JSONArray entries = readJson("reader-recent.json").optJSONArray("files");
            if (entries != null) for (int i = 0; i < entries.length(); i++) {
                JSONObject entry = entries.getJSONObject(i);
                if (DocumentPaths.same(documentsDir(), file.getPath(), entry.optString("path"))) {
                    JSObject data = descriptor(file, entry.getString("name"), entry.getString("kind"));
                    remember(data);
                    call.resolve(data);
                    return;
                }
            }
            throw new IOException("native.recentMissing");
        });
    }

    @PluginMethod
    public void prepareEpub(PluginCall call) {
        work(call, () -> {
            File file = managedFile(call.getString("path"));
            if (!file.isFile() || !file.getName().endsWith(".epub")) throw new IOException("native.libraryEpubMissing");
            EpubArchive.Prepared prepared = EpubArchive.prepare(file, new File(getContext().getCacheDir(), "reader-epubs"));
            call.resolve(new JSObject().put("rootPath", prepared.directory.getAbsolutePath() + "/").put("bookId", prepared.bookId));
        });
    }

    private String markdownName(String name) {
        String safe = name == null ? "document.md" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (!safe.toLowerCase(Locale.ROOT).matches(".*\\.(md|markdown|txt)$")) safe += ".md";
        return safe;
    }

    private JSObject saveCopy(PluginCall call, boolean newCopy) throws Exception {
        byte[] bytes = call.getString("content", "").getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MARKDOWN_LIMIT) throw new IOException("native.markdownSaveTooLarge");
        String path = call.getString("path", "");
        File target = newCopy || path.isEmpty() ? new File(documentsDir(), UUID.randomUUID() + ".md") : managedFile(path);
        if (!target.getName().endsWith(".md")) throw new IOException("native.markdownCopyOnly");
        writeBytes(new AtomicFile(target), bytes);
        JSObject entry = descriptor(target, markdownName(call.getString("suggestedName")), "markdown");
        remember(entry);
        return entry;
    }

    @PluginMethod
    public void saveMarkdown(PluginCall call) {
        if (Boolean.TRUE.equals(call.getBoolean("saveAs", false))) {
            createDocument(call, markdownName(call.getString("suggestedName")), "text/markdown");
        } else {
            work(call, () -> call.resolve(saveCopy(call, false)));
        }
    }

    @PluginMethod
    public void exportText(PluginCall call) {
        createDocument(call, call.getString("fileName", "document.txt"), call.getString("type", "text/plain").split(";")[0]);
    }

    private void createDocument(PluginCall call, String name, String type) {
        if (call.getString("content", "").getBytes(StandardCharsets.UTF_8).length > MARKDOWN_LIMIT) {
            call.reject("native.exportTooLarge"); return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(type);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startPicker(call, intent, "documentCreated");
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        pickerActive = false;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.resolve(new JSObject().put("cancelled", true)); return;
        }
        Uri uri = result.getData().getData();
        work(call, () -> {
            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (output == null) throw new IOException("native.saveFailed");
                output.write(call.getString("content", "").getBytes(StandardCharsets.UTF_8));
            }
            if ("saveMarkdown".equals(call.getMethodName())) call.resolve(saveCopy(call, true));
            else call.resolve(new JSObject().put("saved", true));
        });
    }

    @PluginMethod
    public void readState(PluginCall call) {
        work(call, () -> call.resolve(new JSObject().put("values", readJson("reader-state.json"))));
    }

    @PluginMethod
    public void writeState(PluginCall call) {
        work(call, () -> {
            JSObject values = call.getObject("values");
            if (values == null) throw new IOException("native.noStateToSave");
            writeJson("reader-state.json", values);
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() { io.shutdown(); }
}
