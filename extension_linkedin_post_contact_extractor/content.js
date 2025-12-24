// content.js

let scrolling = false;
let processedIds = new Set();
let keywords = [];

// Keywords setup
const aiKeywords = [
    'ai', 'artificial intelligence', 'machine learning', 'ml', 'mlops',
    'llm', 'large language model', 'rag', 'gen ai', 'generative ai',
    'deep learning', 'neural network', 'nlp', 'computer vision',
    'data scientist', 'ml engineer', 'ai engineer', 'pytorch', 'tensorflow'
];

const jobKeywords = [
    'hiring', 'job', 'position', 'opportunity', 'opening',
    'w2', 'full time', 'full-time', 'contract', 'immediate',
    'looking for', 'seeking', 'recruiting', 'join our team',
    'apply', 'careers', 'employment', 'cv', 'resume', 'talent',
    'email me', 'contact me', 'refer'
];

chrome.storage.local.get(['isRunning', 'keywords'], (result) => {
    if (result.isRunning) {
        if (result.keywords) {
            keywords = result.keywords.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
        }
        if (window.location.href.includes('/search/results/')) {
            console.log("WBL: Auto-resuming extraction on search page...");
            setTimeout(() => {
                ensurePostsFilter().then(() => startScraping());
            }, 2000);
        }
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("WBL: Message received:", message.action);

    if (message.action === 'ping') {
        sendResponse({ status: 'active' });
        return true;
    }

    if (message.action === 'begin_scroll_and_extract') {
        if (scrolling) {
            console.log("WBL: Extraction already in progress.");
            return;
        }
        if (message.keywords) {
            keywords = message.keywords.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
        } else {
            keywords = [];
        }

        if (message.performSearch && keywords.length > 0) {
            runSearchSequence(keywords[0]);
        } else {
            startScraping();
        }

    } else if (message.action === 'stop_extraction') {
        console.log("WBL: Stopping extraction...");
        scrolling = false;
    }
});

async function ensurePostsFilter() {
    if (!window.location.href.includes('/search/results/content')) {
        let postsBtn = Array.from(document.querySelectorAll('button.artdeco-pill')).find(btn => btn.innerText.trim() === 'Posts');
        if (postsBtn) {
            if (postsBtn.getAttribute('aria-pressed') !== 'true') {
                postsBtn.click();
                await new Promise(r => setTimeout(r, 4000));
            }
        } else {
            if (window.location.href.includes('/search/results/all')) {
                const newUrl = window.location.href.replace('/search/results/all', '/search/results/content');
                window.location.href = newUrl;
                await new Promise(r => setTimeout(r, 99999));
            }
        }
    }
}

async function runSearchSequence(keyword) {
    const searchInput = document.querySelector('input.search-global-typeahead__input');

    if (searchInput && !window.location.href.includes('/search/results/')) {
        searchInput.click();
        searchInput.focus();
        searchInput.value = keyword;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 500));

        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        });
        searchInput.dispatchEvent(enterEvent);
        await new Promise(r => setTimeout(r, 5000));
    }

    await ensurePostsFilter();
    startScraping();
}

async function startScraping() {
    scrolling = true;
    console.log("WBL: Scraper active.");

    let scrollCount = 0;
    while (scrolling) {
        scrollCount++;
        const foundCount = extractVisiblePosts();
        console.log(`WBL: Scroll #${scrollCount} completed. Found ${foundCount} in this view.`);

        window.scrollBy(0, 800);
        const waitTime = 3000 + Math.random() * 2000;
        await new Promise(r => setTimeout(r, waitTime));
    }
}

function extractVisiblePosts() {
    // 1. Force Expand
    const expandSelectors = [
        'button.feed-shared-inline-show-more-text',
        'button.reusable-search-expand-button',
        '.content-expand-button',
        '.inline-show-more-text__button'
    ];
    document.querySelectorAll(expandSelectors.join(', ')).forEach(btn => {
        try { btn.click(); } catch (e) { }
    });

    // 2. Selectors
    const selectors = [
        '.reusable-search__result-container',
        '.entity-result',
        '.feed-shared-update-v2',
        '.search-results__list-item'
    ];

    let foundPosts = document.querySelectorAll(selectors.join(', '));
    if (foundPosts.length === 0) {
        foundPosts = document.querySelectorAll('div.feed-shared-update-v2');
    }

    let localFound = 0;

    foundPosts.forEach((post) => {
        const postText = (post.innerText || "").trim();
        if (postText.length < 40) return;

        const textSnippet = postText.substring(0, 100);
        const postId = post.getAttribute('data-urn') || post.getAttribute('data-id') || hashString(textSnippet);

        if (processedIds.has(postId)) return;
        processedIds.add(postId);

        const email = extractEmail(postText);
        const phone = extractPhone(postText);

        // Topic Match
        let matchesTopic = false;
        if (window.location.href.includes('/search/')) {
            matchesTopic = true;
        } else {
            const textLower = postText.toLowerCase();
            if (keywords.length > 0) {
                matchesTopic = keywords.some(kw => textLower.includes(kw));
            } else {
                matchesTopic = aiKeywords.some(kw => textLower.includes(kw));
            }
        }

        const isWorthSaving = matchesTopic && (email || phone || window.location.href.includes('/search/'));

        if (isWorthSaving) {

            // Name Extraction
            let name = "LinkedIn User";
            const nameSelectors = [
                'span[aria-hidden="true"]',
                '.entity-result__title-text a'
            ];

            for (let sel of nameSelectors) {
                const el = post.querySelector(sel);
                if (el) {
                    const rawName = el.innerText.trim();
                    if (rawName && rawName.length > 2 && !rawName.toLowerCase().includes('member') && !rawName.toLowerCase().includes('view')) {
                        name = rawName.split('\n')[0];
                        break;
                    }
                }
            }

            // LinkedIn ID
            const profileLink = post.querySelector('a[href*="/in/"]');
            let profile_url = profileLink ? profileLink.href.split('?')[0] : '';
            let linkedin_id = '';

            if (profile_url) {
                // remove trailing slash
                let clean = profile_url.replace(/\/$/, "");
                const match = clean.match(/\/in\/([^\/]+)$/);
                if (match && match[1]) {
                    linkedin_id = match[1];
                }
            }

            // Location Logic - Use secondary-subtitle container to capture location cleanly
            // This prevents capturing the Headline (primary-subtitle)
            let location = "";
            const secSubtitle = post.querySelector('.entity-result__secondary-subtitle');
            if (secSubtitle) {
                location = secSubtitle.innerText.trim();
            } else {
                const userLoc = post.querySelector('.text-body-small.inline.t-black--light.break-words');
                if (userLoc) location = userLoc.innerText.trim();
            }
            // Strict Truncate
            if (location && location.length > 100) location = location.substring(0, 99);

            // Company Logic
            let company = "";
            // Look for Summary (often contains company in search results)
            const sumEl = post.querySelector('.entity-result__summary');
            if (sumEl) {
                company = sumEl.innerText.trim();
            }
            if (!company) {
                const compEl = post.querySelector('.inline-show-more-text--is-collapsed');
                if (compEl) company = compEl.innerText.trim();
            }
            if (!company) {
                // Headline fallback
                const headEl = post.querySelector('.entity-result__primary-subtitle');
                if (headEl) {
                    const txt = headEl.innerText;
                    if (txt.includes(' at ')) company = txt.split(' at ').pop().trim();
                }
            }
            if (company && company.length > 100) company = company.substring(0, 99);

            // Constraint
            if (!email && !linkedin_id) return;

            const data = {
                name: name.substring(0, 100),
                post_text: postText.substring(0, 1500),
                email: email || null,
                phone: phone || null,
                linkedin_id: linkedin_id, // Clean ID
                profile_url: profile_url,
                location: location || null,
                company: company || null
            };

            console.log(`%c WBL: Lead Found! [${name}]`, "color: #057642; font-weight: bold; font-size: 13px;");
            localFound++;

            chrome.runtime.sendMessage({ action: 'extract_found', data: [data] });
        }
    });

    return localFound;
}

function extractEmail(text) {
    if (!text) return null;
    const patterns = [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
    ];
    const invalidPatterns = [
        /\.png/i, /\.jpg/i, /\.jpeg/i, /\.gif/i, /\.svg/i, /\.webp/i,
        /@2x\./i, /entity-circle/i, /placeholder/i,
        /example\.com/i, /test\.com/i, /guruteja234@gmail\.com/i,
        /sentry\.io/i, /noreply/i
    ];
    for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) {
            for (const email of matches) {
                if (email.includes('@') && email.split('@')[1].includes('.')) {
                    const isInvalid = invalidPatterns.some(inv => inv.test(email));
                    if (!isInvalid) return email;
                }
            }
        }
    }
    return null;
}

function extractPhone(text) {
    if (!text) return null;
    const patterns = [
        /\+?\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
        /\(\d{3}\)\s?\d{3}[-.\s]?\d{4}/g,
        /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g
    ];
    for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches && matches.length > 0) return matches[0];
    }
    return null;
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return hash.toString();
}
