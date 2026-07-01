// Storage helper (§6). NOT in base.js (which is Firestore-only). Uploads to
// users/{uid}/alerts/{alertId}/{uuid}-{name}; returns {path,url,...} for the
// alerts repo to persist. deleteAttachment(path) is the cascade target (B3).
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { newId } from '~/domain/ids.js'
import { MAX_ATTACHMENT_BYTES, ALLOWED_ATTACHMENT_TYPES } from '~/domain/attachments.js' // ROUND-4: limits live in pure domain

function storage() {
  const { $storage } = useNuxtApp()
  if (!$storage) throw new Error('Storage is not initialized ($storage missing)')
  return $storage
}
const safeName = (name) => String(name || 'file').replace(/[^\w.\-]+/g, '_').slice(-80)

export const storageRepo = {
  /**
   * Resumable upload with progress. Client mirrors the storage.rules guards so
   * the user gets an instant error instead of a rejected write.
   * @returns {Promise<{id,name,path,url,size,contentType}>}
   */
  async uploadAttachment(uid, alertId, file, onProgress) {
    if (file.size >= MAX_ATTACHMENT_BYTES) throw new Error('File is larger than 10 MB') // ROUND-2: >= matches storage.rules (size < 10MB)
    if (!ALLOWED_ATTACHMENT_TYPES.test(file.type)) throw new Error('Only images and PDFs are allowed')
    const path = `users/${uid}/alerts/${alertId}/${newId()}-${safeName(file.name)}`
    const task = uploadBytesResumable(storageRef(storage(), path), file, { contentType: file.type })
    await new Promise((resolve, reject) => {
      task.on('state_changed',
        (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
        reject, resolve)
    })
    const url = await getDownloadURL(task.snapshot.ref)
    return { id: newId(), name: file.name, path, url, size: file.size, contentType: file.type }
  },

  /** Best-effort delete; ignore "object-not-found". */
  async deleteAttachment(path) {
    try { await deleteObject(storageRef(storage(), path)) }
    catch (e) { if (e?.code !== 'storage/object-not-found') throw e }
  },
}
