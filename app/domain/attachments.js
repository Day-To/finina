// Pure attachment limits (no Firebase/Vue). Mirror these in storage.rules.
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024              // 10 MB
export const ALLOWED_ATTACHMENT_TYPES = /^(image\/.*|application\/pdf)$/
