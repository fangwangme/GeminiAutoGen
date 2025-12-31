// IndexedDB Helper
const DB_NAME = 'GeminiAutoGenDB';
const STORE_NAME = 'handles';

function getDirHandle() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 4);

        request.onerror = () => reject(request.error);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };

        request.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const getReq = store.get('dirHandle');

            getReq.onsuccess = () => resolve(getReq.result);
            getReq.onerror = () => reject(getReq.error);
        };
    });
}

// Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "LIST_ALL_FILES") {
        (async () => {
            try {
                const dirHandle = await getDirHandle();
                if (!dirHandle) {
                    console.warn("[Offscreen] No directory handle found.");
                    sendResponse({ files: [], error: "No handle" });
                    return;
                }

                const fileList = [];
                for await (const entry of dirHandle.values()) {
                    if (entry.kind === 'file') {
                        fileList.push(entry.name);
                    }
                }

                console.log(`[Offscreen] Found ${fileList.length} files in output folder`);
                sendResponse({ files: fileList });
            } catch (err) {
                console.error("[Offscreen] LIST_ALL_FILES Error:", err);
                sendResponse({ files: [], error: err.message });
            }
        })();
        return true; // Async response
    }

    if (request.action === "CHECK_FILE_EXISTS_REAL") {
        (async () => {
            try {
                const dirHandle = await getDirHandle();
                if (!dirHandle) {
                    console.warn("[Offscreen] No directory handle found.");
                    sendResponse({ exists: false, error: "No handle" });
                    return;
                }

                try {
                    await dirHandle.getFileHandle(request.filename);
                    sendResponse({ exists: true });
                } catch (err) {
                    if (err.name === 'NotFoundError') {
                        sendResponse({ exists: false });
                    } else {
                        console.error("[Offscreen] FS Error:", err);
                        sendResponse({ exists: false, error: err.message });
                    }
                }
            } catch (err) {
                console.error("[Offscreen] DB Error:", err);
                sendResponse({ exists: false, error: err.message });
            }
        })();
        return true; // Async response
    }
});
