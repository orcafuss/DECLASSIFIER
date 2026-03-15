let files = [];
let score = 0;
let level = 1;
let lastDocIndex = null;
let comboCount = 0;
let comboTimer = null;
let perfectCombo = true; // true until a combo expires on this document
let docComboTotal = 0;   // sum of all points from combos on current doc (for toast)
let inCombo = false;     // true once first click of current combo streak

const basePoints = 10;
const comboIncrement = 5;
const comboMax = 30;

// ── Circumference for the combo arc (r=43)
const COMBO_CIRCUMFERENCE = 2 * Math.PI * 43;

const scoreEl       = document.getElementById("score");
const levelEl       = document.getElementById("level");
const container     = document.getElementById("document-container");
const comboDisplay  = document.getElementById("combo-display");
const comboArc      = document.getElementById("combo-arc");
const comboMult     = document.getElementById("combo-multiplier");
const comboLabelEl  = document.getElementById("combo-label");
const toastArea     = document.getElementById("score-toasts");

// Initialise arc
comboArc.style.strokeDasharray  = COMBO_CIRCUMFERENCE;
comboArc.style.strokeDashoffset = COMBO_CIRCUMFERENCE;

function getComboTimeout() {
    if (level <= 10) return 800;
    if (level <= 20) return 750;
    if (level <= 30) return 700;
    if (level <= 40) return 650;
    if (level <= 40) return 600;
    if (level <= 100) return 550;
    return 500;
}

function getRedactPercentage() {
    if (level <= 10) return { min: 0.05,  max: 0.10 };
    if (level <= 20) return { min: 0.075, max: 0.15 };
    if (level <= 30) return { min: 0.10,  max: 0.20 };
    if (level <= 40) return { min: 0.10,  max: 0.25 };
    if (level <= 50) return { min: 0.10,  max: 0.30 };
    return              { min: 0.15,  max: 0.30 };
}

function getDocStyle(doc) {
    const d = doc.date.trim();
    if (d.toUpperCase() === "UNKNOWN") return "parchment";
    const circa = d.match(/^c\.\s*(\d+)$/i);
    const year = circa ? parseInt(circa[1], 10) : parseInt(d, 10);
    if (isNaN(year)) return "";
    if (year < 1700)  return "parchment";
    if (year < 1900)  return "aged";
    return "";
}

// ── Score ─────────────────────────────────────────────────────────────────────
function updateScore(amount) {
    score += amount;
    scoreEl.textContent = `${score} POINTS`;
}

// ── Combo-arc color ───────────────────────────────────────────────────────────
const comboArcColors = ['#e99270','#f28c6f','#f36c5c','#f03d3d','#d90000'];

function getComboClass(points) {
    if (points >= 30) return "combo-30";
    if (points >= 25) return "combo-25";
    if (points >= 20) return "combo-20";
    if (points >= 15) return "combo-15";
    return "combo-10";
}

function getComboColorIndex(points) {
    if (points >= 30) return 4;
    if (points >= 25) return 3;
    if (points >= 20) return 2;
    if (points >= 15) return 1;
    return 0;
}

// ── Update the circular combo widget ─────────────────────────────────────────
function updateComboDisplay(active) {
    if (!active || comboCount <= 0) {
        comboDisplay.classList.remove("visible");
        comboArc.style.strokeDashoffset = COMBO_CIRCUMFERENCE;
        return;
    }

    comboDisplay.classList.add("visible");

    const points = Math.min(basePoints + (comboCount - 1) * comboIncrement, comboMax);
    const colorIndex = getComboColorIndex(points);
    comboArc.style.stroke = comboArcColors[colorIndex];
    comboMult.style.color = comboArcColors[colorIndex];
    comboMult.textContent = `×${comboCount}`;

    // Arc fills as combo timer counts down — we animate via a CSS transition
    // reset to full on each click
    comboArc.style.strokeDashoffset = 0;
}

// Reset arc to empty (timer expired animation)
function drainComboArc() {
    comboArc.style.transition = `stroke-dashoffset ${getComboTimeout()}ms linear`;
    comboArc.style.strokeDashoffset = COMBO_CIRCUMFERENCE;
}

// ── Toast notifications ───────────────────────────────────────────────────────
// Each toast is absolutely positioned at its spawn offset and never moves.
const TOAST_LINE_HEIGHT = 32; // px between consecutive toasts
let toastOffset = 0;          // next available top offset within #score-toasts

function spawnToast(label, points, cssClass) {
    const text = label ? `${label} +${points}` : `+${points}`;
    const el = document.createElement("div");
    el.className = `score-toast ${cssClass}`;
    el.textContent = text;
    el.style.top = toastOffset + "px";
    toastArea.appendChild(el);

    toastOffset += TOAST_LINE_HEIGHT;

    el.addEventListener("animationend", () => {
        el.remove();
        toastOffset = Math.max(0, toastOffset - TOAST_LINE_HEIGHT);
    });
}

// ── Random doc index (no repeats) ────────────────────────────────────────────
function getTextIndex() {
    if (files.length === 1) return 0;
    let i;
    do { i = Math.floor(Math.random() * files.length); }
    while (i === lastDocIndex);
    lastDocIndex = i;
    return i;
}

// ── Redaction ─────────────────────────────────────────────────────────────────
function redact(text) {
    const words = text.split(" ");

    const wordInfos = words.map((word, index) => {
        const match = word.match(/^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/);
        let prefix = "", core = word, suffix = "";
        if (match) { prefix = match[1]; core = match[2]; suffix = match[3]; }
        return { word, index, prefix, core, suffix, isRedactable: core.length >= 4 };
    });

    const redactableCount = wordInfos.filter(w => w.isRedactable).length;
    const { min, max } = getRedactPercentage();
    const redactPercentage = Math.random() * (max - min) + min;
    const wordsToRedact = Math.max(2, Math.ceil(redactableCount * redactPercentage));

    const redactableIndices = wordInfos
        .filter(w => w.isRedactable)
        .map(w => w.index)
        .sort(() => Math.random() - 0.5)
        .slice(0, wordsToRedact);

    const redacted = wordInfos.map(w => {
        if (redactableIndices.includes(w.index)) {
            return w.prefix + `<span class="redacted">${w.core}</span>` + w.suffix;
        }
        return w.word;
    });

    return redacted.join(" ");
}

// ── Build document HTML ───────────────────────────────────────────────────────
function buildDocHTML(doc) {
    return `
        <div class="stamp" id="declassified-stamp">DECLASSIFIED</div>
        <div class="doc-header">
            <span class="doc-label">DOCUMENT ID:</span><span class="doc-value">${doc.id}</span>
            <span class="doc-label">SOURCE:</span><span class="doc-value">${doc.source}</span>
            <span class="doc-label">REFERENCE:</span><span class="doc-value">${doc.reference}</span>
            <span class="doc-label">DATE:</span><span class="doc-value">${doc.date}</span>
            <span class="doc-label">CLASSIFICATION:</span><span class="classification doc-value">REDACTED</span>
        </div>
        <p>${redact(doc.content)}</p>
    `;
}



// ── Attach click handlers ─────────────────────────────────────────────────────
const animatingDocs = [];

function attachClicks(docEl) {
    docEl.querySelectorAll(".redacted").forEach(span => {
        const clickHandler = () => {
            comboCount++;
            inCombo = true;
            let points = Math.min(basePoints + (comboCount - 1) * comboIncrement, comboMax);

            updateScore(points);
            docComboTotal += points;

            // Point popup
            const popup = document.createElement("div");
            popup.className = `point-popup ${getComboClass(points)}`;
            popup.textContent = `+${points}`;
            document.body.appendChild(popup);

            requestAnimationFrame(() => {
                const rect = span.getBoundingClientRect();
                popup.style.left = rect.left + window.scrollX + rect.width / 2 - popup.offsetWidth / 2 + "px";
                popup.style.top  = rect.top  + window.scrollY - popup.offsetHeight - 5 + "px";
            });
            setTimeout(() => popup.remove(), 500);

            // Combo circle
            // Reset arc transition so it snaps to full on click
            comboArc.style.transition = "stroke-dashoffset 0.05s ease, stroke 0.2s ease";
            updateComboDisplay(true);
            // Then start draining
            requestAnimationFrame(() => {
                setTimeout(() => drainComboArc(), 60);
            });

            // Fade out redaction
            span.classList.add("fade-out");
            setTimeout(() => {
                span.classList.remove("redacted", "fade-out");

                if (docEl.querySelectorAll(".redacted").length === 0) {
                    // ── Document complete ──
                    const stamp = docEl.querySelector("#declassified-stamp");
                    if (stamp) stamp.classList.add("stamp-appear");
                    docEl.querySelector(".classification").textContent = "DECLASSIFIED";

                    // Flush current combo as a toast before clearing
                    flushComboToast();

                    // Perfect combo bonus — scales with combo depth:
                    // base 30 pts (triggered at max combo ×5+), then +5 per
                    // redaction beyond the 5th in the streak.
                    if (perfectCombo && docComboTotal > 0) {
                        const extraClicks = Math.max(0, comboCount - 5);
                        const bonus = comboCount >= 5 ? 30 + extraClicks * 5 : 0;
                        if (bonus > 0) {
                            updateScore(bonus);
                            setTimeout(() => spawnToast("PERFECT COMBO", bonus, "combo-perfect"), 200);
                        }
                    }

                    setTimeout(() => nextDocument(), 500);

                    // Reset doc-level state
                    if (comboTimer) clearTimeout(comboTimer);
                    comboCount = 0;
                    perfectCombo = true;
                    docComboTotal = 0;
                    inCombo = false;
                    updateComboDisplay(false);
                }
            }, 150);

            // Combo timer
            if (comboTimer) clearTimeout(comboTimer);
            comboTimer = setTimeout(() => {
                // Combo expired — fire toast if we had a meaningful combo
                flushComboToast();
                comboCount = 0;
                inCombo = false;
                perfectCombo = false; // combo broke
                updateComboDisplay(false);
            }, getComboTimeout());

            span.removeEventListener("click", clickHandler);
        };

        span.addEventListener("click", clickHandler);
    });
}

// ── Flush a combo to a toast notification ────────────────────────────────────
// Called when a combo expires OR when a document is completed
let lastFlushedTotal = 0;

function flushComboToast() {
    const earnedThisCombo = docComboTotal - lastFlushedTotal;
    if (earnedThisCombo <= 0) { lastFlushedTotal = docComboTotal; return; }

    const cssClass = getComboClass(Math.min(basePoints + (comboCount - 1) * comboIncrement, comboMax));

    if (comboCount >= 2) {
        spawnToast("COMBO", earnedThisCombo, cssClass);
    } else {
        spawnToast(null, earnedThisCombo, cssClass);
    }

    lastFlushedTotal = docComboTotal;
}

function nextDocument() {
    docComboTotal = 0;
    lastFlushedTotal = 0;
    perfectCombo = true;
    toastOffset = 0;

    const oldDoc = document.querySelector(".document.active");
    oldDoc.classList.remove("active");
    oldDoc.classList.add("exit-right");
    oldDoc.style.zIndex = 2;
    animatingDocs.push(oldDoc);

    const docData = files[getTextIndex()];
    const style = getDocStyle(docData);
    const newDoc = document.createElement("div");
    newDoc.className = "document enter-left" + (style ? ` ${style}` : "");
    newDoc.innerHTML = buildDocHTML(docData);
    newDoc.style.zIndex = 3;
    container.appendChild(newDoc);
    attachClicks(newDoc);

    newDoc.getBoundingClientRect();
    requestAnimationFrame(() => {
        newDoc.classList.add("active");
        newDoc.classList.remove("enter-left");
    });

    oldDoc.addEventListener('transitionend', () => {
        const index = animatingDocs.indexOf(oldDoc);
        if (index > -1) animatingDocs.splice(index, 1);
        oldDoc.remove();
    }, { once: true });

    level++;
    levelEl.textContent = `DOCUMENT ${level}`;
}

function init() {
    const docData  = files[getTextIndex()];
    const firstDoc = document.querySelector(".document.active");
    const style = getDocStyle(docData);
    if (style) firstDoc.classList.add(style);
    firstDoc.innerHTML = buildDocHTML(docData);
    attachClicks(firstDoc);
}

fetch("assets/data.json")
    .then(r => r.json())
    .then(data => {
        files = data;
        init();
    });