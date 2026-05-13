window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Global Error: ' + msg + ' at ' + url + ':' + lineNo);
    const statusEl = document.getElementById("currentSetNameLabel");
    if (statusEl) statusEl.textContent = "LỖI HỆ THỐNG: " + msg;
    return false;
};

// CONSTANTS & STATE
const defaultSets = {
    "Chào mừng": [
        { frontMain: "Konnichiwa", frontSub: "こんにちは", backMain: "Xin chào", backSub: "Chào buổi chiều", backSub2: "Câu chào phổ thông trong tiếng Nhật", mastered: false },
        { frontMain: "Arigatou", frontSub: "ありがとう", backMain: "Cảm ơn", backSub: "Lời cảm ơn thân mật", backSub2: "Dùng với bạn bè hoặc người thân", mastered: false }
    ]
};

let sets = {};
let setActivity = JSON.parse(localStorage.getItem("memorylab_set_activity") || "{}");

try {
    const saved = localStorage.getItem("memorylab_sets");
    if (saved && saved !== "{}") {
        sets = JSON.parse(saved);
    } else {
        sets = defaultSets;
        localStorage.setItem("memorylab_sets", JSON.stringify(sets));
    }
} catch (e) {
    console.error("Lỗi parse dữ liệu cũ:", e);
    sets = defaultSets;
}
let currentSetName = localStorage.getItem("memorylab_current_set") || null;

function trackActivity(name) {
    if (!name) return;
    if (!setActivity) setActivity = {};
    setActivity[name] = Date.now();
    localStorage.setItem("memorylab_set_activity", JSON.stringify(setActivity));
}
let currentMode = "all"; 
let cards = [];
let currentIndex = 0;
let autoMode = false;
let randomMode = false;
let autoTimer = null;
let voices = [];

// DOM ELEMENTS
const btnDocs = document.getElementById("btnDocs");
const docOverlay = document.getElementById("docOverlay");
const docList = document.getElementById("docList");
const btnCloseDocs = document.getElementById("btnCloseDocs");
const btnVoiceConfig = document.getElementById("btnVoiceConfig");
const voiceOverlay = document.getElementById("voiceOverlay");
const btnCloseVoice = document.getElementById("btnCloseVoice");

// RESET LOGIC
document.querySelectorAll(".btnReset")?.forEach(btn => {
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (autoMode) stopAuto();
        currentIndex = 0;
        updateCard();
        btn.classList.add("pop-click");
        setTimeout(() => btn.classList.remove("pop-click"), 300);
    });
});

// VOICE SETTINGS
function populateVoices() {
    if (!window.speechSynthesis) return;
    try {
        voices = window.speechSynthesis.getVoices();
        const voiceFrontSelect = document.getElementById("voiceFront");
        const voiceBackSelect = document.getElementById("voiceBack");
        
        if (!voiceFrontSelect || !voiceBackSelect) return;

        if (voices.length === 0) {
            voiceFrontSelect.innerHTML = "<option>Đang tải giọng đọc...</option>";
            voiceBackSelect.innerHTML = "<option>Đang tải giọng đọc...</option>";
            return;
        }

        const options = voices.map((v, i) => `<option value="${i}">${v.name} (${v.lang})</option>`).join("");
        voiceFrontSelect.innerHTML = options;
        voiceBackSelect.innerHTML = options;

        // Ưu tiên tiếng Nhật cho Mặt 1 và tiếng Việt cho Mặt 2
        const jaIdx = voices.findIndex(v => v.lang.toLowerCase().includes("ja"));
        const viIdx = voices.findIndex(v => v.lang.toLowerCase().includes("vi"));

        if (jaIdx !== -1) voiceFrontSelect.value = jaIdx;
        if (viIdx !== -1) voiceBackSelect.value = viIdx;
    } catch (e) {
        console.warn("Speech synthesis init error:", e);
    }
}

if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = populateVoices;
}
populateVoices();

btnVoiceConfig?.addEventListener("click", () => {
    voiceOverlay.style.display = "flex";
    document.body.classList.add("modal-open");
    populateVoices();
});

btnCloseVoice?.addEventListener("click", () => {
    voiceOverlay.style.display = "none";
    document.body.classList.remove("modal-open");
});

function speak(text, voiceIdx) {
    if (!text) return;
    try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const selectedVoice = voices[voiceIdx];
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
        utterance.volume = 1.0;
        utterance.rate = 1.0;
        utterance.pitch = 1.05;
        window.speechSynthesis.speak(utterance);
    } catch (err) {
        console.error("Speech error", err);
    }
}

// DOCUMENTS LOGIC
const staticDocs = ["N5_KOTOBA.txt", "japanese_basic.txt"]; 

btnDocs?.addEventListener("click", () => {
    docOverlay.style.display = "flex";
    document.body.classList.add("modal-open");
    renderDocuments();
});

// DOCUMENT SEARCH LISTENER
document.getElementById("docSearchInput")?.addEventListener("input", (e) => {
    renderDocuments(e.target.value);
});

btnCloseDocs?.addEventListener("click", () => {
    docOverlay.style.display = "none";
    document.body.classList.remove("modal-open");
    const docSearchInput = document.getElementById("docSearchInput");
    if (docSearchInput) docSearchInput.value = "";
});

// UPLOAD DOC LOGIC
const btnUploadDoc = document.getElementById("btnUploadDoc");
const docFileInput = document.getElementById("docFileInput");

btnUploadDoc?.addEventListener("click", () => docFileInput.click());

docFileInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const text = event.target.result;
        const displayName = file.name.replace(".txt", "").toUpperCase();
        importFromText(text, displayName);
        docOverlay.style.display = "none";
        document.body.classList.remove("modal-open");
    };
    reader.readAsText(file);
});

async function renderDocuments(filter = "") {
    const list = staticDocs.filter(docName => 
        docName.toLowerCase().includes(filter.toLowerCase()) || 
        docName.replace(".txt", "").replace(/_/g, " ").toLowerCase().includes(filter.toLowerCase())
    );

    if (list.length === 0) {
        docList.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:14px;">Không tìm thấy tài liệu nào khớp gợi ý.</div>`;
        return;
    }
    
    docList.innerHTML = list.map(docName => {
        const displayName = docName.replace(".txt", "").replace(/_/g, " ").toUpperCase();
        return `
            <div class="deck-card doc-item" data-url="/documents/${docName}" data-name="${displayName}">
                <div class="deck-main-row">
                    <div class="deck-name">${displayName}</div>
                    <div class="deck-count">TÀI LIỆU CÔNG KHAI</div>
                </div>
            </div>
        `;
    }).join("");

    docList.querySelectorAll(".doc-item").forEach(el => {
        el.addEventListener("click", () => {
            const url = el.getAttribute("data-url");
            const name = el.getAttribute("data-name");
            importFromUrl(url, name);
        });
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function importFromUrl(url, setName) {
    try {
        const response = await fetch(url);
        const text = await response.text();
        importFromText(text, setName);
    } catch (e) {
        console.error("Lỗi tải tài liệu:", e);
        alert("Không thể tải tài liệu này. Vui lòng kiểm tra lại kết nối.");
    }
}

function importFromText(text, setName) {
    try {
        const lines = text.split("\n").filter(l => l.trim());
        const newCards = [];
        
        lines.forEach(line => {
            // Support both half-width and full-width pipe, as well as tabs
            const parts = line.split(/[|｜\t]/);
            if (parts.length >= 2) {
                const sideA = parts[0].split("/");
                const sideB = parts[1].split("/");
                newCards.push({
                    frontMain: sideA[0]?.trim() || "",
                    frontSub: sideA.slice(1).map(s => s.trim()).join(" / "),
                    backMain: sideB[0]?.trim() || "",
                    backSub: sideB[1]?.trim() || "",
                    backSub2: sideB.slice(2).map(s => s.trim()).join(" / "),
                    mastered: false
                });
            }
        });

        if (newCards.length > 0) {
            sets[setName] = newCards;
            localStorage.setItem("memorylab_sets", JSON.stringify(sets));
            renderDecks();
            loadSet(setName);
            if (docOverlay) docOverlay.style.display = "none";
            document.body.classList.remove("modal-open");
            alert(`Đã nhập xong ${newCards.length} thẻ vào học phần "${setName}"`);
        } else {
            alert("Định dạng file chưa đúng. File cần có ít nhất một dấu gạch đứng (|) hoặc Tab giữa mặt trước và mặt sau.");
        }
    } catch (e) {
        console.error("Lỗi xử lý text:", e);
        alert("Lỗi khi xử lý dữ liệu. Vui lòng kiểm tra lại định dạng file.");
    }
}

// CORE LOGIC
let sourceCards = [];
let searchFilter = "all";

function loadSet(name, mode = currentMode) {
    if (!name || !sets[name]) return;
    currentSetName = name;
    currentMode = mode;
    sourceCards = sets[name] || [];
    
    trackActivity(name);
    
    if (mode === "mastered") cards = sourceCards.filter(c => c.mastered === true);
    else if (mode === "learning") cards = sourceCards.filter(c => c.mastered !== true);
    else cards = [...sourceCards];
    
    localStorage.setItem("memorylab_current_set", name);
    currentIndex = parseInt(localStorage.getItem(`memorylab_index_${name}_${mode}`)) || 0;
    if (currentIndex >= cards.length) currentIndex = 0;
    
    const label = document.getElementById("currentSetNameLabel");
    if (label) label.textContent = name;
    
    renderDecks();
    updateCard();
}

function renderDecks(popupFilter = "") {
    const deckList = document.getElementById("deckList");
    const popupSetList = document.getElementById("popupSetList");
    if (!deckList || !popupSetList) return;

    deckList.innerHTML = "";
    popupSetList.innerHTML = "";
    
    const allSetNames = Object.keys(sets);
    
    const sortedSets = [...allSetNames].sort((a, b) => (setActivity[b] || 0) - (setActivity[a] || 0));
    const sidebarSets = sortedSets.slice(0, 4);

    sidebarSets.forEach(name => {
         const isActive = name === currentSetName;
         const sidebarItem = document.createElement("div");
         sidebarItem.className = "deck-card" + (isActive ? " active" : "");
         sidebarItem.innerHTML = `
            <div class="deck-main-row">
                <div class="deck-name">${name}</div>
                <div class="deck-count">${sets[name].length} THẺ</div>
            </div>
            <div class="deck-modes-submenu">
                <div class="mini-mode-btn ${isActive && currentMode === "all" ? "active" : ""}" onclick="loadSet('${name}', 'all')">Tất cả</div>
                <div class="mini-mode-btn ${isActive && currentMode === "learning" ? "active" : ""}" onclick="loadSet('${name}', 'learning')">Chưa nhớ</div>
                <div class="mini-mode-btn ${isActive && currentMode === "mastered" ? "active" : ""}" onclick="loadSet('${name}', 'mastered')">Đã nhớ</div>
            </div>
        `;
        sidebarItem.onclick = (e) => {
            if (e.target.closest('.mini-mode-btn')) return;
            loadSet(name);
        };
        deckList.appendChild(sidebarItem);
    });

    const filteredSets = sortedSets.filter(name => name.toLowerCase().includes(popupFilter.toLowerCase()));
    
    if (filteredSets.length === 0 && popupFilter) {
        popupSetList.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:14px;">Không tìm thấy học phần nào.</div>`;
    }

    filteredSets.forEach(name => {
        const popupItem = document.createElement("div");
        popupItem.className = "deck-card";
        popupItem.innerHTML = `
            <div class="deck-main-row">
                <div class="deck-name">${name}</div>
                <div class="deck-count">${sets[name].length} THẺ</div>
            </div>
            <div class="panel-actions-group" style="padding-top:10px; border-top:1px solid var(--border); display:flex; justify-content: space-between;">
                <button class="edit-btn" onclick="openEditModal('${name}')" style="background:none; border:none; cursor:pointer; color:var(--text-muted);"><i data-lucide="pencil-line"></i></button>
                <button class="del-btn" onclick="deleteSet('${name}')" style="background:none; border:none; cursor:pointer; color:var(--text-muted);"><i data-lucide="trash-2"></i></button>
            </div>
        `;
        popupItem.onclick = (e) => {
            if (e.target.closest('button')) return;
            loadSet(name);
            document.getElementById("popupOverlay").style.display = "none";
            document.body.classList.remove("modal-open");
        };
        popupSetList.appendChild(popupItem);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

document.getElementById("popupSearchInput")?.addEventListener("input", (e) => {
    renderDecks(e.target.value);
});

window.deleteSet = (name) => {
    if (confirm(`Bạn chắc chắn muốn xóa học phần "${name}"?`)) {
        delete sets[name];
        saveSets();
        renderDecks();
        if (currentSetName === name) {
            currentSetName = Object.keys(sets)[0] || null;
            if (currentSetName) loadSet(currentSetName);
            else updateCard();
        }
    }
};

const searchOverlay = document.getElementById("searchOverlay");
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const searchDetail = document.getElementById("searchDetail");
const searchDetailContent = document.getElementById("searchDetailContent");
const btnCloseSearch = document.getElementById("btnCloseSearch");
const btnBackToSearch = document.getElementById("btnBackToSearch");
const btnSearch = document.getElementById("btnSearch");

const filterBtns = document.querySelectorAll(".filter-btn");
filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        filterBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        searchFilter = btn.dataset.filter;
        const event = new Event('input', { bubbles: true });
        searchInput.dispatchEvent(event);
    });
});

btnSearch?.addEventListener("click", () => {
    searchOverlay.style.display = "flex";
    searchInput.focus();
    document.body.classList.add("modal-open");
});

btnCloseSearch?.addEventListener("click", () => {
    searchOverlay.style.display = "none";
    document.body.classList.remove("modal-open");
    searchInput.value = "";
    searchResults.innerHTML = "";
    showSearchList();
});

btnBackToSearch?.addEventListener("click", showSearchList);

function showSearchList() {
    searchDetail.style.display = "none";
    searchResults.style.display = "grid";
}

searchInput?.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
        searchResults.innerHTML = "";
        return;
    }

    const matches = [];
    Object.keys(sets).forEach(setName => {
        const inSetName = setName.toLowerCase().includes(query);
        sets[setName].forEach((card, cardIdx) => {
            const inFront = (card.frontMain || "").toLowerCase().includes(query) || (card.frontSub && card.frontSub.toLowerCase().includes(query));
            const inBack = (card.backMain || "").toLowerCase().includes(query) || (card.backSub && card.backSub.toLowerCase().includes(query)) || (card.backSub2 && card.backSub2.toLowerCase().includes(query));
            let matched = false;
            if (searchFilter === "all") matched = inFront || inBack || inSetName;
            else if (searchFilter === "set") matched = inSetName;
            else if (searchFilter === "word") matched = inFront;
            else if (searchFilter === "meaning") matched = inBack;
            if (matched) matches.push({ ...card, setName, originalIdx: cardIdx });
        });
    });
    if (searchFilter === "all" || searchFilter === "set") {
        staticDocs.forEach(docName => {
            if (docName.toLowerCase().includes(query)) {
                const displayName = docName.replace(".txt", "").replace(/_/g, " ").toUpperCase();
                matches.push({ frontMain: displayName, backMain: "TÀI LIỆU CÔNG KHAI", setName: "Hệ thống", isDoc: true, docUrl: `/documents/${docName}` });
            }
        });
    }
    renderSearchResults(matches);
});

function renderSearchResults(matches) {
    showSearchList();
    if (matches.length === 0) {
        searchResults.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);">Không tìm thấy kết quả nào.</div>`;
        return;
    }
    searchResults.innerHTML = matches.map((m, i) => `
        <div class="search-result-item" onclick="viewSearchDetail(${JSON.stringify(m).replace(/"/g, '&quot;')})">
            <div class="search-result-front">${m.frontMain}</div>
            <div class="search-result-back">${m.backMain}</div>
            <div class="search-result-set"> ${m.setName}</div>
        </div>
    `).join("");
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function viewSearchDetail(card) {
    searchResults.style.display = "none";
    searchDetail.style.display = "block";
    if (card.isDoc) {
        searchDetailContent.innerHTML = `
            <span class="label">Tài liệu công khai</span>
            <h2>${card.frontMain}</h2>
            <p style="margin-bottom:20px;">Đây là tài liệu có sẵn trên hệ thống. Bạn có thể nhập tài liệu này vào danh sách học phần của mình.</p>
            <button class="nav-link" onclick="importFromUrl('${card.docUrl}', '${card.frontMain}')" style="width:100%; justify-content:center; background:var(--accent); color:white; border:none; cursor:pointer;">
                <i data-lucide="download"></i> Nhập tài liệu này
            </button>
        `;
    } else {
        searchDetailContent.innerHTML = `
            <span class="label">Mặt trước</span>
            <h2>${card.frontMain}</h2>
            <p>${card.frontSub || ""}</p>
            <span class="label">Mặt sau</span>
            <h2>${card.backMain}</h2>
            <p>${card.backSub || ""}</p>
            <div id="backExplainDetail" style="margin-top:15px; padding:15px; background:rgba(99,102,241,0.1); border-radius:10px; font-size:14px;">
                ${card.backSub2 || "Không có giải thích nâng cao."}
            </div>
            <div style="margin-top:20px; display:flex; gap:10px;">
                <button class="nav-link" onclick="jumpToCard('${card.setName}', ${card.originalIdx})" style="flex:1; justify-content:center; background:var(--accent); color:white; border:none; cursor:pointer;">
                    <i data-lucide="play"></i> Học thẻ này
                </button>
            </div>
        `;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.viewSearchDetail = viewSearchDetail;
window.jumpToCard = (setName, idx) => {
    searchOverlay.style.display = "none";
    document.body.classList.remove("modal-open");
    loadSet(setName);
    currentIndex = idx;
    updateCard();
};

const flashcard = document.getElementById("flashcard");
const flashcardContainer = document.querySelector(".flashcard-container");
const progressText = document.getElementById("progressText");
const frontMain = document.getElementById("frontMain");
const frontSub = document.getElementById("frontSub");
const backMain = document.getElementById("backMain");
const backExample = document.getElementById("backExample");
const backExplain = document.getElementById("backExplain");
const btnNext = document.getElementById("btnNext");
const btnPrev = document.getElementById("btnPrev");
const btnRandom = document.getElementById("btnRandom");
const btnAuto = document.getElementById("btnAuto");
const btnFullscreen = document.getElementById("btnFullscreen");
const btnStruggle = document.getElementById("btnStruggle");
const btnMastered = document.getElementById("btnMastered");
const btnStruggleBack = document.getElementById("btnStruggleBack");
const btnMasteredBack = document.getElementById("btnMasteredBack");
const modeBtns = document.querySelectorAll(".mode-btn");
const speakFront = document.getElementById("speakFront");
const speakBack = document.getElementById("speakBack");
const voiceFrontSelect = document.getElementById("voiceFront");
const voiceBackSelect = document.getElementById("voiceBack");

function setMastery(status) {
    if (!cards.length) return;
    const c = cards[currentIndex];
    c.mastered = status;
    saveSets();
    updateCard();
}
btnStruggle?.addEventListener("click", (e) => { e.stopPropagation(); setMastery(false); });
btnStruggleBack?.addEventListener("click", (e) => { e.stopPropagation(); setMastery(false); });
btnMastered?.addEventListener("click", (e) => { e.stopPropagation(); setMastery(true); });
btnMasteredBack?.addEventListener("click", (e) => { e.stopPropagation(); setMastery(true); });

speakFront.addEventListener("click", (e) => { e.stopPropagation(); speak(frontMain.textContent, voiceFrontSelect.value); });
speakBack.addEventListener("click", (e) => { e.stopPropagation(); speak(backMain.textContent, voiceBackSelect.value); });

const handleFullscreen = (e) => {
  if (e) {
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }
  const isCurrentlyFull = document.body.classList.contains("fullscreen-app");
  document.body.classList.toggle("fullscreen-app", !isCurrentlyFull);
  const iconMarkup = !isCurrentlyFull ? '<i data-lucide="minimize"></i>' : '<i data-lucide="maximize"></i>';
  const btn1 = document.getElementById("btnFullscreen");
  const btn2 = document.getElementById("btnFullscreenBack");
  if (btn1) btn1.innerHTML = iconMarkup;
  if (btn2) btn2.innerHTML = iconMarkup;
  if (typeof lucide !== 'undefined') lucide.createIcons();
};
btnFullscreen?.addEventListener("click", handleFullscreen);
document.getElementById("btnFullscreenBack")?.addEventListener("click", handleFullscreen);

let touchStartX = 0;
let touchStartY = 0;
let currentTranslateX = 0;
let currentRotation = 0;
const SWIPE_THRESHOLD = 100;

flashcardContainer.addEventListener("touchstart", (e) => {
  if (isAnimating) return;
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  flashcard.style.transition = 'none';
  flashcard.style.transformOrigin = 'center 120%';
}, { passive: true });

flashcardContainer.addEventListener("touchmove", (e) => {
  if (isAnimating) return;
  const touch = e.touches[0];
  const deltaX = touch.clientX - touchStartX;
  const deltaY = touch.clientY - touchStartY;
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    currentTranslateX = deltaX;
    currentRotation = (deltaX / window.innerWidth) * 35;
    const isFlipped = flashcard.classList.contains('flipped');
    const baseRotation = isFlipped ? 180 : 0;
    const scale = 1 - Math.abs(deltaX) / (window.innerWidth * 5);
    const opacity = 1 - (Math.abs(deltaX) / (window.innerWidth * 0.6));
    flashcard.style.transform = `translateX(${deltaX}px) translateY(${Math.abs(deltaX) * -0.1}px) rotateY(${baseRotation + currentRotation}deg) rotateZ(${currentRotation * 0.5}deg) scale(${scale})`;
    flashcard.style.opacity = Math.max(0.1, opacity);
  }
}, { passive: true });

flashcardContainer.addEventListener("touchend", () => {
  if (isAnimating) return;
  flashcard.style.transformOrigin = ''; 
  if (Math.abs(currentTranslateX) > SWIPE_THRESHOLD) {
    if (currentTranslateX > 0) prevCard(); else nextCard();
  } else {
    flashcard.style.transition = 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    updateCardPosition();
    setTimeout(() => { if (!isAnimating) { flashcard.style.transition = ''; updateCardPosition(); } }, 500);
  }
  currentTranslateX = 0;
  currentRotation = 0;
});

const btnNewSet = document.getElementById("btnNewSet");
const btnNewSetPopup = document.getElementById("btnNewSetPopup");
const btnSaveSet = document.getElementById("btnSaveSet");
const btnAddCard = document.getElementById("btnAddCard");
const fileInput = document.getElementById("fileInput");
const btnDictionary = document.getElementById("btnDictionary");
const dictOverlay = document.getElementById("dictOverlay");
const btnCloseDict = document.getElementById("btnCloseDict");
const dictKeywordInput = document.getElementById("dictKeywordInput");
const btnDoLookup = document.getElementById("btnDoLookup");
const dictResult = document.getElementById("dictResult");
const dictLoading = document.getElementById("dictLoading");
const floatingLookupBtn = document.getElementById("floatingLookupBtn");
const popupOverlay = document.getElementById("popupOverlay");
const popupSetList = document.getElementById("popupSetList");
const btnChooseSet = document.getElementById("btnChooseSet");
const btnClosePopup = document.getElementById("btnClosePopup");

function smartFontSize(el, text) {
  if (!el || !text) return;
  const container = el.parentElement;
  if (!container) return;
  
  // Cache layout values
  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;
  const length = text.length;
  
  let size = containerWidth / (length * 0.5 + 2);
  if (size > 110) size = 110;
  if (size < 28) size = 28;
  const heightFactor = containerHeight * 0.4;
  if (size > heightFactor) size = heightFactor;
  
  if (el.style.fontSize !== size + "px") {
    el.style.fontSize = size + "px";
  }
}

function updateCard() {
  if (!cards.length) {
    frontMain.textContent = "Chưa có thẻ";
    frontSub.textContent = currentMode === "mastered" ? "Không có thẻ đã thuộc" : (currentMode === "learning" ? "Tuyệt vời! Bạn đã thuộc hết!" : "Hãy chọn học phần");
    backMain.textContent = "";
    progressText.textContent = `0 / 0 THẺ`;
    flashcard.classList.remove("flipped");
    updateCardPosition();
    [btnStruggle, btnStruggleBack, btnMastered, btnMasteredBack].forEach(b => { if (b) { b.classList.remove("active-struggle"); b.classList.remove("active-mastered"); } });
    return;
  }
  const c = cards[currentIndex];
  frontMain.textContent = c.frontMain || "";
  frontSub.textContent = c.frontSub || "";
  backMain.textContent = c.backMain || "";
  backExample.textContent = c.backSub || "";
  backExplain.textContent = c.backSub2 || "";
  progressText.textContent = `${currentIndex + 1} / ${cards.length} THẺ`;
  flashcard.classList.remove("flipped");
  updateCardPosition();
  const isStruggle = c.mastered !== true;
  const isMastered = c.mastered === true;
  [btnStruggle, btnStruggleBack].forEach(b => { if (b) b.classList.toggle("active-struggle", isStruggle); });
  [btnMastered, btnMasteredBack].forEach(b => { if (b) b.classList.toggle("active-mastered", isMastered); });
  requestAnimationFrame(() => { smartFontSize(frontMain, c.frontMain); smartFontSize(backMain, c.backMain); });
  saveProgress();
}

let isAnimating = false;
function triggerTransition(direction, callback) {
  if (isAnimating) return;
  isAnimating = true;
  if (autoMode) {
    flashcard.style.transition = 'opacity 0.15s ease';
    flashcard.style.opacity = '0';
    setTimeout(() => {
      if (callback) callback();
      flashcard.classList.remove("flipped");
        flashcard.style.transition = 'none';
        updateCardPosition();
        requestAnimationFrame(() => {
          flashcard.style.transition = 'opacity 0.15s ease';
          flashcard.style.opacity = '1';
          setTimeout(() => { flashcard.style.transition = ''; isAnimating = false; }, 150);
        });
      }, 150);
      return;
    }
  const cardWidth = flashcard.offsetWidth;
  const offScreenX = direction === 'next' ? -cardWidth * 1.5 : cardWidth * 1.5;
  const isFlipped = flashcard.classList.contains('flipped');
  const baseRotation = isFlipped ? 180 : 0;
  flashcard.style.transition = 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
  flashcard.style.transformOrigin = 'center center';
  flashcard.style.transform = `translate3d(${offScreenX}px, 0, 0) rotateY(${baseRotation}deg) rotateZ(${direction === 'next' ? -8 : 8}deg) scale(0.96)`;
  flashcard.style.opacity = '0';
  setTimeout(() => {
    if (callback) callback();
    flashcard.style.transition = 'none';
    flashcard.style.transform = `translate3d(${-offScreenX}px, 0, 0) rotateY(0deg) scale(0.96)`;
    flashcard.style.opacity = '0';
    void flashcard.offsetWidth;
    flashcard.style.transition = 'all 0.35s cubic-bezier(0.2, 1, 0.3, 1)';
    flashcard.classList.remove("flipped"); 
    flashcard.style.transform = 'translate3d(0,0,0) rotateY(0deg) scale(1)';
    flashcard.style.opacity = '1';
    setTimeout(() => { flashcard.style.transition = ''; flashcard.style.transform = ''; flashcard.style.opacity = ''; flashcard.style.transformOrigin = ''; isAnimating = false; }, 360);
  }, 310);
}

function updateCardPosition() {
  const isFlipped = flashcard.classList.contains('flipped');
  flashcard.style.transform = isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)';
}

function nextCard(onDone) {
  if (!cards.length) { if (onDone) onDone(); return; }
  if (isAnimating) { if (onDone) setTimeout(() => nextCard(onDone), 100); return; }
  triggerTransition('next', () => {
    if (randomMode) {
      let nextIdx = currentIndex;
      while (cards.length > 1 && nextIdx === currentIndex) { nextIdx = Math.floor(Math.random() * cards.length); }
      currentIndex = nextIdx;
    } else { currentIndex = (currentIndex + 1) % cards.length; }
    updateCard();
    if (onDone) onDone();
  });
}

function prevCard() {
  if (!cards.length || isAnimating) return;
  triggerTransition('prev', () => { currentIndex = (currentIndex - 1 + cards.length) % cards.length; updateCard(); });
}

flashcard.addEventListener("click", (e) => {
  if (isAnimating) return;
  const selection = window.getSelection();
  if (selection && selection.toString().trim() !== "") return;
  if (e.target.closest('button')) return; 
  flashcard.classList.toggle("flipped");
  updateCardPosition(); 
});

const handleNavClick = (callback) => (e) => { e.preventDefault(); e.stopPropagation(); if (autoMode) stopAuto(); callback(); };
btnNext?.addEventListener("click", handleNavClick(nextCard));
btnPrev?.addEventListener("click", handleNavClick(prevCard));

document.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  if (e.code === "Space") { e.preventDefault(); flashcard.click(); }
  else if (e.code === "ArrowRight") { nextCard(); }
  else if (e.code === "ArrowLeft") { prevCard(); }
});

modeBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    modeBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    if (currentSetName) loadSet(currentSetName, btn.dataset.mode);
  });
});

btnRandom?.addEventListener("click", () => {
  randomMode = !randomMode;
  btnRandom.classList.toggle("active", randomMode);
  btnRandom.classList.remove("pop-click");
  void btnRandom.offsetWidth;
  btnRandom.classList.add("pop-click");
  if (typeof lucide !== 'undefined') lucide.createIcons();
});

btnAuto?.addEventListener("click", () => {
  btnAuto.classList.remove("pop-click");
  void btnAuto.offsetWidth;
  btnAuto.classList.add("pop-click");
  if (autoMode) stopAuto(); else startAuto();
});

function startAuto() {
  stopAuto();
  if (!cards.length) return;
  autoMode = true;
  btnAuto?.classList.add("active");
  const icon = btnAuto?.querySelector("i");
  if (icon) icon.setAttribute("data-lucide", "pause");
  if (typeof lucide !== 'undefined') lucide.createIcons();
  const getFrontDelay = () => Math.max(0.5, parseFloat(document.getElementById("frontSeconds")?.value || 3)) * 1000;
  const getBackDelay = () => Math.max(0.5, parseFloat(document.getElementById("backSeconds")?.value || 2)) * 1000;
  const runCycle = () => {
    if (!autoMode || !cards.length) return;
    const card = cards[currentIndex];
    flashcard.classList.remove("flipped");
    updateCard();
    const frontText = (card.frontMain || "").split("/")[0].trim();
    if (frontText) { setTimeout(() => { if (autoMode) speak(frontText, voiceFrontSelect.value); }, 400); }
    autoTimer = setTimeout(() => {
      if (!autoMode) return;
      flashcard.classList.add("flipped");
      updateCardPosition();
      setTimeout(() => { if (!autoMode) return; const backText = (card.backMain || "").split("/")[0].trim(); if (backText) speak(backText, voiceBackSelect.value); }, 600);
      autoTimer = setTimeout(() => { if (!autoMode) return; nextCard(() => { if (autoMode) runCycle(); }); }, getBackDelay() + 600);
    }, getFrontDelay() + 600);
  };
  runCycle();
}

function stopAuto() {
  autoMode = false;
  clearTimeout(autoTimer);
  autoTimer = null;
  btnAuto?.classList.remove("active");
  const icon = btnAuto?.querySelector("i");
  if (icon) icon.setAttribute("data-lucide", "play");
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

const handleNewSet = () => {
    const name = prompt("Tên học phần mới:");
    if (name) {
        if (sets[name]) return alert("Tên học phần đã tồn tại!");
        sets[name] = []; saveSets(); loadSet(name); renderDecks();
        popupOverlay.style.display = "none"; document.body.classList.remove("modal-open");
    }
};
btnNewSet?.addEventListener("click", handleNewSet);
btnNewSetPopup?.addEventListener("click", handleNewSet);
btnSaveSet?.addEventListener("click", () => { saveSets(); alert("Đã lưu!"); });

btnAddCard?.addEventListener("click", () => {
    if (!currentSetName) return alert("Chọn học phần trước!");
    const bulkText = document.getElementById("bulkInput").value.trim();
    if (!bulkText) return alert("Nhập nội dung!");
    const lines = bulkText.split("\n");
    let count = 0;
    lines.forEach(line => {
        const parts = line.split(/[|｜\t]/);
        if (parts.length >= 2) {
            const sideA = parts[0].split("/");
            const sideB = parts[1].split("/");
            sets[currentSetName].push({ frontMain: sideA[0]?.trim() || "", frontSub: sideA.slice(1).map(s => s.trim()).join(" / "), backMain: sideB[0]?.trim() || "", backSub: sideB[1]?.trim() || "", backSub2: sideB.slice(2).map(s => s.trim()).join(" / "), mastered: false });
            count++;
        }
    });
    if (count > 0) { saveSets(); document.getElementById("bulkInput").value = ""; loadSet(currentSetName); alert(`Thêm ${count} thẻ!`); }
});

function saveSets() { localStorage.setItem("memorylab_sets", JSON.stringify(sets)); }
function saveProgress() { if (currentSetName) localStorage.setItem(`memorylab_index_${currentSetName}_${currentMode}`, currentIndex); }

const btnImportFileIcon = document.getElementById("btnImportFileIcon");
btnImportFileIcon?.addEventListener("click", () => { fileInput?.click(); });
fileInput?.addEventListener("change", async () => {
    if (!currentSetName) return alert("Chọn học phần trước!");
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) { processImportText(e.target.result); };
    reader.readAsText(file);
});

function processImportText(text) {
    const lines = text.split("\n").filter(line => line.trim() !== "");
    const newCards = [];
    lines.forEach(line => {
        const parts = line.split(/[|｜\t]/);
        if (parts.length >= 2) {
            const sideA = parts[0].split("/");
            const sideB = parts[1].split("/");
            newCards.push({ frontMain: sideA[0]?.trim() || "", frontSub: sideA.slice(1).map(s => s.trim()).join(" / "), backMain: sideB[0]?.trim() || "", backSub: sideB[1]?.trim() || "", backSub2: sideB.slice(2).map(s => s.trim()).join(" / "), mastered: false });
        }
    });
    if (newCards.length > 0) {
        sets[currentSetName] = [...(sets[currentSetName] || []), ...newCards];
        saveSets(); loadSet(currentSetName); alert(`Đã nhập ${newCards.length} thẻ!`);
    } else alert("Định dạng yêu cầu: Mặt trước | Mặt sau");
    fileInput.value = "";
}

btnChooseSet?.addEventListener("click", () => { popupOverlay.style.display = "flex"; document.body.classList.add("modal-open"); });
btnClosePopup?.addEventListener("click", () => { popupOverlay.style.display = "none"; document.body.classList.remove("modal-open"); });

function initTheme() { const savedTheme = localStorage.getItem("memorylab_theme") || "light"; setTheme(savedTheme); }
function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("memorylab_theme", theme);
  const btnThemeToggle = document.getElementById("btnThemeToggle");
  if (btnThemeToggle) {
    const icon = theme === "dark" ? "sun" : "moon";
    btnThemeToggle.innerHTML = `<i data-lucide="${icon}"></i>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}
document.getElementById("btnThemeToggle")?.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  setTheme(current === "dark" ? "light" : "dark");
});
initTheme();

const editSetOverlay = document.getElementById("editSetOverlay");
const editCardsList = document.getElementById("editCardsList");
const editSetNameInput = document.getElementById("editSetName");
const btnSaveEditSet = document.getElementById("btnSaveEditSet");
const btnEditAddCard = document.getElementById("btnEditAddCard");
const btnCloseEdit = document.getElementById("btnCloseEdit");
let editingSetName = "";
let tempCards = [];

function openEditModal(name) {
  if (!name) return;
  editingSetName = name;
  editSetNameInput.value = name;
  tempCards = JSON.parse(JSON.stringify(sets[name] || []));
  renderEditCards();
  editSetOverlay.style.display = "flex";
  document.body.classList.add("modal-open");
}
window.openEditModal = openEditModal;

function renderEditCards() {
  editCardsList.innerHTML = "";
  tempCards.forEach((card, idx) => {
    const row = document.createElement("div"); row.className = "card-editor-row";
    const fVal = card.frontMain + (card.frontSub ? " / " + card.frontSub : "");
    const bVal = card.backMain + (card.backSub ? " / " + card.backSub : "") + (card.backSub2 ? " / " + card.backSub2 : "");
    row.innerHTML = `<div class="edit-input-group"><label>Mặt trước</label><input type="text" class="styled-input front-val" value="${fVal.replace(/"/g, '&quot;')}" placeholder="Mặt trước / Phụ"></div><div class="edit-input-group"><label>Mặt sau</label><input type="text" class="styled-input back-val" value="${bVal.replace(/"/g, '&quot;')}" placeholder="Mặt sau / Ví dụ / Giải thích"></div><button class="delete-card-btn" onclick="removeTempCard(${idx})"><i data-lucide="trash-2"></i></button>`;
    editCardsList.appendChild(row);
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.removeTempCard = (idx) => {
    tempCards.splice(idx, 1);
    renderEditCards();
};
btnEditAddCard.addEventListener("click", () => { tempCards.push({ frontMain: "", frontSub: "", backMain: "", backSub: "", backSub2: "" }); renderEditCards(); editCardsList.scrollTop = editCardsList.scrollHeight; });
btnSaveEditSet.addEventListener("click", () => {
  const newName = editSetNameInput.value.trim();
  if (!newName) return alert("Nhập tên!");
  const rows = editCardsList.querySelectorAll(".card-editor-row");
  const finalCards = [];
  rows.forEach((row, idx) => {
    const fVal = row.querySelector(".front-val").value.trim();
    const bVal = row.querySelector(".back-val").value.trim();
    if (fVal || bVal) {
      const partsF = fVal.split("/").map(s => s.trim());
      const partsB = bVal.split("/").map(s => s.trim());
      finalCards.push({ frontMain: partsF[0] || "", frontSub: partsF.slice(1).join(" / "), backMain: partsB[0] || "", backSub: partsB.slice(1).join(" / "), backSub2: partsB.slice(2).join(" / "), mastered: tempCards[idx]?.mastered || false });
    }
  });
  if (newName !== editingSetName && sets[newName]) return alert("Tên tồn tại!");
  if (newName !== editingSetName) { delete sets[editingSetName]; }
  sets[newName] = finalCards;
  currentSetName = newName;
  saveSets();
  editSetOverlay.style.display = "none";
  document.body.classList.remove("modal-open");
  renderDecks();
  loadSet(newName);
});
btnCloseEdit.onclick = () => { editSetOverlay.style.display = "none"; document.body.classList.remove("modal-open"); };

// DICTIONARY LOGIC
let selectedTextToLookup = "";
btnDictionary?.addEventListener("click", () => { dictOverlay.style.display = "flex"; document.body.classList.add("modal-open"); dictKeywordInput.focus(); });
btnCloseDict?.addEventListener("click", () => { dictOverlay.style.display = "none"; document.body.classList.remove("modal-open"); });

const handleSelectionChange = () => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text && text.length < 50) {
        selectedTextToLookup = text;
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        floatingLookupBtn.style.display = "flex";
        floatingLookupBtn.style.top = `${rect.top + window.scrollY - 50}px`;
        floatingLookupBtn.style.left = `${rect.left + window.scrollX + (rect.width / 2) - 18}px`;
    } else { floatingLookupBtn.style.display = "none"; }
};
document.addEventListener("mouseup", handleSelectionChange);
document.addEventListener("keyup", handleSelectionChange);
floatingLookupBtn?.addEventListener("mousedown", (e) => {
    e.preventDefault(); 
    if (selectedTextToLookup) {
        dictKeywordInput.value = selectedTextToLookup;
        lookupWord(selectedTextToLookup);
        dictOverlay.style.display = "flex";
        document.body.classList.add("modal-open");
        floatingLookupBtn.style.display = "none";
        window.getSelection().removeAllRanges();
        selectedTextToLookup = "";
    }
});
btnDoLookup?.addEventListener("click", () => { const word = dictKeywordInput.value.trim(); if (word) lookupWord(word); });
dictKeywordInput?.addEventListener("keypress", (e) => { if (e.key === "Enter") { const word = dictKeywordInput.value.trim(); if (word) lookupWord(word); } });

// KANJI MODAL INITIALIZATION
function setupKanjiModal() {
    const existing = document.getElementById("kanjiModal");
    if (!existing) {
        const kanjiModal = document.createElement("div");
        kanjiModal.className = "kanji-modal";
        kanjiModal.id = "kanjiModal";
        kanjiModal.innerHTML = `
            <div class="kanji-modal-content">
                <button class="kanji-modal-close" id="kanjiModalClose">&times;</button>
                <div class="kanji-big-canvas" id="kanjiBigCanvas"></div>
                <div class="kanji-modal-char-info">
                    <h2 id="kanjiModalChar">?</h2>
                </div>
                <div class="kanji-modal-hint">Nhấn vào ô vuông để xem lại hoạt ảnh</div>
            </div>
        `;
        document.body.appendChild(kanjiModal);
        document.getElementById("kanjiModalClose")?.addEventListener("click", () => { kanjiModal.classList.remove("active"); });
        kanjiModal.addEventListener("click", (e) => { if (e.target === kanjiModal) kanjiModal.classList.remove("active"); });
    }
}
setupKanjiModal();

let bigWriter = null;

function openKanjiModal(char) {
    const bigCanvas = document.getElementById("kanjiBigCanvas");
    const charTitle = document.getElementById("kanjiModalChar");
    charTitle.textContent = char;
    bigCanvas.innerHTML = "";
    kanjiModal.classList.add("active");
    bigWriter = HanziWriter.create(bigCanvas, char, {
        width: 250, height: 250, padding: 20,
        strokeColor: "#ff4757", outlineColor: "#eee", drawingColor: "#333",
        showOutline: true, showCharacter: true
    });
    bigWriter.animateCharacter();
    bigCanvas.onclick = () => bigWriter.animateCharacter();
}

function renderKanjiAnimations() {
    const canvases = document.querySelectorAll(".kanji-canvas");
    canvases.forEach(el => {
        if (el.dataset.rendered === "true") return;
        const char = el.getAttribute("data-char");
        if (!char || char === "CHỮ_HÁN_CỤ_THỂ") return;
        
        el.innerHTML = "";
        const size = el.clientWidth || 80;
        const writer = HanziWriter.create(el, char, {
            width: size, height: size, padding: size * 0.1,
            strokeColor: "#ff4757", outlineColor: "#eee",
            showOutline: true, showCharacter: true
        });
        el.dataset.rendered = "true";
        el.addEventListener("click", (e) => { e.stopPropagation(); openKanjiModal(char); });
        setTimeout(() => { writer.animateCharacter(); }, 300);
    });
}

// AI LOGIC - CALLING BACKEND PROXY (FOR CLOUDFLARE PAGES)
let isLookingUp = false;
async function lookupWord(keyword) {
    if (isLookingUp) return;
    isLookingUp = true;
    dictLoading.style.display = "block";
    dictResult.style.display = "none";
    
    try {
        console.log(`Fetching dictionary for: ${keyword}`);
        const response = await fetch(`/lookup?keyword=${encodeURIComponent(keyword)}`);
        console.log(`Dictionary response status: ${response.status}`);
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({ error: "Lỗi kết nối server" }));
            throw new Error(errData.error || `Server error: ${response.status}`);
        }

        const data = await response.json();
        console.log("Dictionary data received successfully");
        dictResult.innerHTML = data.html || "";
        renderKanjiAnimations();
        dictResult.style.display = "block";
    } catch (error) {
        console.error("AI Lookup error:", error);
        dictResult.innerHTML = `
            <div class="error-box">
                <i data-lucide="alert-circle"></i>
                <div>
                    <strong>Lỗi tra cứu:</strong> ${error.message}<br>
                    <small>Đảm bảo bạn đã đặt biến môi trường trong Cloudflare Dashboard (GOOGLE_API_KEY hoặc GEMINI_API_KEY).</small>
                </div>
            </div>
        `;
        dictResult.style.display = "block";
    } finally {
        dictLoading.style.display = "none";
        isLookingUp = false;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

try {
    renderDecks();
    if (currentSetName && sets[currentSetName]) loadSet(currentSetName);
    else if (Object.keys(sets).length) loadSet(Object.keys(sets)[0]);
    else updateCard();
} catch (e) {
    console.error("Initialization error:", e);
}

// EXPORT TO WINDOW (For onclick in module scripts)
window.loadSet = loadSet;
window.openEditModal = openEditModal;
window.viewSearchDetail = viewSearchDetail;
window.importFromUrl = importFromUrl;
window.openKanjiModal = openKanjiModal;
window.jumpToCard = (setName, idx) => {
    loadSet(setName);
    currentIndex = idx;
    updateCard();
    searchOverlay.style.display = "none";
    document.body.classList.remove("modal-open");
};
