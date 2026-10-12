/* DAREL HIKMAH INTERNATIONAL ACADEMY
   Main JavaScript file. Plain vanilla JavaScript, no libraries.

   Features in this file:
   1. Mobile navigation menu
   2. Header shadow on scroll and scroll-to-top button
   3. Image placeholder fallback for missing images
   4. Gentle reveal-on-scroll animation (respects reduced motion)
5. Portal panel tabs (used by older portal screens)
   6. Admissions enquiry form demonstration with WhatsApp alternative
   7. Scroll progress line, hero depth, heading rules, navigation marker,
      programme stage rail, questions accordion and a soft page fade

   The portal screens themselves live in js/portal.js. */

var WHATSAPP_NUMBER = "2348058519527";

var REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

/* 1. Mobile navigation menu ------------------------------------------- */
function setUpMobileNav() {
  var toggleButton = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".site-nav");

  if (!toggleButton || !nav) {
    return;
  }

  function closeMenu() {
    nav.classList.remove("is-open");
    toggleButton.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    nav.classList.add("is-open");
    toggleButton.setAttribute("aria-expanded", "true");
  }

  toggleButton.addEventListener("click", function () {
    if (nav.classList.contains("is-open")) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  nav.addEventListener("click", function (event) {
    if (event.target.closest("a")) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      closeMenu();
      toggleButton.focus();
    }
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth >= 1100) {
      closeMenu();
    }
  });
}

/* 2. Header shadow and scroll-to-top button --------------------------- */
function setUpScrollTools() {
  var header = document.querySelector(".site-header");
  var toTopButton = document.querySelector(".to-top");

  function updateOnScroll() {
    var scrolled = window.scrollY > 20;

    if (header) {
      header.classList.toggle("is-scrolled", scrolled);
    }

    if (toTopButton) {
      toTopButton.classList.toggle("is-visible", window.scrollY > 500);
    }
  }

  window.addEventListener("scroll", updateOnScroll, { passive: true });
  updateOnScroll();

  if (toTopButton) {
    toTopButton.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: REDUCED_MOTION.matches ? "auto" : "smooth" });
    });
  }
}

/* 3. Image placeholders ----------------------------------------------
   If an image file is missing, hide the broken image and show a labelled
   placeholder that displays the file name you are expected to supply. */
function setUpImagePlaceholders() {
  var images = document.querySelectorAll(".photo img");

  Array.prototype.forEach.call(images, function (image) {
    var frame = image.closest(".photo");

    function markAsFilled() {
      if (frame) {
        frame.classList.add("photo--filled");
      }
    }

    function markAsMissing() {
      if (frame) {
        frame.classList.remove("photo--filled");
        frame.classList.add("photo--empty");
        image.style.display = "none";
      }
    }

    image.addEventListener("load", markAsFilled);
    image.addEventListener("error", markAsMissing);

    // An image can finish loading before this script runs, so check the
    // current state of the image as well as listening for future events.
    if (image.complete) {
      if (image.naturalWidth > 0) {
        markAsFilled();
      } else {
        markAsMissing();
      }
    }
  });
}

/* 4. Reveal on scroll ------------------------------------------------ */
function setUpReveal() {
  var items = document.querySelectorAll(".reveal");

  if (!items.length) {
    return;
  }

  if (REDUCED_MOTION.matches || !("IntersectionObserver" in window)) {
    Array.prototype.forEach.call(items, function (item) {
      item.classList.add("is-revealed");
    });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  Array.prototype.forEach.call(items, function (item) {
    // Items sitting side by side fade in one after another instead of all at once.
    var group = item.parentNode.querySelectorAll(".reveal");

    Array.prototype.forEach.call(group, function (sibling, index) {
      if (sibling === item) {
        item.style.transitionDelay = Math.min(index, 4) * 0.07 + "s";
      }
    });

    observer.observe(item);
  });
}

/* 5. Portal tabs ------------------------------------------------------ */
function setUpPortalTabs() {
  var tabGroups = document.querySelectorAll("[data-portal-tabs]");

  Array.prototype.forEach.call(tabGroups, function (group) {
    var tabs = group.querySelectorAll(".portal-tab");
    var panels = document.querySelectorAll("[data-portal-panel]");

    function showPanel(tab) {
      var target = tab.getAttribute("aria-controls");

      Array.prototype.forEach.call(tabs, function (item) {
        item.setAttribute("aria-selected", item === tab ? "true" : "false");
      });

      Array.prototype.forEach.call(panels, function (panel) {
        if (panel.id === target) {
          panel.removeAttribute("hidden");
        } else if (panel.getAttribute("data-portal-group") === group.getAttribute("data-portal-tabs")) {
          panel.setAttribute("hidden", "");
        }
      });
    }

    Array.prototype.forEach.call(tabs, function (tab, index) {
      tab.addEventListener("click", function () {
        showPanel(tab);
      });

      tab.addEventListener("keydown", function (event) {
        var nextIndex = index;

        if (event.key === "ArrowRight") {
          nextIndex = (index + 1) % tabs.length;
        } else if (event.key === "ArrowLeft") {
          nextIndex = (index - 1 + tabs.length) % tabs.length;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = tabs.length - 1;
        } else {
          return;
        }

        event.preventDefault();
        tabs[nextIndex].focus();
        showPanel(tabs[nextIndex]);
      });
    });
  });
}

/* 6. Admissions enquiry form ------------------------------------------
   This form has no server connected. It only checks the fields and then
   offers a WhatsApp message the visitor can send to the school. */
function setUpAdmissionForm() {
  var form = document.querySelector("[data-admission-form]");

  if (!form) {
    return;
  }

  var resultBox = form.querySelector(".form-result");
  var rows = form.querySelectorAll(".form-row");

  function clearErrors() {
    Array.prototype.forEach.call(rows, function (row) {
      row.classList.remove("has-error");
      var errorText = row.querySelector(".form-field-error");
      if (errorText) {
        errorText.textContent = "";
      }
    });
  }

  function showRowError(row, message) {
    var errorText = row.querySelector(".form-field-error");
    row.classList.add("has-error");
    if (errorText) {
      errorText.textContent = message;
    }
  }

  function buildWhatsAppLink() {
    var message = [
      "Admission enquiry - Darel Hikmah International Academy",
      "Name: " + form.elements.guardianName.value,
      "Phone: " + form.elements.phone.value,
      "Email: " + (form.elements.email ? form.elements.email.value || "Not provided" : "Not provided"),
      "Programme of interest: " + form.elements.programme.value,
      "Child's name: " + (form.elements.childName ? form.elements.childName.value || "Not provided yet" : "Not provided yet"),
      "Message: " + (form.elements.message ? form.elements.message.value || "None" : "None")
    ].join("\n");

    return "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(message);
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    clearErrors();

    var firstInvalidRow = null;
    var isValid = true;

    Array.prototype.forEach.call(rows, function (row) {
      var field = row.querySelector("input, select, textarea");

      if (!field || !field.required) {
        return;
      }

      var value = field.value.trim();
      var message = "";

      if (!value) {
        message = "Please complete this field.";
      } else if (field.type === "email" && value.indexOf("@") === -1) {
        message = "Please enter a valid email address.";
      } else if (field.type === "tel" && value.replace(/[^0-9]/g, "").length < 7) {
        message = "Please enter a valid phone number.";
      }

      if (message) {
        isValid = false;
        showRowError(row, message);
        if (!firstInvalidRow) {
          firstInvalidRow = field;
        }
      }
    });

    if (!isValid) {
      if (firstInvalidRow) {
        firstInvalidRow.focus();
      }
      return;
    }

    var link = resultBox.querySelector("[data-whatsapp-link]");
    if (link) {
      link.href = buildWhatsAppLink();
    }

    resultBox.removeAttribute("hidden");
    resultBox.scrollIntoView({ behavior: REDUCED_MOTION.matches ? "auto" : "smooth", block: "center" });
  });
}

/* 7. Footer year ------------------------------------------------------ */
function setUpFooterYear() {
  var yearField = document.querySelector("[data-current-year]");

  if (yearField) {
    yearField.textContent = new Date().getFullYear();
  }
}

/* 8. Scroll progress line ---------------------------------------------
   A thin gold line at the top of the header that grows as the page is read. */
function setUpScrollProgress() {
  var bar = document.querySelector(".scroll-progress");

  if (!bar || REDUCED_MOTION.matches) {
    return;
  }

  function update() {
    var scrollable = document.documentElement.scrollHeight - window.innerHeight;
    var progress = scrollable > 0 ? window.scrollY / scrollable : 0;
    bar.style.transform = "scaleX(" + Math.min(Math.max(progress, 0), 1) + ")";
  }

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

/* 9. Hero text depth and fade ----------------------------------------
   The hero text drifts up slowly and fades as the visitor scrolls on,
   which gives the background photograph a sense of depth. */
function setUpHeroDepth() {
  var hero = document.querySelector(".hero");
  var heroInner = document.querySelector(".hero__inner");

  if (!hero || !heroInner || REDUCED_MOTION.matches) {
    return;
  }

  var running = false;

  function update() {
    var distance = window.scrollY;

    if (distance > window.innerHeight * 1.2) {
      heroInner.style.opacity = "";
      heroInner.style.transform = "";
      running = false;
      return;
    }

    var fade = Math.max(0.12, 1 - distance / 340);
    heroInner.style.opacity = fade.toFixed(2);
    heroInner.style.transform = "translateY(" + distance * 0.08 + "px)";
    running = false;
  }

  window.addEventListener("scroll", function () {
    if (!running) {
      running = true;
      window.requestAnimationFrame(update);
    }
  }, { passive: true });
}

/* 10. Word by word heading --------------------------------------------
   Each word of the main heading sits inside a mask and slides up, so the
   heading appears to be written line by line. Without JavaScript the
   heading is simply normal text. */
function setUpHeroHeading() {
  var heading = document.querySelector(".hero__text h1");

  if (!heading || REDUCED_MOTION.matches || !heading.textContent.trim()) {
    return;
  }

  var words = heading.textContent.trim().split(/\s+/);

  heading.textContent = "";

  words.forEach(function (word, index) {
    var mask = document.createElement("span");
    var inner = document.createElement("span");

    mask.className = "word";
    inner.className = "word__inner";
    inner.style.setProperty("--word-delay", 0.25 + index * 0.07 + "s");
    inner.textContent = word;

    mask.appendChild(inner);
    heading.appendChild(mask);

    if (index < words.length - 1) {
      heading.appendChild(document.createTextNode(" "));
    }
  });

  heading.classList.add("is-splitting");
}

/* 11. Gold line under section headings -------------------------------
   The short gold line under each section heading draws in from the left
   when the heading scrolls into view. */
function setUpHeadingRules() {
  var headings = document.querySelectorAll(".section__head h2");

  if (!headings.length) {
    return;
  }

  if (REDUCED_MOTION.matches || !("IntersectionObserver" in window)) {
    Array.prototype.forEach.call(headings, function (heading) {
      heading.classList.add("is-drawn");
    });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-drawn");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.6 });

  Array.prototype.forEach.call(headings, function (heading) {
    observer.observe(heading);
  });
}

/* 12. Sliding marker under the navigation ----------------------------
   A gold line sits under the menu item you are on, and slides across to
   whichever item the pointer or keyboard focus moves to. */
function setUpNavIndicator() {
  var list = document.querySelector(".site-nav__list");
  var links = list ? list.querySelectorAll("a") : [];

  if (!list || !links.length) {
    return;
  }

  var indicator = document.createElement("span");
  indicator.className = "nav-indicator";
  list.appendChild(indicator);

  function activeLink() {
    return list.querySelector('a[aria-current="page"]') || links[0];
  }

  function moveTo(link) {
    if (!link || window.innerWidth < 1100) {
      indicator.classList.remove("is-ready");
      return;
    }

    indicator.style.width = link.offsetWidth + "px";
    indicator.style.transform = "translateX(" + link.offsetLeft + "px)";
    indicator.classList.add("is-ready");
  }

  function moveToActive() {
    moveTo(activeLink());
  }

  moveToActive();

  window.addEventListener("resize", moveToActive);

  Array.prototype.forEach.call(links, function (link) {
    link.addEventListener("mouseenter", function () {
      moveTo(link);
    });
    link.addEventListener("focus", function () {
      moveTo(link);
    });
  });

  list.addEventListener("mouseleave", moveToActive);
  list.addEventListener("focusout", function (event) {
    if (!list.contains(event.relatedTarget)) {
      moveToActive();
    }
  });
}

/* 13. Programme stage rail (programmes page) -------------------------
   The dots fill in as each stage of the school is reached while scrolling. */
function setUpStageRail() {
  var rail = document.querySelector(".stage-rail");

  if (!rail) {
    return;
  }

  var railLinks = rail.querySelectorAll(".stage-rail__link");
  var sections = [];

  Array.prototype.forEach.call(railLinks, function (link) {
    var section = document.querySelector(link.getAttribute("href"));

    if (section) {
      sections.push({ link: link, section: section });
    }
  });

  if (!sections.length) {
    return;
  }

  function update() {
    var line = window.innerHeight * 0.4;
    var current = 0;

    sections.forEach(function (item, index) {
      if (item.section.getBoundingClientRect().top <= line) {
        current = index;
      }
    });

    sections.forEach(function (item, index) {
      item.link.classList.toggle("is-active", index === current);
      item.link.classList.toggle("is-done", index < current);
    });
  }

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

/* 14. Questions accordion (admissions page) -------------------------- */
function setUpAccordion() {
  var buttons = document.querySelectorAll(".accordion__button");

  Array.prototype.forEach.call(buttons, function (button) {
    var panel = document.getElementById(button.getAttribute("aria-controls"));

    if (!panel) {
      return;
    }

    button.addEventListener("click", function () {
      var isOpen = button.getAttribute("aria-expanded") === "true";

      // Close the other answers so only one stays open at a time.
      Array.prototype.forEach.call(buttons, function (other) {
        var otherPanel = document.getElementById(other.getAttribute("aria-controls"));

        if (other !== button) {
          other.setAttribute("aria-expanded", "false");

          if (otherPanel) {
            otherPanel.removeAttribute("data-open");
          }
        }
      });

      button.setAttribute("aria-expanded", isOpen ? "false" : "true");

      if (isOpen) {
        panel.removeAttribute("data-open");
      } else {
        panel.setAttribute("data-open", "true");
      }
    });
  });
}

/* 15. Soft fade when moving between pages ----------------------------
   The current page fades out very slightly, then the new page opens. */
function setUpPageTransition() {
  if (REDUCED_MOTION.matches) {
    return;
  }

  var main = document.querySelector("main");

  if (!main) {
    return;
  }

  // Clear the fade when a page is restored from the browser's back cache.
  window.addEventListener("pageshow", function () {
    main.classList.remove("is-leaving");
  });

  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
      return;
    }

    var link = event.target.closest("a");

    if (!link || link.target === "_blank" || !link.getAttribute("href")) {
      return;
    }

    var href = link.getAttribute("href");

    if (href.charAt(0) === "#" || /^(tel:|mailto:|https?:)/.test(href)) {
      return;
    }

    main.classList.add("is-leaving");
    window.setTimeout(function () {
      window.location.href = link.href;
    }, 160);
  });
}

/* Start everything when the page is ready ---------------------------- */
document.addEventListener("DOMContentLoaded", function () {
  if (REDUCED_MOTION.matches) {
    document.documentElement.classList.add("no-motion");
  }

  setUpMobileNav();
  setUpScrollTools();
  setUpImagePlaceholders();
  setUpReveal();
  setUpPortalTabs();
  setUpAdmissionForm();
  setUpFooterYear();
  setUpScrollProgress();
  setUpHeroHeading();
  setUpHeroDepth();
  setUpHeadingRules();
  setUpNavIndicator();
  setUpStageRail();
  setUpAccordion();
  setUpPageTransition();
});
