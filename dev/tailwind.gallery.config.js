// Dev-only: the app's Tailwind config, plus the gallery's own files so their
// classes get generated. Used by dev/gallery.css through @config; the
// production build never sees it.
import base from '../tailwind.config.js';

export default {
  ...base,
  content: [...base.content, './dev/**/*.{ts,tsx}'],
};
