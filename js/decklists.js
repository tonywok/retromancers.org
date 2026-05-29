(function () {
  var cardDialog;
  var cardDialogImage;
  var cardDialogTitle;
  var cardDialogLink;
  var cardPrintCache = {};
  var requestQueue = Promise.resolve();
  var requestDelay = 120;
  var requestPausedUntil = 0;
  var hoverPreviewDelay = 220;
  var cachePrefix = "retromancers:scryfall-card:";
  var premodernSetQuery = [
    "4ed", "ice", "chr", "hom", "all", "mir", "vis", "5ed", "por", "wth",
    "tmp", "sth", "exo", "p02", "usg", "ulg", "6ed", "uds", "ptk", "s99",
    "mmq", "nem", "pcy", "inv", "pls", "7ed", "apc", "ody", "tor", "jud",
    "ons", "lgn", "scg"
  ].map(function (setCode) {
    return "set:" + setCode;
  }).join(" OR ");

  function parseCardSpec(cardSpec) {
    var cardName = plainCardName(cardSpec);
    var printing = cardName.match(/\s+@([a-z0-9]{2,6})(?:[\/:#]([a-z0-9-]+))?$/i);

    if (!printing) {
      return { name: cardName };
    }

    return {
      name: plainCardName(cardName.slice(0, printing.index)),
      set: printing[1].toLowerCase(),
      number: printing[2] || ""
    };
  }

  function scryfallApiUrl(card) {
    if (card.set && card.number) {
      return "https://api.scryfall.com/cards/" + encodeURIComponent(card.set) + "/" + encodeURIComponent(card.number);
    }

    var url = "https://api.scryfall.com/cards/named?exact=" + encodeURIComponent(card.name);

    if (card.set) {
      url += "&set=" + encodeURIComponent(card.set);
    }

    return url;
  }

  function cardImageFromApi(card) {
    if (card.image_uris && card.image_uris.normal) {
      return card.image_uris.normal;
    }

    if (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris) {
      return card.card_faces[0].image_uris.normal;
    }

    return "";
  }

  function premodernApiSearchUrl(card) {
    return "https://api.scryfall.com/cards/search?unique=prints&order=released&dir=desc&q=" + encodeURIComponent('!"' + card.name + '" (' + premodernSetQuery + ")");
  }

  function readStoredCard(cacheKey) {
    try {
      return JSON.parse(window.localStorage.getItem(cachePrefix + cacheKey));
    } catch (error) {
      return null;
    }
  }

  function storeCard(cacheKey, card) {
    try {
      window.localStorage.setItem(cachePrefix + cacheKey, JSON.stringify(card));
    } catch (error) {
      // Storage can be unavailable in private browsing; previews still work.
    }
  }

  function queuedFetchJson(url) {
    requestQueue = requestQueue
      .catch(function () {})
      .then(function () {
        return new Promise(function (resolve) {
          window.setTimeout(resolve, requestDelay);
        });
      })
      .then(function () {
        var retryAfter;
        var rateLimited = false;
        var responseFailed = false;

        if (Date.now() < requestPausedUntil) {
          throw new Error("Scryfall requests paused");
        }

        return fetch(url).then(function (response) {
          if (!response.ok) {
            responseFailed = true;
            retryAfter = parseInt(response.headers.get("retry-after"), 10);

            if (response.status === 429) {
              rateLimited = true;
              requestPausedUntil = Date.now() + ((retryAfter || 30) * 1000);
            }

            throw new Error("Scryfall request failed");
          }

          return response.json();
        }).catch(function (error) {
          if (!responseFailed && !rateLimited && (!requestPausedUntil || Date.now() >= requestPausedUntil)) {
            requestPausedUntil = Date.now() + 30000;
          }

          throw error;
        });
      });

    return requestQueue;
  }

  function resolvedFromApiCard(apiCard) {
    var imageUrl = cardImageFromApi(apiCard);

    if (!apiCard || !imageUrl) throw new Error("No Scryfall image found");

    return {
      imageUrl: imageUrl,
      pageUrl: apiCard.scryfall_uri
    };
  }

  function resolveCard(card) {
    var cacheKey = [card.name, card.set || "", card.number || ""].join("|");
    var storedCard = readStoredCard(cacheKey);

    if (storedCard && storedCard.imageUrl) {
      return Promise.resolve(storedCard);
    }

    if (!cardPrintCache[cacheKey]) {
      cardPrintCache[cacheKey] = queuedFetchJson(card.set || card.number ? scryfallApiUrl(card) : premodernApiSearchUrl(card))
        .then(function (payload) {
          var resolvedCard = resolvedFromApiCard(payload.data ? payload.data[0] : payload);

          storeCard(cacheKey, resolvedCard);
          return resolvedCard;
        })
        .catch(function () {
          return {
            imageUrl: "",
            pageUrl: scryfallCardUrl(card)
          };
        });
    }

    return cardPrintCache[cacheKey];
  }

  function scryfallCardUrl(card) {
    if (card.set && card.number) {
      return "https://scryfall.com/card/" + encodeURIComponent(card.set) + "/" + encodeURIComponent(card.number);
    }

    var query = '!"' + card.name + '"';

    if (card.set) {
      query += " set:" + card.set;
    }

    return "https://scryfall.com/search?unique=cards&as=grid&order=name&q=" + encodeURIComponent(query);
  }

  function plainCardName(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function ensureCardDialog() {
    if (cardDialog) return cardDialog;

    cardDialog = document.createElement("dialog");
    cardDialog.className = "card-dialog";
    cardDialog.innerHTML = [
      '<form class="card-dialog__frame" method="dialog">',
      '  <button class="card-dialog__close" aria-label="Close card preview" value="close">×</button>',
      '  <h2 class="card-dialog__title"></h2>',
      '  <img class="card-dialog__image" alt="">',
      '  <a class="card-dialog__link" target="_blank" rel="noopener">View on Scryfall</a>',
      '</form>'
    ].join("");

    cardDialog.addEventListener("click", function (event) {
      if (event.target === cardDialog) {
        cardDialog.close();
      }
    });

    document.body.appendChild(cardDialog);
    cardDialogTitle = cardDialog.querySelector(".card-dialog__title");
    cardDialogImage = cardDialog.querySelector(".card-dialog__image");
    cardDialogLink = cardDialog.querySelector(".card-dialog__link");

    return cardDialog;
  }

  function showCardDialog(card) {
    var dialog = ensureCardDialog();

    cardDialogTitle.textContent = card.name;
    cardDialogImage.alt = "";
    cardDialogImage.removeAttribute("src");
    delete cardDialogImage.dataset.cardKey;
    delete cardDialogImage.dataset.cardLoaded;
    delete cardDialogImage.dataset.cardLoading;
    cardDialogLink.href = scryfallCardUrl(card);

    hydrateCardPreview(cardDialogImage, card, function (resolvedCard) {
      cardDialogLink.href = resolvedCard.pageUrl;
    });

    if (dialog.showModal) {
      dialog.showModal();
    } else {
      window.open(cardDialogLink.href, "_blank", "noopener");
    }
  }

  function previewSize(preview) {
    var previousDisplay = preview.style.display;
    var previousVisibility = preview.style.visibility;
    var size;

    preview.style.display = "block";
    preview.style.visibility = "hidden";
    size = {
      height: preview.offsetHeight,
      width: preview.offsetWidth
    };
    preview.style.display = previousDisplay;
    preview.style.visibility = previousVisibility;

    return size;
  }

  function positionPreview(link) {
    var preview = link.querySelector(".card-pop__preview");
    var linkRect;
    var size;
    var margin = 16;

    if (!preview) return;

    link.classList.remove("card-pop--left", "card-pop--below", "card-pop--above");
    linkRect = link.getBoundingClientRect();
    size = previewSize(preview);

    if (linkRect.right + margin + size.width > window.innerWidth) {
      if (linkRect.left - margin - size.width >= 0) {
        link.classList.add("card-pop--left");
      } else if (linkRect.top + margin + size.height <= window.innerHeight) {
        link.classList.add("card-pop--below");
      } else {
        link.classList.add("card-pop--above");
      }
    }

    if (
      !link.classList.contains("card-pop--below") &&
      !link.classList.contains("card-pop--above") &&
      linkRect.top + (linkRect.height / 2) + (size.height / 2) > window.innerHeight &&
      linkRect.top - margin - size.height >= 0
    ) {
      link.classList.add("card-pop--above");
    }
  }

  function addPreview(link, cardSpec) {
    if (link.dataset.cardPreviewReady) return;

    var card = parseCardSpec(cardSpec);
    var hoverTimer;

    link.classList.add("card-pop");
    link.dataset.cardPreviewReady = "true";
    link.dataset.card = card.name;

    if (!link.href) {
      link.href = scryfallCardUrl(card);
    }

    link.target = "_blank";
    link.rel = "noopener";

    var preview = document.createElement("span");
    preview.className = "card-pop__preview";

    var image = document.createElement("img");
    image.alt = "";
    image.decoding = "async";
    image.loading = "lazy";

    preview.appendChild(image);
    link.appendChild(preview);

    function showPreview() {
      hydrateCardPreview(image, card, function (resolvedCard) {
        link.href = resolvedCard.pageUrl;
      });
      positionPreview(link);
      link.classList.add("card-pop--visible");
    }

    function queuePreview() {
      window.clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(showPreview, hoverPreviewDelay);
    }

    function hidePreview() {
      window.clearTimeout(hoverTimer);
      link.classList.remove("card-pop--visible");
    }

    link.addEventListener("mouseenter", queuePreview);

    link.addEventListener("mouseleave", hidePreview);

    link.addEventListener("focusin", function () {
      queuePreview();
    });

    link.addEventListener("focusout", hidePreview);

    link.addEventListener("click", function (event) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      event.preventDefault();
      showCardDialog(card);
    });
  }

  function hydrateCardPreview(image, card, afterResolve) {
    var cacheKey = [card.name, card.set || "", card.number || ""].join("|");

    if (image.dataset.cardKey !== cacheKey) {
      image.dataset.cardKey = cacheKey;
      delete image.dataset.cardLoaded;
      delete image.dataset.cardLoading;
    }

    if (image.dataset.cardLoaded) {
      if (afterResolve) {
        resolveCard(card).then(afterResolve);
      }
      return;
    }

    if (image.dataset.cardLoading) return;

    image.dataset.cardLoading = "true";

    resolveCard(card).then(function (resolvedCard) {
      delete image.dataset.cardLoading;

      if (resolvedCard.imageUrl) {
        image.src = resolvedCard.imageUrl;
        image.dataset.cardLoaded = "true";
      }

      if (afterResolve) afterResolve(resolvedCard);
    });
  }

  function enhanceCardElement(element) {
    var card = parseCardSpec(element.dataset.card || element.textContent);
    if (!card.name) return;

    if (element.tagName.toLowerCase() === "a") {
      addPreview(element, element.dataset.card || element.textContent);
      return;
    }

    var link = document.createElement("a");
    Array.prototype.forEach.call(element.attributes, function (attribute) {
      if (attribute.name !== "class") {
        link.setAttribute(attribute.name, attribute.value);
      }
    });

    link.className = element.className;
    link.href = scryfallCardUrl(card);
    link.textContent = element.textContent;

    element.replaceWith(link);
    addPreview(link, element.dataset.card || element.textContent);
  }

  function enhanceCell(cell) {
    if (cell.querySelector("a, .card-pop")) return;

    var cardSpec = plainCardName(cell.textContent);
    var card = parseCardSpec(cardSpec);
    if (!card.name) return;

    var link = document.createElement("a");
    link.className = "card-pop deck-card";
    link.href = scryfallCardUrl(card);
    link.textContent = card.name;

    addPreview(link, cardSpec);
    cell.textContent = "";
    cell.appendChild(link);
  }

  function enhanceDecklist(decklist) {
    decklist.querySelectorAll("tbody tr").forEach(function (row) {
      var cells = row.querySelectorAll("td");
      if (cells.length < 2) return;

      enhanceCell(cells[cells.length - 1]);
    });
  }

  function sectionName(line) {
    var normalized = line.toLowerCase().replace(/[^a-z]/g, "");

    if (normalized === "maindeck" || normalized === "mainboard" || normalized === "main") return "Main Deck";
    if (normalized === "sideboard" || normalized === "side") return "Sideboard";

    return "";
  }

  function decklistSourceWrapper(code) {
    return code.closest(".highlighter-rouge") || code.closest("pre") || code;
  }

  function appendDeckTable(column, sectionTitle) {
    var table = document.createElement("table");
    var tbody = document.createElement("tbody");

    if (sectionTitle) {
      var heading = document.createElement("h4");

      heading.textContent = sectionTitle;
      column.appendChild(heading);
    }

    table.appendChild(tbody);
    column.appendChild(table);

    return tbody;
  }

  function appendDeckRow(tbody, quantity, cardName) {
    var row = document.createElement("tr");
    var quantityCell = document.createElement("td");
    var cardCell = document.createElement("td");

    quantityCell.textContent = quantity;
    cardCell.textContent = cardName;
    row.appendChild(quantityCell);
    row.appendChild(cardCell);
    tbody.appendChild(row);
  }

  function buildDeckColumn(title) {
    var column = document.createElement("div");
    var heading = document.createElement("h3");

    heading.textContent = title;
    column.appendChild(heading);

    return column;
  }

  function renderFencedDecklist(source) {
    var decklist = document.createElement("div");
    var columns = {};
    var currentColumn;
    var currentBody;

    decklist.className = "decklist";

    function useColumn(title) {
      if (!columns[title]) {
        columns[title] = buildDeckColumn(title);
        decklist.appendChild(columns[title]);
      }

      currentColumn = columns[title];
      currentBody = null;
    }

    function useSection(title) {
      if (!currentColumn) useColumn("Main Deck");
      currentBody = appendDeckTable(currentColumn, title);
    }

    useColumn("Main Deck");

    source.split(/\r?\n/).forEach(function (rawLine) {
      var line = plainCardName(rawLine);
      var cardLine = line.match(/^(\d+)\s+(.+)$/);
      var headingLine = line.match(/^(#{1,6})\s+(.+)$/);
      var columnTitle;

      if (!line) return;

      if (headingLine) {
        if (headingLine[1].length === 1) {
          useColumn(sectionName(headingLine[2]) || plainCardName(headingLine[2]));
          return;
        }

        useSection(plainCardName(headingLine[2]));
        return;
      }

      columnTitle = sectionName(line);
      if (columnTitle) {
        useColumn(columnTitle);
        return;
      }

      if (cardLine) {
        if (!currentBody) useSection("");
        appendDeckRow(currentBody, cardLine[1], cardLine[2]);
        return;
      }

      useSection(line);
    });

    decklist.querySelectorAll("div").forEach(function (column) {
      if (column.querySelector("table")) return;
      column.remove();
    });

    enhanceDecklist(decklist);
    return decklist;
  }

  function enhanceFencedDecklists() {
    document.querySelectorAll("code.language-decklist").forEach(function (code) {
      decklistSourceWrapper(code).replaceWith(renderFencedDecklist(code.textContent));
    });
  }

  function cardTokenLink(cardSpec, displayName) {
    var card = parseCardSpec(cardSpec);
    var link = document.createElement("a");
    link.href = scryfallCardUrl(card);
    link.textContent = displayName || card.name;
    addPreview(link, cardSpec);
    return link;
  }

  function enhanceInlineCardTokens(root) {
    var tokenPattern = /\[\[([^\]]+?)(?:::([^\]]+))?\]\]/g;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue.match(tokenPattern)) return NodeFilter.FILTER_REJECT;
        if (node.parentElement.closest("a, script, style, .decklist")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    nodes.forEach(function (node) {
      var fragment = document.createDocumentFragment();
      var text = node.nodeValue;
      var lastIndex = 0;
      var match;

      tokenPattern.lastIndex = 0;
      while ((match = tokenPattern.exec(text)) !== null) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        fragment.appendChild(cardTokenLink(plainCardName(match[1]), plainCardName(match[2] || match[1])));
        lastIndex = tokenPattern.lastIndex;
      }

      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      node.replaceWith(fragment);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    enhanceFencedDecklists();
    document.querySelectorAll(".decklist").forEach(enhanceDecklist);
    document.querySelectorAll(".card-pop, [data-card]").forEach(enhanceCardElement);
    document.querySelectorAll(".post-content, .blog-index").forEach(enhanceInlineCardTokens);
  });
})();
