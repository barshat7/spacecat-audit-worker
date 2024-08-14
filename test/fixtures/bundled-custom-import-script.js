const CustomImportScript = (() => {
  const __defProp = Object.defineProperty;
  const __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  const __getOwnPropNames = Object.getOwnPropertyNames;
  const __hasOwnProp = Object.prototype.hasOwnProperty;
  const __export = (target, all) => {
    for (const name in all) __defProp(target, name, { get: all[name], enumerable: true });
  };
  const __copyProps = (to, from, except, desc) => {
    if (from && typeof from === 'object' || typeof from === 'function') {
      for (const key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  const __toCommonJS = (mod) => __copyProps(__defProp({}, '__esModule', { value: true }), mod);

  const import_replace_body_exports = {};
  __export(import_replace_body_exports, {
    default: () => import_replace_body_default,
  });
  var import_replace_body_default = {
    /**
     * Apply DOM operations to the provided document and return
     * the root element to be then transformed to Markdown.
     * @param {HTMLDocument} document The document
     * @param {string} url The url of the page imported
     * @param {string} html The raw html (the document is cleaned up during preprocessing)
     * @param {object} params Object containing some parameters given by the import process.
     * @returns {HTMLElement} The root element to be transformed
     */
    transformDOM: ({
      // eslint-disable-next-line no-unused-vars
      document,
      url,
      html,
      params,
    }) => {
      const main = document.body;

      // Create an H1 tag and replace all the existing elements in the body with it
      const h1 = document.createElement('h1');
      h1.textContent = 'Import as a Service';
      main.innerHTML = '';
      main.appendChild(h1);
      return main;
    },
    /**
     * Return a path that describes the document being transformed (file name, nesting...).
     * The path is then used to create the corresponding Word document.
     * @param {HTMLDocument} document The document
     * @param {string} url The url of the page imported
     * @param {string} html The raw html (the document is cleaned up during preprocessing)
     * @param {object} params Object containing some parameters given by the import process.
     * @return {string} The path
     */
    generateDocumentPath: ({
      // eslint-disable-next-line no-unused-vars
      document,
      url,
      html,
      params,
    }) => {
      let p = new URL(url).pathname;
      if (p.endsWith('/')) {
        p = `${p}index`;
      }
      return decodeURIComponent(p).toLowerCase().replace(/\.html$/, '').replace(/[^a-z0-9/]/gm, '-');
    },
  };
  return __toCommonJS(import_replace_body_exports);
})();
