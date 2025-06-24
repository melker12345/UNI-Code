chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-picker') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'toggle-modal' });
            }
        });
    }
});