// State Management
let allUpdates = [];
let filteredUpdates = [];
let currentFilter = 'all';
let currentSearch = '';
let activeUpdateForTweet = null;

// DOM Elements
const btnRefresh = document.getElementById('btn-refresh');
const refreshIcon = document.getElementById('refresh-icon');
const feedSkeleton = document.getElementById('feed-skeleton');
const feedGrid = document.getElementById('feed-grid');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const filterPills = document.querySelectorAll('.filter-pills .pill');
const resultsCount = document.getElementById('results-count');
const lastUpdatedTime = document.getElementById('last-updated-time');
const onlineIndicator = document.getElementById('online-indicator');
const btnResetFilters = document.getElementById('btn-reset-filters');
const themeToggle = document.getElementById('theme-toggle');
const btnExportCSV = document.getElementById('btn-export-csv');

// Modal Elements
const tweetModal = document.getElementById('tweet-modal');
const modalTitle = document.getElementById('modal-title');
const previewTypeBadge = document.getElementById('preview-type-badge');
const previewDate = document.getElementById('preview-date');
const previewText = document.getElementById('preview-text');
const tweetTextarea = document.getElementById('tweet-textarea');
const charCountNum = document.getElementById('char-count-num');
const progressCircle = document.getElementById('progress-circle');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelTweet = document.getElementById('btn-cancel-tweet');
const btnPublishTweet = document.getElementById('btn-publish-tweet');
const hashtagPills = document.querySelectorAll('.suggest-pills .tag-pill');

// Progress Circle Circumference (r=14)
const CIRCUMFERENCE = 2 * Math.PI * 14;
progressCircle.style.strokeDasharray = `${CIRCUMFERENCE} ${CIRCUMFERENCE}`;
progressCircle.style.strokeDashoffset = CIRCUMFERENCE;

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    fetchUpdates();
    setupEventListeners();
});

// Setup Event Listeners
function setupEventListeners() {
    // Refresh Button
    btnRefresh.addEventListener('click', fetchUpdates);
    
    // Theme Toggle Button
    themeToggle.addEventListener('click', toggleTheme);
    
    // Export CSV Button
    btnExportCSV.addEventListener('click', exportToCSV);
    
    // Search input typing
    searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.trim().toLowerCase();
        
        // Show/hide clear search button
        if (currentSearch.length > 0) {
            clearSearchBtn.style.display = 'block';
        } else {
            clearSearchBtn.style.display = 'none';
        }
        
        applyFiltersAndSearch();
    });
    
    // Clear search button click
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        currentSearch = '';
        clearSearchBtn.style.display = 'none';
        applyFiltersAndSearch();
        searchInput.focus();
    });
    
    // Filter Pills
    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            // Remove active class from all pills
            filterPills.forEach(p => {
                p.classList.remove('active');
                p.setAttribute('aria-checked', 'false');
            });
            
            // Add active class to clicked pill
            pill.classList.add('active');
            pill.setAttribute('aria-checked', 'true');
            
            currentFilter = pill.getAttribute('data-type');
            applyFiltersAndSearch();
        });
    });
    
    // Reset Filters button (empty state)
    btnResetFilters.addEventListener('click', () => {
        searchInput.value = '';
        currentSearch = '';
        clearSearchBtn.style.display = 'none';
        
        filterPills.forEach(p => {
            p.classList.remove('active');
            p.setAttribute('aria-checked', 'false');
        });
        const allPill = document.querySelector('.pill[data-type="all"]');
        allPill.classList.add('active');
        allPill.setAttribute('aria-checked', 'true');
        
        currentFilter = 'all';
        applyFiltersAndSearch();
    });
    
    // Modal Close actions
    btnCloseModal.addEventListener('click', closeTweetModal);
    btnCancelTweet.addEventListener('click', closeTweetModal);
    tweetModal.addEventListener('click', (e) => {
        if (e.target === tweetModal) closeTweetModal();
    });
    
    // Suggestion Hashtags toggle in composer
    hashtagPills.forEach(pill => {
        pill.addEventListener('click', () => {
            const tag = pill.getAttribute('data-tag');
            let text = tweetTextarea.value;
            
            if (text.includes(tag)) {
                // Remove tag and any surrounding spaces
                const regex = new RegExp(`\\s*${tag}\\b`, 'g');
                text = text.replace(regex, '');
            } else {
                // Add tag
                text = text.trim();
                text = text ? `${text} ${tag}` : tag;
            }
            
            tweetTextarea.value = text;
            updateCharCounter();
            tweetTextarea.focus();
        });
    });
    
    // Tweet composer input event for live character count
    tweetTextarea.addEventListener('input', updateCharCounter);
    
    // Publish tweet
    btnPublishTweet.addEventListener('click', () => {
        const text = tweetTextarea.value.trim();
        if (text.length === 0 || text.length > 280) return;
        
        // Open Twitter Web Intent
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(twitterUrl, '_blank', 'noopener,noreferrer');
        
        showToast('Redirected to X (Twitter) draft!', 'success');
        closeTweetModal();
    });
}

// Fetch Release Notes
async function fetchUpdates() {
    // Show spinner and skeleton, hide feed grid/empty state
    refreshIcon.classList.add('spinning');
    btnRefresh.disabled = true;
    feedSkeleton.style.display = 'flex';
    feedGrid.style.display = 'none';
    emptyState.style.display = 'none';
    onlineIndicator.classList.add('syncing');
    onlineIndicator.querySelector('.indicator-text').innerText = 'Syncing...';
    
    try {
        const response = await fetch('/api/updates');
        if (!response.ok) {
            throw new Error(`Server returned code ${response.status}`);
        }
        
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Unknown error occurred.');
        }
        
        allUpdates = data.updates;
        showToast(`Successfully synchronized ${allUpdates.length} release updates.`, 'success');
        
        // Update stats
        updateLastSyncedTime();
        updateCategoryCounts();
        
        // Display
        applyFiltersAndSearch();
        
    } catch (error) {
        console.error('Fetch error:', error);
        showToast(`Failed to sync updates: ${error.message}`, 'error');
        
        // If we have no cached items, show empty state with error details
        if (allUpdates.length === 0) {
            feedSkeleton.style.display = 'none';
            emptyState.style.display = 'flex';
            emptyState.querySelector('h3').innerText = 'Failed to Load Updates';
            emptyState.querySelector('p').innerText = `Error: ${error.message}. Please verify connection to the backend and click Refresh.`;
        } else {
            // Restore previous grid
            feedSkeleton.style.display = 'none';
            feedGrid.style.display = 'grid';
        }
    } finally {
        refreshIcon.classList.remove('spinning');
        btnRefresh.disabled = false;
        onlineIndicator.classList.remove('syncing');
        onlineIndicator.querySelector('.indicator-text').innerText = 'System Live';
    }
}

// Apply Filters and Search
function applyFiltersAndSearch() {
    filteredUpdates = allUpdates.filter(update => {
        // Filter by Type
        let typeMatch = false;
        const noteType = update.type.toLowerCase();
        
        if (currentFilter === 'all') {
            typeMatch = true;
        } else if (currentFilter === 'feature') {
            typeMatch = noteType.includes('feature') || noteType.includes('ga') || noteType.includes('general availability');
        } else if (currentFilter === 'deprecation') {
            typeMatch = noteType.includes('deprecation') || noteType.includes('deprecated') || noteType.includes('announced deprecation');
        } else if (currentFilter === 'issue') {
            typeMatch = noteType.includes('issue') || noteType.includes('bug') || noteType.includes('fix') || noteType.includes('resolved');
        } else if (currentFilter === 'announcement') {
            typeMatch = noteType.includes('announcement') || noteType.includes('changed') || noteType.includes('announcing');
        }
        
        // Filter by Search Query
        let searchMatch = true;
        if (currentSearch) {
            const dateText = update.date.toLowerCase();
            const typeText = update.type.toLowerCase();
            const mainText = update.text.toLowerCase();
            searchMatch = dateText.includes(currentSearch) || 
                          typeText.includes(currentSearch) || 
                          mainText.includes(currentSearch);
        }
        
        return typeMatch && searchMatch;
    });
    
    renderFeed();
}

// Render Feed Grid
function renderFeed() {
    feedSkeleton.style.display = 'none';
    
    if (filteredUpdates.length === 0) {
        feedGrid.style.display = 'none';
        emptyState.style.display = 'flex';
        emptyState.querySelector('h3').innerText = 'No updates match your search';
        emptyState.querySelector('p').innerText = 'Try checking your spelling, selecting a different filter pill, or resetting filters.';
        resultsCount.innerText = 'Showing 0 updates';
        return;
    }
    
    emptyState.style.display = 'none';
    feedGrid.innerHTML = '';
    
    filteredUpdates.forEach(update => {
        const card = createCardElement(update);
        feedGrid.appendChild(card);
    });
    
    feedGrid.style.display = 'grid';
    resultsCount.innerText = `Showing ${filteredUpdates.length} update${filteredUpdates.length === 1 ? '' : 's'}`;
}

// Create individual Card Element
function createCardElement(update) {
    const card = document.createElement('article');
    card.className = 'update-card glass';
    
    // Normalize type for class names
    const typeLower = update.type.toLowerCase();
    let badgeClass = 'badge-general';
    if (typeLower.includes('feature')) badgeClass = 'badge-feature';
    else if (typeLower.includes('deprecation')) badgeClass = 'badge-deprecation';
    else if (typeLower.includes('issue') || typeLower.includes('bug') || typeLower.includes('fix')) badgeClass = 'badge-issue';
    else if (typeLower.includes('announcement') || typeLower.includes('changed')) badgeClass = 'badge-announcement';
    
    card.innerHTML = `
        <div class="card-header">
            <div class="card-meta">
                <span class="date-badge">
                    <i class="fa-regular fa-calendar-days"></i>
                    <span>${update.formatted_date || update.date}</span>
                </span>
                <span class="badge ${badgeClass}">${update.type}</span>
            </div>
        </div>
        <div class="card-body">
            ${update.html}
        </div>
        <div class="card-footer">
            <button class="btn btn-secondary btn-copy-card" aria-label="Copy update to clipboard">
                <i class="fa-regular fa-copy"></i>
                <span>Copy</span>
            </button>
            <button class="btn btn-secondary btn-share-tweet" aria-label="Compose tweet about this update">
                <i class="fa-brands fa-x-twitter"></i>
                <span>Tweet this</span>
            </button>
        </div>
    `;
    
    // Add Copy button event listener
    const btnCopy = card.querySelector('.btn-copy-card');
    btnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(update.text).then(() => {
            showToast("Copied content to clipboard!", "success");
            const icon = btnCopy.querySelector('i');
            const textSpan = btnCopy.querySelector('span');
            icon.className = 'fa-solid fa-check';
            textSpan.innerText = 'Copied';
            setTimeout(() => {
                icon.className = 'fa-regular fa-copy';
                textSpan.innerText = 'Copy';
            }, 2000);
        }).catch(err => {
            console.error('Could not copy text: ', err);
            showToast("Failed to copy text.", "error");
        });
    });
    
    // Add Share button event listener
    const btnShare = card.querySelector('.btn-share-tweet');
    btnShare.addEventListener('click', () => {
        openTweetModal(update);
    });
    
    return card;
}

// Update Last Synced Time
function updateLastSyncedTime() {
    const now = new Date();
    const formatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    lastUpdatedTime.innerText = `Synced today at ${formatted}`;
}

// Update Category Counts for pills
function updateCategoryCounts() {
    let countAll = allUpdates.length;
    let countFeature = 0;
    let countDeprecation = 0;
    let countIssue = 0;
    let countAnnouncement = 0;
    
    allUpdates.forEach(update => {
        const t = update.type.toLowerCase();
        if (t.includes('feature') || t.includes('ga') || t.includes('general availability')) {
            countFeature++;
        } else if (t.includes('deprecation') || t.includes('deprecated') || t.includes('announced deprecation')) {
            countDeprecation++;
        } else if (t.includes('issue') || t.includes('bug') || t.includes('fix') || t.includes('resolved')) {
            countIssue++;
        } else if (t.includes('announcement') || t.includes('changed') || t.includes('announcing')) {
            countAnnouncement++;
        }
    });
    
    document.getElementById('count-all').innerText = countAll;
    document.getElementById('count-feature').innerText = countFeature;
    document.getElementById('count-deprecation').innerText = countDeprecation;
    document.getElementById('count-issue').innerText = countIssue;
    document.getElementById('count-announcement').innerText = countAnnouncement;
}

// Open Tweet Modal
function openTweetModal(update) {
    activeUpdateForTweet = update;
    
    // Set Preview Content in modal
    previewDate.innerText = update.formatted_date || update.date;
    previewTypeBadge.innerText = update.type;
    
    // Setup badge class for preview type in modal
    previewTypeBadge.className = 'badge';
    const typeLower = update.type.toLowerCase();
    if (typeLower.includes('feature')) previewTypeBadge.classList.add('badge-feature');
    else if (typeLower.includes('deprecation')) previewTypeBadge.classList.add('badge-deprecation');
    else if (typeLower.includes('issue') || typeLower.includes('bug') || typeLower.includes('fix')) previewTypeBadge.classList.add('badge-issue');
    else if (typeLower.includes('announcement') || typeLower.includes('changed')) previewTypeBadge.classList.add('badge-announcement');
    else previewTypeBadge.classList.add('badge-general');
    
    previewText.innerText = update.text;
    
    // Construct default draft text
    // E.g., "📢 BigQuery Feature Announcement (June 17, 2026): You can enable autonomous embedding generation... #BigQuery #GoogleCloud"
    const maxSnippetLength = 150;
    let snippet = update.text;
    if (snippet.length > maxSnippetLength) {
        snippet = snippet.substring(0, maxSnippetLength).trim() + '...';
    }
    
    const defaultTweet = `📢 BigQuery ${update.type} (${update.formatted_date || update.date}):\n\n"${snippet}"\n\n#BigQuery #GoogleCloud`;
    tweetTextarea.value = defaultTweet;
    
    // Reset suggestion pills visually
    hashtagPills.forEach(pill => {
        const tag = pill.getAttribute('data-tag');
        if (defaultTweet.includes(tag)) {
            pill.style.background = 'rgba(59, 130, 246, 0.15)';
            pill.style.borderColor = 'rgba(59, 130, 246, 0.4)';
        } else {
            pill.style.background = '';
            pill.style.borderColor = '';
        }
    });
    
    // Open Modal
    tweetModal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Lock background scroll
    
    // Focus textarea
    tweetTextarea.focus();
    updateCharCounter();
}

// Close Tweet Modal
function closeTweetModal() {
    tweetModal.style.display = 'none';
    document.body.style.overflow = ''; // Restore scroll
    activeUpdateForTweet = null;
}

// Update Character Counter and SVG Circle
function updateCharCounter() {
    const text = tweetTextarea.value;
    const count = text.length;
    const remaining = 280 - count;
    
    charCountNum.innerText = remaining;
    
    // Update color styles and button state based on limits
    const charCounterBox = document.querySelector('.char-counter');
    charCounterBox.className = 'char-counter';
    
    if (remaining < 0) {
        charCounterBox.classList.add('error');
        btnPublishTweet.disabled = true;
        btnPublishTweet.style.opacity = 0.5;
        btnPublishTweet.style.cursor = 'not-allowed';
    } else if (remaining < 20) {
        charCounterBox.classList.add('warning');
        btnPublishTweet.disabled = false;
        btnPublishTweet.style.opacity = 1;
        btnPublishTweet.style.cursor = 'pointer';
    } else {
        btnPublishTweet.disabled = false;
        btnPublishTweet.style.opacity = 1;
        btnPublishTweet.style.cursor = 'pointer';
    }
    
    // Update SVG Progress Ring
    const percentage = Math.min(100, (count / 280) * 100);
    const offset = CIRCUMFERENCE - (percentage / 100) * CIRCUMFERENCE;
    progressCircle.style.strokeDashoffset = offset;
    
    // Update circle color dynamically
    if (remaining < 0) {
        progressCircle.style.stroke = '#f43f5e'; // Accent Rose (Red)
    } else if (remaining < 20) {
        progressCircle.style.stroke = '#f59e0b'; // Accent Amber (Yellow)
    } else {
        progressCircle.style.stroke = '#3b82f6'; // Accent Blue (Blue)
    }
    
    // Sync quick hashtag pills highlight status
    hashtagPills.forEach(pill => {
        const tag = pill.getAttribute('data-tag');
        if (text.includes(tag)) {
            pill.style.background = 'rgba(59, 130, 246, 0.15)';
            pill.style.borderColor = 'rgba(59, 130, 246, 0.4)';
        } else {
            pill.style.background = '';
            pill.style.borderColor = '';
        }
    });
}

// Toast Notifications
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    
    toast.innerHTML = `
        <i class="fa-solid ${icon} toast-icon"></i>
        <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Remove toast after 4.5 seconds
    setTimeout(() => {
        toast.style.animation = 'toastIn 0.3s reverse forwards';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4500);
}

// Theme Manager Utilities
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }
}

function toggleTheme() {
    if (document.body.classList.contains('light-theme')) {
        document.body.classList.remove('light-theme');
        localStorage.setItem('theme', 'dark');
        showToast("Switched to dark mode", "info");
    } else {
        document.body.classList.add('light-theme');
        localStorage.setItem('theme', 'light');
        showToast("Switched to light mode", "info");
    }
}

// Export Filtered Release Notes to CSV File
function exportToCSV() {
    if (filteredUpdates.length === 0) {
        showToast("No release notes available to export.", "error");
        return;
    }
    
    const headers = ["Date", "Type", "Description"];
    const rows = filteredUpdates.map(update => [
        update.formatted_date || update.date,
        update.type,
        update.text
    ]);
    
    const csvContent = [
        headers.join(","),
        ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    
    try {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `bigquery_release_notes_${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(`Exported ${filteredUpdates.length} updates successfully!`, "success");
    } catch (error) {
        console.error("Export error: ", error);
        showToast("Failed to export CSV file.", "error");
    }
}
