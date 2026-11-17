(function () {
  "use strict";
  var SERVICES = window.SERVICES || [];
  var ENDPOINT = (window.CONFIG && window.CONFIG.ENDPOINT) || "";
  var UNIT_TEXT = { m2: "square metres (m²)", lm: "metres in length", item: "how many", room: "how many rooms", day: "how many days" };
  var MAX_PHOTOS = 5, MAX_EDGE = 1600, JPEG_Q = 0.75;
  var started = Date.now();

  // ---- services list on page + dropdown
  var byTrade = {};
  SERVICES.forEach(function (s) { (byTrade[s.trade] = byTrade[s.trade] || []).push(s); });
  var trades = document.getElementById("trades");
  var select = document.getElementById("service");
  Object.keys(byTrade).forEach(function (t) {
    var card = document.createElement("div"); card.className = "trade";
    var h = document.createElement("h3"); h.textContent = t; card.appendChild(h);
    var ul = document.createElement("ul");
    var og = document.createElement("optgroup"); og.label = t;
    byTrade[t].forEach(function (s) {
      var li = document.createElement("li"); li.textContent = s.name; ul.appendChild(li);
      var o = document.createElement("option"); o.value = s.code; o.textContent = s.name; og.appendChild(o);
    });
    card.appendChild(ul); trades.appendChild(card); select.appendChild(og);
  });
  var other = document.createElement("option"); other.value = "OTHER"; other.textContent = "Something else (describe below)";
  select.appendChild(other);

  // ---- quantity row depends on unit
  var qtyRow = document.getElementById("qty-row"), qty = document.getElementById("quantity"), hint = document.getElementById("unit-hint");
  select.addEventListener("change", function () {
    var s = SERVICES.find(function (x) { return x.code === select.value; });
    if (s && UNIT_TEXT[s.unit]) { qtyRow.hidden = false; hint.textContent = "(" + UNIT_TEXT[s.unit] + ")"; qty.required = true; }
    else { qtyRow.hidden = true; qty.value = ""; qty.required = false; }
  });

  // ---- photos: resize in the browser so uploads are small
  var photoInput = document.getElementById("photos"), photoNote = document.getElementById("photo-note");
  photoInput.addEventListener("change", function () {
    var n = photoInput.files.length;
    photoNote.textContent = n > MAX_PHOTOS ? "Only the first " + MAX_PHOTOS + " photos will be sent." : (n ? n + " photo(s) selected." : "Photos help us give a more accurate price.");
  });
  function resize(file) {
    return new Promise(function (resolve) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        var c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        resolve({ name: file.name.replace(/\.[^.]+$/, "") + ".jpg", data: c.toDataURL("image/jpeg", JPEG_Q).split(",")[1] });
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  // ---- validation
  var form = document.getElementById("enquiry"), err = document.getElementById("form-error"), btn = document.getElementById("submit-btn");
  var POSTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}$/i;
  function fail(msg, el) { err.textContent = msg; err.hidden = false; if (el) { el.classList.add("invalid"); el.focus(); } return false; }
  function validate() {
    err.hidden = true;
    Array.prototype.forEach.call(form.querySelectorAll(".invalid"), function (e) { e.classList.remove("invalid"); });
    var req = ["service", "description", "firstName", "lastName", "email", "phone", "address1", "town", "postcode"];
    for (var i = 0; i < req.length; i++) {
      var el = document.getElementById(req[i]);
      if (!el.value.trim()) return fail("Please fill in: " + form.querySelector("label[for=" + req[i] + "]").textContent.replace(/\s*\(.*$/, ""), el);
    }
    if (qty.required && !(parseFloat(qty.value) > 0)) return fail("Please give a rough quantity.", qty);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(document.getElementById("email").value.trim())) return fail("Please check your email address.", document.getElementById("email"));
    if (!POSTCODE.test(document.getElementById("postcode").value.trim())) return fail("Please enter a full UK postcode, e.g. CV6 1AA.", document.getElementById("postcode"));
    if (!document.getElementById("consentContact").checked) return fail("Please tick the first box so we can reply to your enquiry.", document.getElementById("consentContact"));
    return true;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!validate()) return;
    btn.disabled = true; btn.textContent = "Sending…";
    var files = Array.prototype.slice.call(photoInput.files, 0, MAX_PHOTOS);
    Promise.all(files.map(resize)).then(function (photos) {
      var v = function (id) { return document.getElementById(id).value.trim(); };
      var payload = {
        service: v("service"), quantity: qty.value ? parseFloat(qty.value) : null, description: v("description"), urgency: v("urgency"),
        firstName: v("firstName"), lastName: v("lastName"), email: v("email"), phone: v("phone"),
        address1: v("address1"), town: v("town"), postcode: v("postcode").toUpperCase(),
        consentContact: document.getElementById("consentContact").checked,
        consentMarketing: document.getElementById("consentMarketing").checked,
        consentVersion: "v1", website: v("website"), elapsedMs: Date.now() - started,
        source: new URLSearchParams(location.search).get("src") || "Website",
        photos: photos.filter(Boolean)
      };
      if (!ENDPOINT) {
        console.log("TEST MODE - payload that would be sent:", Object.assign({}, payload, { photos: payload.photos.length + " photo(s)" }));
        return { ok: true, ref: "TEST-MODE" };
      }
      // text/plain body avoids a CORS preflight; Apps Script returns JSON.
      return fetch(ENDPOINT, { method: "POST", body: JSON.stringify(payload) })
        .then(function (r) { return r.json(); })
        .catch(function () { return { ok: true, ref: "(sent)" }; });
    }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || "Something went wrong.");
      form.hidden = true;
      document.getElementById("thanks-email").textContent = document.getElementById("email").value.trim();
      document.getElementById("thanks-ref").textContent = res.ref;
      var t = document.getElementById("thanks"); t.hidden = false; t.focus();
    }).catch(function (x) {
      fail(x.message + " Please try again, or call 07802 576433.");
      btn.disabled = false; btn.textContent = "Send and get my price guide";
    });
  });
})();
