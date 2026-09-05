// ==UserScript==
// @name         AtCoder Sidebar
// @name:ja      AtCoder サイドバー
// @namespace    https://github.com/ei2332
// @version      1.2.10
// @description  Displays favorite-user standings, problem statistics, and real-time difficulty predictions in an extensible sidebar on AtCoder contest pages.
// @description:ja AtCoderのコンテストページに、順位表・問題統計・リアルタイム難易度予想を表示します。
// @match        https://atcoder.jp/contests/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      atcoder.jp
// @author       ei2332
// @license      MIT
// ==/UserScript==

(function() {
'use strict';

const STORAGE_KEYS = {
    config: 'acs:config',
    caches: 'acs:cache',
    uiState: 'acs:ui-state',
};

const DEFAULT_CONFIG = {
    panelWidth: 340,
    panelHeight: 340,
    updateInterval: 30,
    pendingUpdateInterval: 5,
};

const CACHE_TTL = 30 * 60 * 1000;
const DIFFICULTY_MODEL_VERSION = 3;

const RATING_BANDS = [
    {label: '灰', minimum: -Infinity, color: '#808080'},
    {label: '茶', minimum: 400, color: '#804000'},
    {label: '緑', minimum: 800, color: '#008000'},
    {label: '水', minimum: 1200, color: '#00c0c0'},
    {label: '青', minimum: 1600, color: '#0000ff'},
    {label: '黄', minimum: 2000, color: '#c0c000'},
    {label: '橙', minimum: 2400, color: '#ff8000'},
    {label: '赤', minimum: 2800, color: '#ff0000'},
];

const SIDEBAR_CSS = `
    :root {
        --acs-panel-width: 340px;
        --acs-panel-height: 340px;
    }

    #acs-sidebar {
        position: fixed;
        right: calc(-1 * var(--acs-panel-width));
        bottom: 0;
        z-index: 9998;
        display: flex;
        flex-direction: column;
        width: var(--acs-panel-width);
        height: var(--acs-panel-height);
        overflow: hidden;
        background: #fff;
        border: 1px solid #ccc;
        border-bottom: 0;
        border-radius: 6px 6px 0 0;
        box-shadow: -2px -2px 12px rgba(0, 0, 0, 0.15);
        transition: right 0.3s ease;
    }

    #acs-sidebar.is-open {
        right: 0;
    }

    #acs-sidebar-toggle {
        position: fixed;
        right: 0;
        bottom: 8px;
        z-index: 9999;
        padding: 12px 6px;
        color: #fff;
        font-size: 13px;
        writing-mode: vertical-rl;
        cursor: pointer;
        background: #00a0e9;
        border: 0;
        border-radius: 4px 0 0 4px;
        transition: right 0.3s ease;
    }

    #acs-sidebar-toggle.is-open {
        right: var(--acs-panel-width);
    }

    #acs-tab-bar {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        min-width: 0;
        overflow-x: auto;
        background: #f5f5f5;
        border-bottom: 2px solid #00a0e9;
    }

    .acs-tab-button {
        flex: 0 0 auto;
        padding: 6px 14px;
        margin-bottom: -2px;
        color: #888;
        font-size: 12px;
        font-weight: bold;
        white-space: nowrap;
        cursor: pointer;
        background: none;
        border: 0;
        border-bottom: 2px solid transparent;
    }

    .acs-tab-button.is-active {
        color: #00a0e9;
        background: #fff;
        border-bottom-color: #00a0e9;
    }

    #acs-clock {
        flex: 0 0 auto;
        padding: 0 10px;
        margin-left: auto;
        color: #333;
        font-size: 12px;
        font-weight: bold;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }

    .acs-panel-content {
        display: none;
        flex: 1;
        min-height: 0;
        padding: 0 8px 8px;
        overflow: auto;
    }

    .acs-panel-content.is-active {
        display: block;
    }

    .acs-message {
        padding: 16px;
        color: #888;
        font-size: 12px;
        text-align: center;
    }

    .acs-problems-table {
        width: 100%;
        font-size: 11px;
        table-layout: fixed;
        border-collapse: collapse;
    }

    .acs-problems-table th {
        padding: 3px 4px;
        font-size: 10px;
        text-align: center;
        background: #f0f0f0;
        border-bottom: 2px solid #ccc;
    }

    .acs-problems-table th:nth-child(1) { width: 36px; }
    .acs-problems-table th:nth-child(2) { width: 54px; }
    .acs-problems-table th:nth-child(3) { width: auto; }

    .acs-problems-table td {
        padding: 3px 4px;
        text-align: center;
        vertical-align: middle;
        border-bottom: 1px solid #eee;
    }

    .acs-problem-label a {
        color: #00a0e9;
        font-weight: bold;
        text-decoration: none;
    }

    .acs-problem-label a:hover {
        text-decoration: underline;
    }

    .acs-rate-bar {
        position: relative;
        display: flex;
        width: 100%;
        height: 10px;
        overflow: hidden;
        background: #eee;
        border-radius: 2px;
    }

    .acs-rate-segment {
        display: block;
        height: 100%;
    }

    .acs-rate-bar.is-low-sample .acs-rate-segment {
        opacity: 0.4;
    }

    .acs-difficulty-marker {
        position: absolute;
        top: 0;
        bottom: 0;
        z-index: 1;
        width: 2px;
        background: #111;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.9);
        transform: translateX(-1px);
    }

    .acs-standings-table {
        font-size: 12px;
        white-space: nowrap;
        border-spacing: 0;
        border-collapse: separate;
    }

    .acs-standings-table th,
    .acs-standings-table td {
        padding: 4px 5px;
        text-align: center;
        border-bottom: 1px solid #eee;
    }

    .acs-standings-table thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: #f0f0f0;
        border-bottom: 2px solid #ccc;
    }

    .acs-sticky {
        position: sticky;
        z-index: 1;
        background: #fff;
    }

    .acs-sticky-rank { left: 0; }
    .acs-sticky-user { left: 30px; }

    thead .acs-sticky {
        z-index: 3;
        background: #f0f0f0;
    }

    .acs-user {
        width: 90px;
        max-width: 90px;
        overflow: hidden;
        text-align: left !important;
        text-overflow: ellipsis;
    }

    .acs-status-ac { color: #009900; font-weight: bold; }
    .acs-status-wa { color: #cc0000; }

    .acs-status-wa-link {
        color: #cc0000;
        cursor: pointer;
    }

    .acs-status-wa-link:hover {
        opacity: 0.7;
        text-decoration: underline;
    }

    .acs-current-user td { background: #fff176 !important; }
    .acs-solved-problem td { background: #81c784 !important; }

    #acs-settings-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
    }

    #acs-settings-dialog {
        width: 300px;
        padding: 20px;
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    #acs-settings-dialog h3 {
        margin-top: 0;
        font-size: 16px;
    }

    .acs-settings-row { margin-bottom: 12px; }

    .acs-settings-row label {
        display: block;
        margin-bottom: 4px;
        color: #333;
        font-size: 12px;
        text-align: left;
    }

    .acs-settings-row input {
        box-sizing: border-box;
        width: 100%;
        padding: 4px;
        border: 1px solid #ccc;
        border-radius: 4px;
    }

    .acs-settings-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        margin-top: 20px;
    }

    .acs-settings-actions button {
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
        border-radius: 4px;
    }

    .acs-settings-cancel {
        color: #333;
        background: #eee;
        border: 1px solid #ccc;
    }

    .acs-settings-save {
        color: #fff;
        background: #00a0e9;
        border: 0;
    }
`;

function createElement(tagName, options = {}, children = []) {
    const element = document.createElement(tagName);
    if (options.className) element.className = options.className;
    if (options.text !== undefined) element.textContent = String(options.text);
    if (options.id) element.id = options.id;

    Object.entries(options.attributes || {}).forEach(([name, value]) => {
        element.setAttribute(name, String(value));
    });

    const childList = Array.isArray(children) ? children : [children];
    childList.filter(Boolean).forEach(child => element.appendChild(child));
    return element;
}

function createMessage(text) {
    return createElement('div', {className: 'acs-message', text});
}

function parseJson(value, fallback) {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function positiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

class AppStorage {
    getConfig() {
        const saved = parseJson(GM_getValue(STORAGE_KEYS.config, '{}'), {});
        return {
            panelWidth: positiveNumber(saved.panelWidth ?? saved.panelW, DEFAULT_CONFIG.panelWidth),
            panelHeight: positiveNumber(saved.panelHeight ?? saved.panelH, DEFAULT_CONFIG.panelHeight),
            updateInterval: positiveNumber(saved.updateInterval, DEFAULT_CONFIG.updateInterval),
            pendingUpdateInterval: positiveNumber(
                saved.pendingUpdateInterval ?? saved.updateIntervalWj ?? saved.updateInterval_WJ,
                DEFAULT_CONFIG.pendingUpdateInterval,
            ),
        };
    }

    saveConfig(config) {
        GM_setValue(STORAGE_KEYS.config, JSON.stringify({
            panelWidth: config.panelWidth,
            panelHeight: config.panelHeight,
            updateInterval: config.updateInterval,
            pendingUpdateInterval: config.pendingUpdateInterval,
        }));
    }

    getUiState(legacyState = 0) {
        const fallback = {
            open: (legacyState & 1) === 1,
            activePanelId: (legacyState & 2) === 2 ? 'problems' : 'standings',
        };
        const saved = parseJson(GM_getValue(STORAGE_KEYS.uiState, ''), fallback);
        return {
            open: saved.open === true,
            activePanelId: typeof saved.activePanelId === 'string'
                ? saved.activePanelId
                : fallback.activePanelId,
        };
    }

    saveUiState(state) {
        GM_setValue(STORAGE_KEYS.uiState, JSON.stringify(state));
    }

    getCache(contestId) {
        return this.getAllCaches().find(cache => cache.contestId === contestId) ?? null;
    }

    saveCache(cache) {
        const otherCaches = this.getAllCaches().filter(item => item.contestId !== cache.contestId);
        GM_setValue(STORAGE_KEYS.caches, JSON.stringify([...otherCaches, cache]));
    }

    collectGarbage() {
        const now = Date.now();
        const freshCaches = this.getAllCaches().filter(cache => now - cache.updatedAt < CACHE_TTL);
        GM_setValue(STORAGE_KEYS.caches, JSON.stringify(freshCaches));
    }

    getAllCaches() {
        const caches = parseJson(GM_getValue(STORAGE_KEYS.caches, '[]'), []);
        return Array.isArray(caches) ? caches : [];
    }
}

class AtCoderClient {
    getContestId() {
        return location.pathname.match(/\/contests\/([^/]+)/)?.[1] ?? null;
    }

    getCurrentUser() {
        const profileLink = Array.from(document.querySelectorAll('a[href^="/users/"]')).find(link => {
            const label = link.textContent.trim();
            return label === 'マイプロフィール' || label === 'My Profile';
        });
        return profileLink?.pathname.split('/users/')[1] || null;
    }

    getFavoriteUsers(currentUser) {
        const saved = parseJson(localStorage.getItem('fav') || '[]', []);
        const favorites = new Set(Array.isArray(saved) ? saved : []);
        if (currentUser) favorites.add(currentUser);
        return favorites;
    }

    fetchStandings(contestId) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://atcoder.jp/contests/${contestId}/standings/json`,
                onload: response => {
                    if (response.status && (response.status < 200 || response.status >= 300)) {
                        reject(new Error(`Standings request failed: HTTP ${response.status}`));
                        return;
                    }

                    try {
                        resolve(JSON.parse(response.responseText));
                    } catch (error) {
                        reject(error);
                    }
                },
                onerror: error => reject(error),
            });
        });
    }

    shouldOpenLatestSubmission() {
        const requested = new URLSearchParams(location.search).get('currentOpen') === 'true';
        return requested && /\/submissions\/me\/?$/.test(location.pathname);
    }

    openLatestSubmission() {
        const link = document.querySelector('a.submission-details-link');
        if (!link) return;
        setTimeout(() => {
            window.location.href = link.href;
        }, 500);
    }

    openSubmissionPage(contestId, taskName) {
        const url = new URL(`https://atcoder.jp/contests/${contestId}/submissions/me`);
        url.searchParams.set('f.Task', taskName);
        url.searchParams.set('currentOpen', 'true');
        window.open(url, '_blank');
    }
}

class StandingsProcessor {
    process(raw, currentUser, favoriteUsers, contestId) {
        const taskInfo = raw.TaskInfo || [];
        const standingsData = raw.StandingsData || [];
        const currentUserData = standingsData.find(row => row.UserScreenName === currentUser) ?? null;
        const useOldRatings = raw.Fixed === true
            && standingsData.some(row => Number(row.OldRating) > 0);

        return {
            taskMeta: taskInfo.map(task => ({
                name: task.TaskScreenName,
                assignment: task.Assignment,
            })),
            tasks: this.buildTaskStats(
                taskInfo,
                standingsData,
                currentUserData,
                contestId,
                useOldRatings,
            ),
            standings: this.buildFavoriteStandings(
                taskInfo,
                standingsData,
                currentUser,
                favoriteUsers,
            ),
            fixed: raw.Fixed === true,
            hasPendingSubmission: Object.values(currentUserData?.TaskResults || {})
                .some(result => result?.Pending),
        };
    }

    buildTaskStats(taskInfo, standingsData, currentUserData, contestId, useOldRatings = false) {
        const participantRows = standingsData.filter(row => this.hasParticipated(row));
        const defaultInnerRating = this.getDefaultInnerRating(contestId);
        const participantRatings = participantRows.map(row => (
            this.getParticipantInnerRating(row, defaultInnerRating, useOldRatings)
        ));

        return taskInfo.map(task => {
            const taskName = task.TaskScreenName;
            const maximumScore = participantRows.reduce((maximum, row) => (
                Math.max(maximum, Number(row.TaskResults?.[taskName]?.Score) || 0)
            ), 0);
            const acceptedRows = maximumScore > 0
                ? participantRows.filter(row => (
                    Number(row.TaskResults?.[taskName]?.Score) === maximumScore
                ))
                : [];
            const ratings = acceptedRows
                .map(row => this.getParticipantInnerRating(
                    row,
                    defaultInnerRating,
                    useOldRatings,
                ))
                .sort((left, right) => left - right);
            const difficulty = acceptedRows.length > 0
                ? this.predictDifficulty(participantRatings, ratings.length)
                : null;

            return {
                name: taskName,
                assignment: task.Assignment,
                acCount: acceptedRows.length,
                ratings,
                predictedDifficulty: difficulty?.displayRating ?? null,
                predictedInnerDifficulty: difficulty?.innerRating ?? null,
                solvedByCurrentUser: maximumScore > 0
                    && Number(currentUserData?.TaskResults?.[taskName]?.Score) === maximumScore,
            };
        });
    }

    buildFavoriteStandings(taskInfo, standingsData, currentUser, favoriteUsers) {
        const taskNames = taskInfo.map(task => task.TaskScreenName);
        return standingsData
            .filter(row => !row.UserIsDeleted && favoriteUsers.has(row.UserScreenName))
            .map(row => ({
                rank: row.Rank,
                user: row.UserScreenName,
                isCurrentUser: row.UserScreenName === currentUser,
                results: Object.fromEntries(taskNames.map(taskName => [
                    taskName,
                    this.getSubmissionStatus(row.TaskResults?.[taskName]),
                ])),
            }));
    }

    getSubmissionStatus(result) {
        if (result?.Status === 1) return 'ac';
        if (result?.Pending) return 'pending';
        if (result?.Count > 0) return 'wa';
        return 'none';
    }

    calculateInnerRating(rating, competitions) {
        const normalizedRating = rating < 400
            ? 400 * (1 - Math.log(400 / rating))
            : rating;
        const competitionAdjustment = 1200 * (
            Math.sqrt(1 - Math.pow(0.81, competitions))
            / (1 - Math.pow(0.9, competitions))
            - 1
        ) / (Math.sqrt(19) - 1);
        return normalizedRating + competitionAdjustment;
    }

    hasParticipated(row) {
        if (row.UserIsDeleted || !row.TaskResults) return false;
        if (Number(row.TotalResult?.Count) > 0) return true;

        return Object.values(row.TaskResults).some(result => result && (
            Number(result.Score) > 0
            || Number(result.Count) > 0
            || Number(result.Failure) > 0
            || result.Pending === true
        ));
    }

    getParticipantInnerRating(row, defaultInnerRating, useOldRating = false) {
        const rating = Number(useOldRating ? row.OldRating : row.Rating);
        const competitions = Number(row.Competitions);
        if (!Number.isFinite(rating) || rating <= 0 || !Number.isFinite(competitions) || competitions <= 0) {
            return defaultInnerRating;
        }
        return this.calculateInnerRating(Math.max(rating, 1), competitions);
    }

    getDefaultInnerRating(contestId = '') {
        const match = String(contestId).match(/^(abc|arc|agc)(\d{3,})$/i);
        if (!match) return 800;

        const contestType = match[1].toLowerCase();
        const contestNumber = Number(match[2]);
        if (contestType === 'abc') return contestNumber >= 430 ? 1200 : 800;
        if (contestType === 'arc') return contestNumber >= 104 ? 1000 : 1600;
        return contestNumber >= 34 ? 1200 : 1600;
    }

    predictDifficulty(participantRatings, acceptedCount) {
        if (participantRatings.length === 0 || acceptedCount <= 0) return null;

        // 各参加者の予測正解確率の合計が実際の正解者数になる難易度を求める。
        let lower = -10000;
        let upper = 10000;
        while (upper - lower > 1) {
            const middle = Math.floor((lower + upper) / 2);
            const expectedAcceptedCount = participantRatings.reduce((sum, rating) => (
                sum + 1 / (1 + Math.pow(6, (middle - rating) / 400))
            ), 0);

            if (expectedAcceptedCount < acceptedCount) upper = middle;
            else lower = middle;
        }

        const displayRating = lower >= 400
            ? lower
            : 400 / Math.exp(1 - lower / 400);
        return {
            innerRating: lower,
            displayRating: Math.round(displayRating),
        };
    }
}

class PanelRegistry {
    constructor() {
        this.panels = new Map();
        this.listeners = new Set();
    }

    register(panel) {
        this.validate(panel);
        if (this.panels.has(panel.id)) {
            throw new Error(`Panel "${panel.id}" is already registered.`);
        }
        this.panels.set(panel.id, panel);
        this.notify();
        return () => this.unregister(panel.id);
    }

    unregister(panelId) {
        const deleted = this.panels.delete(panelId);
        if (deleted) this.notify();
        return deleted;
    }

    getAll() {
        return [...this.panels.values()];
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify() {
        this.listeners.forEach(listener => listener(this.getAll()));
    }

    validate(panel) {
        if (!panel || typeof panel !== 'object') {
            throw new TypeError('A panel definition must be an object.');
        }
        if (!/^[a-z][a-z0-9-]*$/.test(panel.id || '')) {
            throw new TypeError('panel.id must contain lowercase letters, digits, or hyphens.');
        }
        if (typeof panel.label !== 'string' || !panel.label.trim()) {
            throw new TypeError('panel.label must be a non-empty string.');
        }
        if (typeof panel.render !== 'function') {
            throw new TypeError('panel.render must be a function.');
        }
    }
}

class SidebarView {
    constructor({registry, config, getContext, onOpenChange, onPanelChange}) {
        this.registry = registry;
        this.config = config;
        this.getContext = getContext;
        this.onOpenChange = onOpenChange;
        this.onPanelChange = onPanelChange;
        this.activePanelId = null;
        this.isOpen = false;
        this.elements = {};
    }

    mount(initialState) {
        this.injectStyles();

        const sidebar = createElement('aside', {id: 'acs-sidebar'});
        const tabBar = createElement('div', {id: 'acs-tab-bar'});
        const clock = createElement('span', {id: 'acs-clock', text: '--:--:--'});
        const toggle = createElement('button', {
            id: 'acs-sidebar-toggle',
            text: '順位表',
            attributes: {type: 'button', 'aria-label': 'AtCoder Sidebar を開閉'},
        });

        tabBar.appendChild(clock);
        sidebar.appendChild(tabBar);
        document.body.append(sidebar, toggle);

        this.elements = {sidebar, tabBar, clock, toggle};
        toggle.addEventListener('click', () => this.setOpen(!this.isOpen, true));
        this.unsubscribeRegistry = this.registry.subscribe(() => this.syncPanels());

        this.activePanelId = initialState.activePanelId;
        this.syncPanels();
        this.selectPanel(initialState.activePanelId, false);
        this.setOpen(initialState.open, false);
        this.syncClock();
    }

    injectStyles() {
        document.documentElement.style.setProperty('--acs-panel-width', `${this.config.panelWidth}px`);
        document.documentElement.style.setProperty('--acs-panel-height', `${this.config.panelHeight}px`);

        const style = createElement('style');
        style.textContent = SIDEBAR_CSS;
        document.head.appendChild(style);

        this.clockMask = createElement('style');
        document.head.appendChild(this.clockMask);
    }

    syncPanels() {
        const panels = this.registry.getAll();
        const validIds = new Set(panels.map(panel => panel.id));

        this.elements.tabBar.querySelectorAll('.acs-tab-button').forEach(button => {
            if (!validIds.has(button.dataset.panelId)) button.remove();
        });
        this.elements.sidebar.querySelectorAll('.acs-panel-content').forEach(content => {
            if (!validIds.has(content.dataset.panelId)) content.remove();
        });

        panels.forEach(panel => {
            if (this.getPanelElement(panel.id)) return;

            const button = createElement('button', {
                className: 'acs-tab-button',
                text: panel.label,
                attributes: {type: 'button'},
            });
            button.dataset.panelId = panel.id;
            button.addEventListener('click', () => this.selectPanel(panel.id, true));
            this.elements.tabBar.insertBefore(button, this.elements.clock);

            const content = createElement('section', {className: 'acs-panel-content'});
            content.dataset.panelId = panel.id;
            content.appendChild(createMessage('データ取得中...'));
            this.elements.sidebar.appendChild(content);
            this.renderPanel(panel);
        });

        if (!validIds.has(this.activePanelId)) {
            this.selectPanel(panels[0]?.id ?? null, true);
        } else {
            this.applyActivePanel();
        }
    }

    renderAll() {
        this.registry.getAll().forEach(panel => this.renderPanel(panel));
    }

    renderPanel(panel) {
        const content = this.getPanelElement(panel.id);
        if (!content) return;

        try {
            const rendered = panel.render(this.getContext());
            if (!rendered?.nodeType) {
                throw new TypeError(`Panel "${panel.id}" did not return a DOM Node.`);
            }
            content.replaceChildren(rendered);
        } catch (error) {
            console.error(`[AtCoder Sidebar] Failed to render panel "${panel.id}".`, error);
            content.replaceChildren(createMessage(`パネルの描画に失敗しました: ${panel.label}`));
        }
    }

    selectPanel(panelId, notify) {
        const exists = this.registry.getAll().some(panel => panel.id === panelId);
        this.activePanelId = exists ? panelId : this.registry.getAll()[0]?.id ?? null;
        this.applyActivePanel();
        if (notify && this.activePanelId) this.onPanelChange(this.activePanelId);
    }

    applyActivePanel() {
        this.elements.tabBar.querySelectorAll('.acs-tab-button').forEach(button => {
            const active = button.dataset.panelId === this.activePanelId;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
        });
        this.elements.sidebar.querySelectorAll('.acs-panel-content').forEach(content => {
            content.classList.toggle('is-active', content.dataset.panelId === this.activePanelId);
        });
    }

    setOpen(open, notify) {
        this.isOpen = Boolean(open);
        this.elements.sidebar.classList.toggle('is-open', this.isOpen);
        this.elements.toggle.classList.toggle('is-open', this.isOpen);
        this.elements.toggle.setAttribute('aria-expanded', String(this.isOpen));
        this.clockMask.textContent = this.isOpen
            ? '#fixed-server-timer { display: none !important; }'
            : '';
        if (notify) this.onOpenChange(this.isOpen);
    }

    getPanelElement(panelId) {
        return [...this.elements.sidebar.querySelectorAll('.acs-panel-content')]
            .find(content => content.dataset.panelId === panelId) ?? null;
    }

    syncClock() {
        const source = document.getElementById('fixed-server-timer');
        if (!source) {
            setTimeout(() => this.syncClock(), 500);
            return;
        }

        const update = () => {
            this.elements.clock.textContent = source.textContent.trim() || '--:--:--';
        };
        update();
        new MutationObserver(update).observe(source, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }
}

class SettingsDialog {
    constructor(storage) {
        this.storage = storage;
    }

    open() {
        if (document.getElementById('acs-settings-overlay')) return;

        const config = this.storage.getConfig();
        const overlay = createElement('div', {id: 'acs-settings-overlay'});
        const dialog = createElement('form', {id: 'acs-settings-dialog'});
        const actions = createElement('div', {className: 'acs-settings-actions'});
        const fields = [
            {key: 'panelWidth', label: 'パネル幅 (px)', value: config.panelWidth},
            {key: 'panelHeight', label: 'パネル高さ (px)', value: config.panelHeight},
            {key: 'updateInterval', label: '通常時の更新間隔 (秒)', value: config.updateInterval},
            {
                key: 'pendingUpdateInterval',
                label: 'WJ時の更新間隔 (秒)',
                value: config.pendingUpdateInterval,
            },
        ];
        const inputs = new Map();

        dialog.appendChild(createElement('h3', {text: 'AtCoder Sidebar 設定'}));
        fields.forEach(field => {
            const input = createElement('input', {
                attributes: {type: 'number', min: '1', step: '1', value: field.value},
            });
            const row = createElement('div', {className: 'acs-settings-row'}, [
                createElement('label', {text: field.label}),
                input,
            ]);
            inputs.set(field.key, input);
            dialog.appendChild(row);
        });

        const cancel = createElement('button', {
            className: 'acs-settings-cancel',
            text: 'キャンセル',
            attributes: {type: 'button'},
        });
        const save = createElement('button', {
            className: 'acs-settings-save',
            text: '保存してリロード',
            attributes: {type: 'submit'},
        });

        cancel.addEventListener('click', () => overlay.remove());
        dialog.addEventListener('submit', event => {
            event.preventDefault();
            this.storage.saveConfig(Object.fromEntries(fields.map(field => [
                field.key,
                positiveNumber(inputs.get(field.key).value, field.value),
            ])));
            location.reload();
        });

        actions.append(cancel, save);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    }
}

class AtCoderSidebarApp {
    constructor({storage, client, processor, registry}) {
        this.storage = storage;
        this.client = client;
        this.processor = processor;
        this.registry = registry;
        this.contestId = null;
        this.currentUser = null;
        this.cache = null;
        this.latestRawStandings = null;
        this.updateTimer = null;
        this.updateInProgress = false;
        this.view = null;
    }

    start() {
        GM_registerMenuCommand('AtCoder Sidebar 設定', () => {
            new SettingsDialog(this.storage).open();
        });

        if (this.client.shouldOpenLatestSubmission()) {
            this.client.openLatestSubmission();
            return;
        }

        this.contestId = this.client.getContestId();
        if (!this.contestId) return;

        this.currentUser = this.client.getCurrentUser();
        this.storage.collectGarbage();
        this.cache = this.storage.getCache(this.contestId) ?? this.createEmptyCache();

        const config = this.storage.getConfig();
        const uiState = this.storage.getUiState(this.cache.state ?? 0);
        this.view = new SidebarView({
            registry: this.registry,
            config,
            getContext: () => this.createPanelContext(),
            onOpenChange: open => this.saveUiState({open}),
            onPanelChange: activePanelId => this.saveUiState({activePanelId}),
        });
        this.view.mount(uiState);
        this.view.renderAll();

        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
        const forceRefresh = this.needsDifficultyRefresh();
        if (!document.hidden && (!this.cache.fixed || forceRefresh)) {
            this.fetchAndUpdate(forceRefresh);
        }
    }

    createEmptyCache() {
        return {
            contestId: this.contestId,
            difficultyModelVersion: DIFFICULTY_MODEL_VERSION,
            updatedAt: Date.now(),
            taskMeta: null,
            tasks: null,
            standings: null,
            fixed: false,
        };
    }

    createPanelContext() {
        return {
            contestId: this.contestId,
            currentUser: this.currentUser,
            cache: this.cache,
            rawStandings: this.latestRawStandings,
            createElement,
            createMessage,
            actions: {
                openSubmission: taskName => {
                    this.client.openSubmissionPage(this.contestId, taskName);
                },
            },
        };
    }

    saveUiState(change) {
        const current = {
            open: this.view?.isOpen ?? false,
            activePanelId: this.view?.activePanelId ?? 'standings',
        };
        this.storage.saveUiState({...current, ...change});
    }

    needsDifficultyRefresh() {
        return Array.isArray(this.cache?.tasks)
            && this.cache.difficultyModelVersion !== DIFFICULTY_MODEL_VERSION;
    }

    async fetchAndUpdate(force = false) {
        if (document.hidden || (this.cache.fixed && !force) || this.updateInProgress) return;
        this.clearUpdateTimer();
        this.updateInProgress = true;

        try {
            console.log('[AtCoder Sidebar] Fetching standings.');
            const raw = await this.client.fetchStandings(this.contestId);
            const favoriteUsers = this.client.getFavoriteUsers(this.currentUser);
            const {hasPendingSubmission, ...processed} = this.processor.process(
                raw,
                this.currentUser,
                favoriteUsers,
                this.contestId,
            );

            this.latestRawStandings = raw;
            this.cache = {
                contestId: this.contestId,
                difficultyModelVersion: DIFFICULTY_MODEL_VERSION,
                updatedAt: Date.now(),
                ...processed,
            };
            this.storage.saveCache(this.cache);
            this.view.renderAll();

            if (!this.cache.fixed) {
                const config = this.storage.getConfig();
                const interval = hasPendingSubmission
                    ? config.pendingUpdateInterval
                    : config.updateInterval;
                this.scheduleUpdate(interval * 1000);
            }
        } catch (error) {
            console.error('[AtCoder Sidebar] Failed to update standings.', error);
            this.scheduleUpdate(10 * 1000, force);
        } finally {
            this.updateInProgress = false;
        }
    }

    handleVisibilityChange() {
        if (document.hidden) {
            this.clearUpdateTimer();
            return;
        }

        this.storage.collectGarbage();
        const freshCache = this.storage.getCache(this.contestId);
        if (freshCache && freshCache.updatedAt > this.cache.updatedAt) {
            this.cache = freshCache;
            this.view.renderAll();
        }
        const forceRefresh = this.needsDifficultyRefresh();
        if (!this.cache.fixed || forceRefresh) this.fetchAndUpdate(forceRefresh);
    }

    scheduleUpdate(delay, force = false) {
        if (document.hidden || (this.cache.fixed && !force)) return;
        this.clearUpdateTimer();
        this.updateTimer = setTimeout(() => {
            this.updateTimer = null;
            this.fetchAndUpdate(force);
        }, delay);
    }

    clearUpdateTimer() {
        if (!this.updateTimer) return;
        clearTimeout(this.updateTimer);
        this.updateTimer = null;
    }
}

function countValuesBelow(sortedValues, target) {
    let lower = -1;
    let upper = sortedValues.length;
    while (upper - lower > 1) {
        const middle = (lower + upper) >> 1;
        if (sortedValues[middle] < target) lower = middle;
        else upper = middle;
    }
    return upper;
}

function createRatingBar(ratings, predictedDifficulty, predictedInnerDifficulty) {
    const bar = createElement('div', {className: 'acs-rate-bar'});
    if (ratings.length < 100) {
        bar.classList.add('is-low-sample');
        bar.title = 'サンプル数が少ないため精度が低い可能性があります';
    }

    RATING_BANDS.forEach((band, index) => {
        const lower = countValuesBelow(ratings, band.minimum);
        const upper = index + 1 < RATING_BANDS.length
            ? countValuesBelow(ratings, RATING_BANDS[index + 1].minimum)
            : ratings.length;
        const ratio = (upper - lower) / ratings.length;
        if (ratio <= 0) return;

        const segment = createElement('span', {className: 'acs-rate-segment'});
        segment.style.width = `${ratio * 100}%`;
        segment.style.background = band.color;
        segment.title = `${band.label}: ${Math.round(ratio * 100)}%`;
        bar.appendChild(segment);
    });

    if (Number.isFinite(predictedDifficulty) && Number.isFinite(predictedInnerDifficulty)) {
        const percentile = countValuesBelow(ratings, predictedInnerDifficulty) / ratings.length;
        const markerPosition = Math.min(99, Math.max(1, percentile * 100));
        const marker = createElement('span', {
            className: 'acs-difficulty-marker',
            attributes: {
                role: 'img',
                'aria-label': `推定難易度 ${predictedDifficulty}`,
            },
        });
        marker.style.left = `${markerPosition}%`;
        marker.title = `推定難易度: ${predictedDifficulty}`;
        bar.appendChild(marker);
    }
    return bar;
}

function createStandingsPanel() {
    return {
        id: 'standings',
        label: '順位表',
        render({cache, actions}) {
            if (!cache?.standings) return createMessage('データ取得中...');

            const taskMeta = cache.taskMeta || [];
            const table = createElement('table', {className: 'acs-standings-table'});
            const headerRow = table.createTHead().insertRow();
            const fixedHeaders = [
                {label: '順位', className: 'acs-sticky acs-sticky-rank', width: '30px'},
                {label: 'ユーザー', className: 'acs-sticky acs-sticky-user acs-user', width: '90px'},
            ];

            fixedHeaders.forEach(header => {
                const cell = createElement('th', {className: header.className, text: header.label});
                cell.style.width = header.width;
                headerRow.appendChild(cell);
            });
            taskMeta.forEach(task => {
                const cell = createElement('th', {text: task.assignment});
                cell.style.width = '28px';
                headerRow.appendChild(cell);
            });

            const body = table.createTBody();
            if (cache.standings.length === 0) {
                const cell = body.insertRow().insertCell();
                cell.colSpan = 2 + taskMeta.length;
                cell.appendChild(createMessage('お気に入りユーザーがいません'));
                return table;
            }

            cache.standings.forEach(standing => {
                const row = body.insertRow();
                if (standing.isCurrentUser ?? standing.isMe) row.classList.add('acs-current-user');

                const rank = row.insertCell();
                rank.className = 'acs-sticky acs-sticky-rank';
                rank.textContent = standing.rank;

                const user = row.insertCell();
                user.className = 'acs-sticky acs-sticky-user acs-user';
                user.textContent = standing.user;

                taskMeta.forEach(task => {
                    const cell = row.insertCell();
                    const status = standing.results[task.name];
                    if (status === 'ac') {
                        cell.className = 'acs-status-ac';
                        cell.textContent = '✓';
                    } else if (status === 'pending') {
                        cell.textContent = '…';
                    } else if (status === 'wa') {
                        cell.textContent = '✗';
                        if (standing.isCurrentUser ?? standing.isMe) {
                            cell.className = 'acs-status-wa-link';
                            cell.title = 'クリックで提出を確認';
                            cell.addEventListener('click', () => actions.openSubmission(task.name));
                        } else {
                            cell.className = 'acs-status-wa';
                        }
                    } else {
                        cell.textContent = '-';
                    }
                });
            });
            return table;
        },
    };
}

function createProblemsPanel() {
    return {
        id: 'problems',
        label: '難易度',
        render({cache, contestId}) {
            if (!cache?.tasks) return createMessage('データ取得中...');

            const table = createElement('table', {className: 'acs-problems-table'});
            const headerRow = table.createTHead().insertRow();
            ['問題', 'AC数', '内部レート'].forEach(label => {
                headerRow.appendChild(createElement('th', {text: label}));
            });

            const body = table.createTBody();
            cache.tasks.forEach(task => {
                const row = body.insertRow();
                if (task.solvedByCurrentUser ?? task.myAc) row.classList.add('acs-solved-problem');

                const problemCell = row.insertCell();
                problemCell.className = 'acs-problem-label';
                problemCell.appendChild(createElement('a', {
                    text: task.assignment,
                    attributes: {href: `/contests/${contestId}/tasks/${task.name}`},
                }));

                row.insertCell().textContent = `n=${task.acCount}`;
                const ratingCell = row.insertCell();
                const ratings = task.ratings ?? task.rates ?? [];
                if (ratings.length > 0) {
                    ratingCell.appendChild(createRatingBar(
                        ratings,
                        task.predictedDifficulty,
                        task.predictedInnerDifficulty,
                    ));
                }
                else ratingCell.textContent = '-';
            });
            return table;
        },
    };
}

const storage = new AppStorage();
const client = new AtCoderClient();
const processor = new StandingsProcessor();
const panelRegistry = new PanelRegistry();

panelRegistry.register(createStandingsPanel());
panelRegistry.register(createProblemsPanel());

const app = new AtCoderSidebarApp({
    storage,
    client,
    processor,
    registry: panelRegistry,
});

// 追加パネルは継承不要で、実行後でも登録できる。
// window.AtCoderSidebar.registerPanel({
//     id: 'example',
//     label: '追加',
//     render: ({cache, rawStandings, createElement}) =>
//         createElement('div', {text: `${cache.contestId}: ${rawStandings ? '取得済み' : '未取得'}`}),
// });
window.AtCoderSidebar = {
    registerPanel: panel => panelRegistry.register(panel),
    unregisterPanel: panelId => panelRegistry.unregister(panelId),
    get app() {
        return app;
    },
};

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => app.start(), {once: true});
} else {
    app.start();
}
})();
