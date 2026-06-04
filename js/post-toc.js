(function () {
  function slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function uniqueId(baseId, usedIds) {
    var id = baseId || "section";
    var nextId = id;
    var index = 2;

    while (usedIds[nextId] || document.getElementById(nextId)) {
      nextId = id + "-" + index;
      index += 1;
    }

    usedIds[nextId] = true;
    return nextId;
  }

  function setActiveLink(links, activeId) {
    links.forEach(function (link) {
      var isActive = link.getAttribute("href") === "#" + activeId;

      link.classList.toggle("post-toc__link--active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function observeHeadings(headings, links) {
    if (!("IntersectionObserver" in window)) return;

    var activeById = {};
    var observer = new IntersectionObserver(function (entries) {
      var visibleEntry = entries
        .filter(function (entry) {
          activeById[entry.target.id] = entry.isIntersecting;
          return entry.isIntersecting;
        })
        .sort(function (a, b) {
          return a.boundingClientRect.top - b.boundingClientRect.top;
        })[0];

      if (visibleEntry) {
        setActiveLink(links, visibleEntry.target.id);
        return;
      }

      var fallback = headings.slice().reverse().find(function (heading) {
        return heading.getBoundingClientRect().top < 120;
      });

      if (fallback) {
        setActiveLink(links, fallback.id);
      }
    }, {
      rootMargin: "-16% 0px -70% 0px",
      threshold: 0
    });

    headings.forEach(function (heading) {
      observer.observe(heading);
    });
  }

  function buildToc() {
    var toc = document.querySelector("[data-post-toc]");
    var details = toc && toc.querySelector(".post-toc__details");
    var desktopTocQuery = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1180px)");
    var list = document.querySelector("[data-post-toc-list]");
    var content = document.querySelector("[data-post-content]");
    var usedIds = {};
    var links = [];

    if (!toc || !list || !content) return;

    var headings = Array.prototype.slice.call(content.querySelectorAll("h2, h3"))
      .filter(function (heading) {
        return !heading.closest(".decklist");
      });

    if (headings.length < 2) return;

    headings.forEach(function (heading) {
      var item = document.createElement("li");
      var link = document.createElement("a");
      var level = heading.tagName.toLowerCase() === "h3" ? "3" : "2";

      heading.id = uniqueId(heading.id || slugify(heading.textContent), usedIds);
      heading.tabIndex = -1;

      item.className = "post-toc__item post-toc__item--h" + level;
      link.className = "post-toc__link";
      link.href = "#" + heading.id;
      link.textContent = heading.textContent.trim();
      link.dataset.tocLabel = link.textContent;

      item.appendChild(link);
      list.appendChild(item);
      links.push(link);
    });

    toc.hidden = false;
    if (details) {
      function syncDetailsMode(event) {
        details.open = event.matches;
      }

      syncDetailsMode(desktopTocQuery);

      if (desktopTocQuery.addEventListener) {
        desktopTocQuery.addEventListener("change", syncDetailsMode);
      } else if (desktopTocQuery.addListener) {
        desktopTocQuery.addListener(syncDetailsMode);
      }
    }
    setActiveLink(links, headings[0].id);
    observeHeadings(headings, links);
  }

  document.addEventListener("DOMContentLoaded", buildToc);
})();
