var CustomImportScript = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // tools/importer/import.js
  var import_exports = {};
  __export(import_exports, {
    default: () => import_default
  });

  // tools/importer/utils/image-utils.js
  function cleanupImageSrc(src, origin) {
    let imgUrl;
    try {
      imgUrl = new URL(src);
    } catch (e) {
      imgUrl = new URL(src, origin);
    }
    if (imgUrl.host.startsWith("localhost")) {
      return `${origin}${imgUrl.pathname}`;
    }
    return `${imgUrl.protocol}//${imgUrl.host}${imgUrl.pathname}`;
  }

  // tools/importer/transformers/hero.js
  var createHero = (main, document, params) => {
    const { originalURL } = params;
    const hero = main.querySelector(".hero");
    if (hero) {
      const picImg = hero.querySelector("picture > img");
      picImg.src = cleanupImageSrc(picImg.src, originalURL);
      picImg.alt = picImg.alt || "Hero image";
      const title = hero.querySelector("p:nth-child(2)");
      const h1 = document.createElement("h1");
      h1.textContent = title.textContent;
      title.remove();
      const p = document.createElement("p");
      p.appendChild(h1);
      p.appendChild(picImg);
      const cells = [
        ["Hero"],
        [p]
      ];
      const block = WebImporter.DOMUtils.createTable(cells, document);
      hero.append(block);
    }
  };
  var hero_default = createHero;

  // tools/importer/transformers/metadata.js
  var createMetadata = (main, document, html, params, urlStr) => {
    const meta = {};
    const title = document.querySelector("title");
    if (title) {
      meta.title = title.textContent.replace(/[\n\t]/gm, "");
    }
    const desc = document.querySelector('head > meta[property="og:description"]');
    if (desc) {
      meta.description = desc.getAttribute("content").replace(/[\n\t]/gm, "");
    }
    const twitter = document.querySelector('head > meta[name="twitter:card"]');
    if (twitter) {
      meta.twitter = twitter.getAttribute("content").replace(/[\n\t]/gm, "");
    }
    const img = document.querySelector('head > [property="og:image"]');
    if (img && img.content) {
      const el = document.createElement("img");
      el.src = cleanupImageSrc(img.content);
      meta.image = el;
    }
    const block = WebImporter.Blocks.getMetadataBlock(document, meta);
    main.append(block);
    return meta;
  };
  var metadata_default = createMetadata;

  // tools/importer/transformers/cards.js
  var createCards = (main, document, params) => {
    const { originalURL } = params;
    const cards = main.querySelector(".cards");
    const cellItems = [];
    if (cards) {
      for (let i = 0; i < cards.children.length; i += 1) {
        const cardItem = cards.children[i];
        const picImg = cardItem.querySelector("picture > img");
        picImg.src = cleanupImageSrc(picImg.src, originalURL);
        picImg.alt = picImg.alt || "Plush Item";
        const title = cardItem.querySelector(":scope div:nth-of-type(2) > p");
        const body = cardItem.querySelector(":scope div:nth-of-type(2) > p:nth-child(2)");
        const p = document.createElement("p");
        p.appendChild(title);
        p.appendChild(body);
        cellItems.push([picImg, p]);
      }
      const cells = [["Cards"], ...cellItems];
      const block = WebImporter.DOMUtils.createTable(cells, document);
      cards.append(block);
    }
  };
  var cards_default = createCards;

  // tools/importer/transformers/index.js
  var transformers = [
    hero_default,
    cards_default
  ];
  var postTransformers = [
    metadata_default
  ];

  // tools/importer/import.js
  var import_default = {
    /**
     * Apply DOM operations to the provided document and return
     * the root element to be then transformed to Markdown.
     * @param {HTMLDocument} document The document
     * @param {string} url The url of the page imported
     * @param {string} html The raw html (the document is cleaned up during preprocessing)
     * @param {object} params Object containing some parameters given by the import process.
     * @returns {HTMLElement} The root element to be transformed
     */
    transformDOM: (_0) => __async(void 0, [_0], function* ({
      // eslint-disable-next-line no-unused-vars
      document,
      url,
      html,
      params
    }) {
      const main = document.body;
      transformers.forEach(
        (fn) => fn.call(void 0, main, document, params, url)
      );
      WebImporter.DOMUtils.remove(main, [
        "header",
        "footer",
        ".featured"
      ]);
      postTransformers.forEach(
        (fn) => fn.call(void 0, main, document, html, params, url)
      );
      return main;
    })
  };
  return __toCommonJS(import_exports);
})();
