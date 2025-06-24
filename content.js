let modal, searchInput, listContainer;
let modalVisible = false;
let selectedIndex = 0;
let filteredChars = [];
let originalActiveElement = null;
let currentCategory = 'all'; // Track current category filter
let categoryButtonHandlers = new Map(); // Store event handler references
let searchInputHandler, handleKeyDownHandler, handleGlobalKeyDownHandler, itemClickHandler;

// --- Modal Creation ---
function showModal() {
    if (modal) {
        modal.style.display = 'flex';
        modalVisible = true;
        return;
    }
    
    originalActiveElement = document.activeElement;
    
    // Restore last used category
    chrome.storage.local.get(['lastCategory'], (result) => {
        if (result.lastCategory) {
            currentCategory = result.lastCategory;
        }
        createModalContent();
        modal.style.display = 'flex';
        modalVisible = true;
    });
}

function createModalContent() {
    // Create modal overlay
    modal = document.createElement('div');
    modal.id = 'unicode-picker-modal';
    modal.innerHTML = `
        <div class="unicode-picker-container">
            <div class="unicode-picker-categories">
                <button class="category-btn ${currentCategory === 'all' ? 'active' : ''}" data-category="all" data-shortcut="1">All¹</button>
                <button class="category-btn ${currentCategory === 'accented' ? 'active' : ''}" data-category="accented" data-shortcut="2">Accented²</button>
                <button class="category-btn ${currentCategory === 'math' ? 'active' : ''}" data-category="math" data-shortcut="3">Math³</button>
                <button class="category-btn ${currentCategory === 'punctuation' ? 'active' : ''}" data-category="punctuation" data-shortcut="4">Punctuation⁴</button>
                <button class="category-btn ${currentCategory === 'symbols' ? 'active' : ''}" data-category="symbols" data-shortcut="5">Symbols⁵</button>
            </div>
            <input type="text" id="unicode-search" placeholder="Search characters... (try 'c' for ç, 'sp' for Spanish)" autocomplete="off">
            <div id="unicode-list"></div>
            <div class="unicode-picker-help">
                Use ↑↓ or j/k to navigate, Enter/Space to select, Esc to close, Alt+1-5 for categories
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    searchInput = document.getElementById('unicode-search');
    listContainer = document.getElementById('unicode-list');
    
    // Clear previous handlers
    categoryButtonHandlers.clear();
    
    // Add category button event listeners with stored references
    const categoryButtons = modal.querySelectorAll('.category-btn');
    categoryButtons.forEach(btn => {
        const handler = (e) => {
            switchToCategory(e.target.dataset.category);
        };
        categoryButtonHandlers.set(btn, handler);
        btn.addEventListener('click', handler);
    });
    
    searchInputHandler = filterCharacters;
    handleKeyDownHandler = handleKeyDown;
    handleGlobalKeyDownHandler = handleGlobalKeyDown;
    
    searchInput.addEventListener('input', searchInputHandler);
    modal.addEventListener('keydown', handleGlobalKeyDownHandler);
    
    filterCharacters();
    searchInput.focus();
}

function switchToCategory(category) {
    // Update active category button
    const categoryButtons = modal.querySelectorAll('.category-btn');
    categoryButtons.forEach(b => b.classList.remove('active'));
    const targetButton = modal.querySelector(`[data-category="${category}"]`);
    if (targetButton) {
        targetButton.classList.add('active');
    }
    
    // Update current category and save to storage
    currentCategory = category;
    chrome.storage.local.set({ lastCategory: category });
    filterCharacters();
}

function handleGlobalKeyDown(e) {
    // Handle Alt + number shortcuts for categories
    if (e.altKey && e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        const categories = ['all', 'accented', 'math', 'punctuation', 'symbols'];
        const categoryIndex = parseInt(e.key) - 1;
        if (categoryIndex < categories.length) {
            switchToCategory(categories[categoryIndex]);
        }
        return;
    }
    
    // Handle navigation keys globally (j/k, arrows, enter, space, escape)
    if (['ArrowDown', 'ArrowUp', 'j', 'k', 'J', 'K', 'Enter', ' ', 'Escape'].includes(e.key) || e.keyCode === 32) {
        handleKeyDown(e);
    }
}

function filterCharacters() {
    const query = searchInput.value.toLowerCase().trim();
    let chars = characters;
    
    // Filter by category first
    if (currentCategory !== 'all') {
        chars = characters.filter(char => char.category === currentCategory);
    }
    
    // Then filter by search query with improved logic
    if (query) {
        chars = chars.filter(char => {
            const nameMatch = char.name.toLowerCase().includes(query);
            const aliasMatch = char.aliases && char.aliases.some(alias => 
                alias.toLowerCase().includes(query)
            );
            return nameMatch || aliasMatch;
        });
        
        // Sort by relevance: exact matches first, then partial matches
        chars.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            const aAliases = a.aliases || [];
            const bAliases = b.aliases || [];
            
            // Check for exact symbol matches first (e.g., "s" matches "s" character)
            const aExactSymbol = a.symbol.toLowerCase() === query;
            const bExactSymbol = b.symbol.toLowerCase() === query;
            if (aExactSymbol && !bExactSymbol) return -1;
            if (bExactSymbol && !aExactSymbol) return 1;
            
            // Check for exact alias matches (e.g., "s" in aliases)
            const aExactAlias = aAliases.some(alias => alias.toLowerCase() === query);
            const bExactAlias = bAliases.some(alias => alias.toLowerCase() === query);
            if (aExactAlias && !bExactAlias) return -1;
            if (bExactAlias && !aExactAlias) return 1;
            
            // Check for name starting with query
            const aNameStarts = aName.startsWith(query);
            const bNameStarts = bName.startsWith(query);
            if (aNameStarts && !bNameStarts) return -1;
            if (bNameStarts && !aNameStarts) return 1;
            
            // Check for alias starting with query
            const aAliasStarts = aAliases.some(alias => alias.toLowerCase().startsWith(query));
            const bAliasStarts = bAliases.some(alias => alias.toLowerCase().startsWith(query));
            if (aAliasStarts && !bAliasStarts) return -1;
            if (bAliasStarts && !aAliasStarts) return 1;
            
            // For progressive search (e.g., "sp" for Spanish), prioritize language-specific matches
            if (query.length >= 2) {
                const aLanguageMatch = aName.includes(query);
                const bLanguageMatch = bName.includes(query);
                if (aLanguageMatch && !bLanguageMatch) return -1;
                if (bLanguageMatch && !aLanguageMatch) return 1;
            }
            
            // Default alphabetical sort
            return aName.localeCompare(bName);
        });
    }
    
    // Sort by usage for final ordering
    chrome.storage.local.get(null, (data) => {
        if (!query) {
            // Only sort by usage when no search query
            chars.sort((a, b) => (data[b.symbol] || 0) - (data[a.symbol] || 0));
        }
        filteredChars = chars;
        selectedIndex = 0;
        renderList(filteredChars);
    });
}

function handleKeyDown(e) {
    // Handle navigation keys regardless of focus
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

// --- Modal Logic ---
function hideModal() {
    if (!modal) return;
    
    // Remove event listeners to prevent memory leaks
    if (searchInput) {
        searchInput.removeEventListener('input', searchInputHandler);
    }
    
    if (modal) {
        modal.removeEventListener('keydown', handleGlobalKeyDownHandler);
        
        // Remove category button event listeners
        const categoryButtons = modal.querySelectorAll('.category-btn');
        categoryButtons.forEach(btn => {
            const handler = categoryButtonHandlers.get(btn);
            if (handler) {
                btn.removeEventListener('click', handler);
            }
        });
    }
    
    // Remove modal from DOM completely
    if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
    }
    
    // Reset references
    modal = null;
    searchInput = null;
    listContainer = null;
    modalVisible = false;
    categoryButtonHandlers.clear();
    
    // Restore focus
    if (originalActiveElement) {
        originalActiveElement.focus();
        originalActiveElement = null;
    }
}

function renderList(chars) {
    if (!listContainer) return;
    
    listContainer.innerHTML = chars.map((char, index) => 
        `<div class="unicode-item ${index === selectedIndex ? 'selected' : ''}" data-symbol="${char.symbol}">
            <span class="unicode-symbol">${char.symbol}</span>
            <span class="unicode-name">${char.name}</span>
            <span class="unicode-code">${char.code}</span>
        </div>`
    ).join('');
    
    // Add click listeners to items
    const items = listContainer.querySelectorAll('.unicode-item');
    items.forEach((item, index) => {
        itemClickHandler = (e) => {
            selectedIndex = index;
            selectChar(item.dataset.symbol);
        };
        item.addEventListener('click', itemClickHandler);
    });
    
    const selectedEl = listContainer.querySelector('.selected');
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
}

// --- Character & List Logic ---
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
chrome.runtime.onMessage.addListener(async (request) => {
    if (request.type === 'toggle-modal') {
        if (modalVisible) {
            hideModal();
        } else {
            showModal();
        }
    }
});