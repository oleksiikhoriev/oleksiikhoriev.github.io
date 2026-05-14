(function () {
  "use strict";

  function buildPdfFilename() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length === 1) m = "0" + m;
    if (day.length === 1) day = "0" + day;
    return "CV_Oleksii_Khoriev_" + y + "-" + m + "-" + day + ".pdf";
  }

  function loadDocument(path) {
    return fetch(path, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("Could not load " + path + " (" + res.status + ")");
      return res.text();
    }).then(function (html) {
      return new DOMParser().parseFromString(html, "text/html");
    });
  }

  function cloneChapterChildren(sourceEl) {
    var box = document.createElement("div");
    box.className = "cv-pdf-chapter";
    var kids = sourceEl.children;
    for (var i = 0; i < kids.length; i++) {
      box.appendChild(kids[i].cloneNode(true));
    }
    return box;
  }

  function buildPdfRoot(docs) {
    var byFile = {};
    docs.forEach(function (entry) {
      byFile[entry.path] = entry.doc;
    });

    var root = document.createElement("div");
    root.id = "cv-pdf-root";
    root.className = "info-content cv-pdf-root";

    var header = document.createElement("header");
    header.className = "cv-pdf-header";
    var h1 = document.createElement("h1");
    h1.textContent = "OLEKSII KHORIEV";
    var sub = document.createElement("p");
    sub.textContent = "Senior DevOps / SRE / Platform Engineer";
    header.appendChild(h1);
    header.appendChild(sub);
    root.appendChild(header);

    var order = [
      { path: "contact.html", selector: ".info-content" },
      { path: "about.html", selector: ".info-content" },
      { path: "achievements.html", selector: ".info-content" },
      { path: "skills.html", selector: ".info-content" },
      { path: "experience.html", selector: ".info-content" },
      { path: "other.html", selector: "#cv-certifications" },
      { path: "other.html", selector: "#cv-education" },
    ];

    order.forEach(function (spec, index) {
      var doc = byFile[spec.path];
      var el = doc.querySelector(spec.selector);
      if (!el) throw new Error("Missing " + spec.selector + " in " + spec.path);
      var chapter = cloneChapterChildren(el);
      if (index === 0) chapter.classList.add("cv-pdf-chapter--first");
      root.appendChild(chapter);
    });

    return root;
  }

  function waitForLayout() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          resolve();
        });
      });
    });
  }

  function waitForImages(container) {
    var imgs = container.querySelectorAll("img");
    return Promise.all(
      Array.prototype.map.call(imgs, function (img) {
        img.loading = "eager";
        if (img.complete && img.naturalWidth > 0) {
          return Promise.resolve();
        }
        return new Promise(function (resolve) {
          function done() {
            img.removeEventListener("load", done);
            img.removeEventListener("error", done);
            resolve();
          }
          img.addEventListener("load", done);
          img.addEventListener("error", done);
        });
      })
    );
  }

  /**
   * html2canvas often adds extra blank pixels at the bottom of #cv-pdf-root.
   * That becomes a full empty PDF page when slicing. Crop to the last row
   * that still has real ink (text / lines), with a small safety margin.
   */
  function trimCanvasBottomWhitespace(canvas) {
    var cw = canvas.width;
    var ch = canvas.height;
    if (ch < 2 || cw < 1) {
      return canvas;
    }
    var ctx = canvas.getContext("2d");
    if (!ctx) {
      return canvas;
    }
    var thr = 248;
    var sampleX = Math.max(1, Math.floor(cw / 400));
    var stripH = 64;
    var lastInk = -1;
    var y;
    try {
      for (y = ch; y > 0; y -= stripH) {
        var stripTop = Math.max(0, y - stripH);
        var h = y - stripTop;
        var d = ctx.getImageData(0, stripTop, cw, h).data;
        var rowW = cw * 4;
        var ry;
        for (ry = h - 1; ry >= 0; ry -= 1) {
          var rowOffset = ry * rowW;
          var x;
          for (x = 0; x < cw; x += sampleX) {
            var i = rowOffset + x * 4;
            if (d[i] < thr || d[i + 1] < thr || d[i + 2] < thr) {
              lastInk = stripTop + ry;
              break;
            }
          }
          if (lastInk >= 0) {
            break;
          }
        }
        if (lastInk >= 0) {
          break;
        }
      }
    } catch (e) {
      return canvas;
    }
    if (lastInk < 0) {
      return canvas;
    }
    var newH = Math.min(ch, lastInk + 1 + 2);
    if (newH >= ch) {
      return canvas;
    }
    var out = document.createElement("canvas");
    out.width = cw;
    out.height = newH;
    var o = out.getContext("2d");
    if (!o) {
      return canvas;
    }
    o.fillStyle = "#ffffff";
    o.fillRect(0, 0, cw, newH);
    o.drawImage(canvas, 0, 0, cw, newH, 0, 0, cw, newH);
    return out;
  }

  /**
   * jsPDF: slice the tall canvas into horizontal strips (one per page).
   * Drawing the full image with negative Y repeats content at page breaks.
   */
  function canvasToPdf(canvas, filename) {
    var JsPdf = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!JsPdf) {
      throw new Error("jsPDF did not load from CDN (check global name).");
    }
    var pdf = new JsPdf({
      orientation: "p",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    var pageWidth = pdf.internal.pageSize.getWidth();
    var pageHeight = pdf.internal.pageSize.getHeight();
    var marginX = 16;
    var marginY = 8;
    var usableW = pageWidth - 2 * marginX;
    var usableH = pageHeight - 2 * marginY;

    var cw = canvas.width;
    var ch = canvas.height;
    if (cw < 1 || ch < 1) {
      throw new Error("Canvas has invalid dimensions.");
    }

    // Height in mm if the full canvas is scaled to usableW
    var totalHmm = (ch * usableW) / cw;
    // Source pixels per one page of usable height (same aspect ratio)
    var pxPerPage = (usableH / totalHmm) * ch;
    if (pxPerPage < 1) {
      pxPerPage = ch;
    }

    var yPx = 0;
    var pageIndex = 0;

    while (yPx < ch) {
      var remaining = ch - yPx;
      var slicePx = Math.min(Math.max(1, Math.round(pxPerPage)), remaining);

      var sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = cw;
      sliceCanvas.height = slicePx;
      var sctx = sliceCanvas.getContext("2d");
      if (!sctx) {
        throw new Error("Could not get slice canvas context.");
      }
      sctx.fillStyle = "#ffffff";
      sctx.fillRect(0, 0, cw, slicePx);
      sctx.drawImage(canvas, 0, yPx, cw, slicePx, 0, 0, cw, slicePx);

      var sliceData = sliceCanvas.toDataURL("image/jpeg", 0.92);
      var sliceHmm = (slicePx * usableW) / cw;

      if (pageIndex > 0) {
        pdf.addPage();
      }
      pdf.addImage(sliceData, "JPEG", marginX, marginY, usableW, sliceHmm);

      yPx += slicePx;
      pageIndex += 1;
    }

    pdf.save(filename);
  }

  function assertCanvasHasPixels(canvas) {
    var w = Math.min(80, canvas.width);
    var h = Math.min(80, canvas.height);
    if (w < 1 || h < 1) return false;
    var ctx = canvas.getContext("2d");
    if (!ctx) return false;
    var data = ctx.getImageData(0, 0, w, h).data;
    var i;
    var n = 0;
    for (i = 0; i < data.length; i += 16) {
      n += data[i] + data[i + 1] + data[i + 2];
    }
    return n > 10;
  }

  function runPdfDownload() {
    var statusEl = document.getElementById("cv-pdf-status");
    var btn = document.getElementById("cv-pdf-download");

    if (typeof html2canvas === "undefined") {
      statusEl.textContent = "html2canvas failed to load. Check network / ad-blocker.";
      return;
    }

    btn.disabled = true;
    statusEl.textContent = "Loading CV pages…";

    var root = null;
    var uniquePaths = ["contact.html", "about.html", "achievements.html", "skills.html", "experience.html", "other.html"];

    Promise.all(uniquePaths.map(function (path) {
      return loadDocument(path).then(function (doc) {
        return { path: path, doc: doc };
      });
    })).then(function (docs) {
      statusEl.textContent = "Rendering to canvas…";
      root = buildPdfRoot(docs);
      document.body.appendChild(root);
      return waitForImages(root);
    }).then(function () {
      return waitForLayout();
    }).then(function () {
      return html2canvas(root, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
    }).then(function (canvas) {
      if (!assertCanvasHasPixels(canvas)) {
        throw new Error(
          "Canvas render looks empty (html2canvas). Try Chrome/Firefox or disable strict tracking protection."
        );
      }
      statusEl.textContent = "Building PDF file…";
      canvasToPdf(trimCanvasBottomWhitespace(canvas), buildPdfFilename());
      statusEl.textContent = "Done. If the download did not start, allow downloads for this site.";
    }).catch(function (err) {
      statusEl.textContent = err.message || String(err);
    }).then(function () {
      if (root && root.parentNode) {
        root.parentNode.removeChild(root);
      }
      btn.disabled = false;
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("cv-pdf-download");
    if (btn) btn.addEventListener("click", runPdfDownload);
  });
})();
