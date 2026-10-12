// names.js - turning what the user typed into a layout file name.

// Letters, digits, _ and - only (the server accepts exactly this, 1-64 characters).
export function slugify(text) {
  const slug = String(text).trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
  return slug || 'layout';
}
