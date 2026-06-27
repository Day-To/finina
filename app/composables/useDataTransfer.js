// Account-wide data export / restore (Settings → Backup & restore). Wraps the
// dataTransfer repository with the JSON envelope, browser file download, and
// file parsing/validation. Writes to the SIGNED-IN user's data, so a backup can
// be restored to its own account (or used to seed a fresh one).
import { ref } from 'vue'
import { collectUserData, restoreUserData, countRecords, BACKUP_VERSION } from '~/repositories/dataTransfer.js'

const BACKUP_TYPE = 'finina-backup'

export function useDataTransfer() {
  const auth = useAuthStore()
  const uid = () => {
    const u = auth.user?.uid
    if (!u) throw new Error('Not signed in')
    return u
  }

  const exporting = ref(false)
  const importing = ref(false)
  const status = ref('')

  /** Build the full envelope (metadata + data). Date is fine in the app runtime. */
  async function buildBackup() {
    const data = await collectUserData(uid())
    return {
      app: 'finina',
      type: BACKUP_TYPE,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      source: { uid: uid(), email: auth.user?.email ?? null },
      data,
    }
  }

  /** True when running as an installed standalone PWA (where <a download> is unreliable). */
  function isStandalone() {
    if (typeof window === 'undefined') return false
    return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
  }

  /**
   * Gather everything and save it as a .json file.
   * @returns {Promise<{counts:object, method:'share'|'download'}|undefined>}
   *   undefined when the user dismisses the native share sheet.
   */
  async function exportToFile() {
    if (exporting.value) return
    exporting.value = true
    status.value = 'Preparing backup…'
    try {
      const backup = await buildBackup()
      const counts = countRecords(backup.data)
      const json = JSON.stringify(backup, null, 2)
      const filename = `finina-backup-${backup.exportedAt.slice(0, 10)}.json`

      // Installed iOS PWAs ignore <a download>, so there use the native share/save
      // sheet ("Save to Files"). The <a download> path below is the reliable one
      // for every normal browser tab.
      if (isStandalone() && typeof File !== 'undefined') {
        const file = new File([json], filename, { type: 'application/json' })
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: filename })
            return { counts, method: 'share' }
          }
          catch (e) {
            if (e?.name === 'AbortError') return undefined // user dismissed the sheet
            // Don't silently fall back to the unreliable anchor download here and
            // report success — surface a retry instead.
            throw new Error('Could not save the backup — please try again')
          }
        }
      }

      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Defer the revoke so async downloads (Safari/Firefox) aren't cancelled.
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      return { counts, method: 'download' }
    }
    finally {
      exporting.value = false
      status.value = ''
    }
  }

  /** Validate a parsed object is a Finina backup this app can read. */
  function validateBackup(parsed) {
    const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
    if (!isPlainObject(parsed) || parsed.type !== BACKUP_TYPE || !isPlainObject(parsed.data)) {
      throw new Error('This file is not a Finina backup')
    }
    if (Number(parsed.version) > BACKUP_VERSION) {
      throw new Error(`This backup (v${parsed.version}) was made by a newer version of Finina`)
    }
    return parsed
  }

  /** Read + parse + validate a chosen File. Throws a friendly message on failure. */
  async function readBackupFile(file) {
    if (!file) throw new Error('No file selected')
    const text = await file.text()
    let parsed
    try { parsed = JSON.parse(text) }
    catch { throw new Error('That file isn’t valid JSON') }
    return validateBackup(parsed)
  }

  /** Write a (validated) backup into the current account. */
  async function restore(backup, mode = 'merge') {
    if (importing.value) return
    importing.value = true
    try {
      const r = await restoreUserData(uid(), backup.data, { mode, onProgress: (s) => { status.value = s } })
      return r
    }
    finally {
      importing.value = false
      status.value = ''
    }
  }

  return { exporting, importing, status, exportToFile, readBackupFile, restore, countRecords }
}
