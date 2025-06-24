let modalVisible = false;
let selectedIndex = 0;
let filteredChars = [];
let originalActiveElement = null;

let modal, searchInput, charList;

// --- Modal Creation ---
function createModal() {
    if (modal) return;

    modal = document.createElement('div');
    modal.id = 'unicode-picker-modal';
    modal.innerHTML = `
        <div id="unicode-picker-container">
            <input type="text" id="unicode-picker-searchInput" placeholder="Search for a character...">
            <ul id="unicode-picker-charList"></ul>
        </div>
    `;
    document.body.appendChild(modal);

    searchInput = document.getElementById('unicode-picker-searchInput');
    charList = document.getElementById('unicode-picker-charList');

    // Add event listeners once the modal is created
    searchInput.addEventListener('input', () => filterChars(searchInput.value));
    modal.addEventListener('keydown', handleKeyDown);
    modal.addEventListener('click', handleModalClick);
}

// --- Modal Logic ---
async function showModal() {
    createModal(); // Create modal on demand
    originalActiveElement = document.activeElement;
    modal.style.display = 'flex';
    modalVisible = true;
    await initialize();
}

function hideModal() {
    modal.style.display = 'none';
    modalVisible = false;
    if (originalActiveElement) {
        originalActiveElement.focus();
    }
}

// --- Character & List Logic ---
async function initialize() {
    const { usageStats = {} } = await chrome.storage.local.get('usageStats');
    characters.sort((a, b) => (usageStats[b.symbol] || 0) - (usageStats[a.symbol] || 0));
    filterChars('');
    setTimeout(() => searchInput.focus(), 50);
    searchInput.value = '';
}

function renderList(chars) {
    charList.innerHTML = '';
    chars.forEach((char, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="unicode-picker-char-name">${char.name}</span><span class="unicode-picker-char-symbol">${char.symbol}</span>`;
        if (index === selectedIndex) li.classList.add('selected');
        li.addEventListener('click', () => selectChar(char.symbol));
        charList.appendChild(li);
    });
    const selectedEl = charList.querySelector('.selected');
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
}

function filterChars(query) {
    filteredChars = characters.filter(c => `${c.name} ${c.code}`.toLowerCase().includes(query.toLowerCase()));
    selectedIndex = 0;
    renderList(filteredChars);
}

async function selectChar(symbol) {
    await trackCharacterUsage(symbol);
    insertCharacter(symbol);
    hideModal();
}

function insertCharacter(symbol) {
    const activeEl = originalActiveElement;
    if (!activeEl || (activeEl.tagName !== 'TEXTAREA' && activeEl.tagName !== 'INPUT' && !activeEl.isContentEditable)) return;

    if (activeEl.value !== undefined) {
        // Handle input and textarea elements
        const start = activeEl.selectionStart || 0;
        const end = activeEl.selectionEnd || 0;
        activeEl.value = activeEl.value.substring(0, start) + symbol + activeEl.value.substring(end);
        activeEl.selectionStart = activeEl.selectionEnd = start + symbol.length;
        activeEl.focus();
    } else if (activeEl.isContentEditable) {
        // Handle contentEditable elements
        activeEl.focus();
        if (document.execCommand) {
            document.execCommand('insertText', false, symbol);
        } else {
            // Fallback for newer browsers where execCommand is deprecated
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(symbol));
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }
    activeEl.dispatchEvent(new Event('input', { bubbles: true }));
}

async function trackCharacterUsage(symbol) {
    const { usageStats = {} } = await chrome.storage.local.get('usageStats');
    usageStats[symbol] = (usageStats[symbol] || 0) + 1;
    await chrome.storage.local.set({ usageStats });
}

// --- Event Listeners ---
function handleKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key.toLowerCase() === 'j') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % filteredChars.length;
        renderList(filteredChars);
    } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + filteredChars.length) % filteredChars.length;
        renderList(filteredChars);
    } else if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 32) {
        e.preventDefault();
        if (filteredChars.length > 0) selectChar(filteredChars[selectedIndex].symbol);
    } else if (e.key === 'Escape') {
        hideModal();
    }
}

function handleModalClick(e) {
    if (e.target.id === 'unicode-picker-modal') hideModal();
}

chrome.runtime.onMessage.addListener(async (request) => {
    if (request.type === 'toggle-modal') {
        if (modalVisible) {
            hideModal();
        } else {
            await showModal();
        }
    }
});

hideModal(); // Initially hidden