
"use strict";

/* =========================================================
   TRACEPOINT AI — FRONTEND APPLICATION
   Vanilla JavaScript | FastAPI backend
   ========================================================= */

const API = {
    health: "/api/health",
    summary: "/api/summary",
    posts: "/api/posts",
    upload: "/api/upload",
    analyse: "/api/analyse",
    telegram: "/api/telegram/collect",
    graph: "/api/graph",
    export: "/api/export"
};

const state = {
    posts: [],
    filteredPosts: [],
    summary: {},
    graph: {},
    loading: false
};

/* -------------------- DOM HELPERS -------------------- */

const $ = (selector, parent = document) =>
    parent.querySelector(selector);

const $$ = (selector, parent = document) =>
    Array.from(parent.querySelectorAll(selector));

function getElement(...ids) {
    for (const id of ids) {
        const element = document.getElementById(id);
        if (element) return element;
    }
    return null;
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function showToast(message, type = "success") {
    const toast = getElement("toast");

    if (!toast) {
        console.log(message);
        return;
    }

    toast.textContent = message;
    toast.classList.remove("hidden", "error", "success");
    toast.classList.add(type);

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
        toast.classList.add("hidden");
    }, 3500);
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, options);

    const contentType = response.headers.get("content-type") || "";

    let data;

    if (contentType.includes("application/json")) {
        data = await response.json();
    } else {
        const text = await response.text();

        if (!response.ok) {
            throw new Error(text.slice(0, 200) || `HTTP ${response.status}`);
        }

        try {
            data = JSON.parse(text);
        } catch {
            data = { message: text };
        }
    }

    if (!response.ok) {
        throw new Error(
            data.detail || data.message || `Request failed: ${response.status}`
        );
    }

    return data;
}

function getArray(data) {
    if (Array.isArray(data)) return data;

    if (!data || typeof data !== "object") return [];

    const possible = [
        data.posts,
        data.items,
        data.results,
        data.records,
        data.data
    ];

    return possible.find(Array.isArray) || [];
}

/* -------------------- NAVIGATION -------------------- */

function go(view) {
    const validViews = [
        "overview",
        "feed",
        "analysis",
        "network",
        "evidence"
    ];

    if (!validViews.includes(view)) return;

    $$(".view").forEach(section => {
        section.classList.add("hidden");
    });

    const target = getElement(`view-${view}`);

    if (target) {
        target.classList.remove("hidden");
    }

    $$(".nav[data-view]").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.view === view
        );
    });

    const names = {
        overview: "Situation room",
        feed: "Intelligence feed",
        analysis: "Post analysis",
        network: "Link analysis",
        evidence: "Evidence & review"
    };

    const title = getElement("page-title");
    const crumb = getElement("crumb");

    if (title) title.textContent = names[view];
    if (crumb) crumb.textContent = "TRACEPOINT / " + names[view];

    if (view === "network") loadGraph();
    if (view === "evidence") renderEvidence();
}

function initializeNavigation() {
    $$(".nav[data-view]").forEach(button => {
        button.addEventListener("click", () => {
            go(button.dataset.view);
        });
    });

    $$("[data-go]").forEach(button => {
        button.addEventListener("click", () => {
            go(button.dataset.go);
        });
    });
}

/* -------------------- SUMMARY / DASHBOARD -------------------- */

function findMetricElement(names) {
    for (const name of names) {
        const element = getElement(name);
        if (element) return element;
    }

    return null;
}

function setMetric(names, value) {
    const element = findMetricElement(names);
    if (element) {
        element.textContent = value ?? 0;
    }
}

function renderSummary(data = {}) {
    state.summary = data;

    const total =
        data.total_posts ??
        data.total ??
        data.posts_count ??
        data.total_records ??
        state.posts.length;

    const high =
        data.high_risk ??
        data.high ??
        data.high_risk_count ??
        0;

    const medium =
        data.medium_risk ??
        data.medium ??
        data.medium_risk_count ??
        0;

    const low =
        data.low_risk ??
        data.low ??
        data.low_risk_count ??
        0;

    const identifiers =
        data.total_identifiers ??
        data.identifiers_count ??
        data.identifier_count ??
        0;

    setMetric(
        ["total-posts", "totalPosts", "total-records", "total"],
        total
    );

    setMetric(
        ["high-risk", "highRisk", "high-count"],
        high
    );

    setMetric(
        ["medium-risk", "mediumRisk", "medium-count"],
        medium
    );

    setMetric(
        ["low-risk", "lowRisk", "low-count"],
        low
    );

    setMetric(
        ["total-identifiers", "identifiers", "identifier-count"],
        identifiers
    );

    // Also support metric cards using data attributes.
    $$("[data-metric]").forEach(element => {
        const key = element.dataset.metric;

        const values = {
            total,
            total_posts: total,
            high,
            high_risk: high,
            medium,
            medium_risk: medium,
            low,
            low_risk: low,
            identifiers
        };

        if (key in values) {
            element.textContent = values[key];
        } else if (key in data) {
            element.textContent = data[key];
        }
    });

    renderCategoryBars(data.categories || data.category_counts || {});
    renderRiskBars({ high, medium, low });
}

function renderCategoryBars(categories) {
    const container = $(".bars");
    if (!container) return;

    let entries = [];

    if (Array.isArray(categories)) {
        entries = categories.map(item => [
            item.category || item.name || "Other",
            Number(item.count || item.total || 0)
        ]);
    } else if (categories && typeof categories === "object") {
        entries = Object.entries(categories).map(([key, value]) => [
            key,
            Number(typeof value === "object" ? value.count || 0 : value)
        ]);
    }

    if (!entries.length) {
        container.innerHTML =
            '<p class="empty">Category statistics will appear here.</p>';
        return;
    }

    const max = Math.max(1, ...entries.map(item => item[1]));

    container.innerHTML = entries.map(([name, count]) => `
        <div class="bar-row">
            <span>${escapeHTML(name)}</span>
            <div class="bar-track">
                <div class="bar-fill"
                     style="width:${Math.max(0, count / max * 100)}%">
                </div>
            </div>
            <span>${count}</span>
        </div>
    `).join("");
}

function renderRiskBars(risks) {
    const container = $(".risk-bars");
    if (!container) return;

    const entries = [
        ["High", risks.high, "high"],
        ["Medium", risks.medium, "medium"],
        ["Low", risks.low, "low"]
    ];

    const total = Math.max(
        1,
        entries.reduce((sum, item) => sum + Number(item[1] || 0), 0)
    );

    container.innerHTML = entries.map(([label, count, type]) => `
        <div class="risk-line">
            <span>${label}</span>
            <div class="risk-track">
                <div class="risk-fill ${type}"
                     style="width:${Number(count || 0) / total * 100}%">
                </div>
            </div>
            <span>${Number(count || 0)}</span>
        </div>
    `).join("");
}

/* -------------------- POST DATA -------------------- */

function normalizePost(post, index = 0) {
    return {
        ...post,
        id: post.id ?? post.post_id ?? `record-${index}`,
        text: post.text ?? post.content ?? post.message ?? "",
        category: post.category ?? post.classification ?? "Other",
        risk: post.risk ?? post.risk_level ?? post.priority ?? "Low",
        source: post.source ?? post.platform ?? "Unknown",
        confidence: post.confidence ?? post.score ?? null,
        identifiers: Array.isArray(post.identifiers)
            ? post.identifiers
            : [],
        status: post.status ?? post.review_status ?? "Pending",
        url: post.url ?? post.link ?? ""
    };
}

function riskClass(risk) {
    const value = String(risk).toLowerCase();

    if (value.includes("high")) return "high";
    if (value.includes("medium")) return "medium";

    return "low";
}

function renderPost(post) {
    const risk = riskClass(post.risk);

    const identifiers = post.identifiers
        .map(item => {
            if (typeof item === "string") return item;
            return item.value || item.identifier || item.id || "";
        })
        .filter(Boolean);

    const safeURL = (() => {
        try {
            const url = new URL(post.url);
            return ["http:", "https:"].includes(url.protocol)
                ? url.href
                : "";
        } catch {
            return "";
        }
    })();

    return `
        <article class="post">
            <div class="post-top">
                <span class="post-id">${escapeHTML(post.id)}</span>
                <span class="pill ${risk}">${escapeHTML(post.risk)}</span>
            </div>

            <p class="post-text">${escapeHTML(post.text)}</p>

            <div class="post-meta">
                <span>${escapeHTML(post.source)}</span>
                <span>${escapeHTML(post.category)}</span>
                ${post.confidence !== null
                    ? `<span>Score: ${escapeHTML(post.confidence)}</span>`
                    : ""}
            </div>

            ${identifiers.length
                ? `<div class="post-meta">
                    <strong>Identifiers:</strong>
                    ${identifiers.map(value =>
                        `<span class="pill">${escapeHTML(value)}</span>`
                    ).join(" ")}
                   </div>`
                : ""}

            ${safeURL
                ? `<a class="source-link"
                      href="${escapeHTML(safeURL)}"
                      target="_blank"
                      rel="noopener noreferrer">Open source ↗</a>`
                : ""}

            <div class="post-meta">
                <label for="review-${escapeHTML(post.id)}">Review:</label>
                <select class="review-select"
                        id="review-${escapeHTML(post.id)}"
                        data-id="${escapeHTML(post.id)}">
                    <option value="Pending" ${post.status === "Pending" ? "selected" : ""}>Pending</option>
                    <option value="Reviewed" ${post.status === "Reviewed" ? "selected" : ""}>Reviewed</option>
                    <option value="Escalated" ${post.status === "Escalated" ? "selected" : ""}>Escalated</option>
                    <option value="Dismissed" ${post.status === "Dismissed" ? "selected" : ""}>Dismissed</option>
                </select>
            </div>
        </article>
    `;
}

function renderPosts(posts, container) {
    if (!container) return;

    if (!posts.length) {
        container.innerHTML =
            '<div class="empty">No matching records found.</div>';
        return;
    }

    container.innerHTML = posts.map(renderPost).join("");

    $$(".review-select", container).forEach(select => {
        select.addEventListener("change", async () => {
            await updateReview(select.dataset.id, select.value);
        });
    });
}

function renderFeed() {
    const search = getElement("search");
    const category = getElement("category-filter");
    const risk = getElement("risk-filter");

    const query = (search?.value || "").toLowerCase().trim();
    const categoryValue = category?.value || "";
    const riskValue = risk?.value || "";

    state.filteredPosts = state.posts.filter(post => {
        const text = [
            post.text,
            post.id,
            post.source,
            post.category,
            ...post.identifiers.map(item =>
                typeof item === "string" ? item : item.value || ""
            )
        ].join(" ").toLowerCase();

        const matchesSearch = !query || text.includes(query);

        const matchesCategory =
            !categoryValue ||
            post.category.toLowerCase() === categoryValue.toLowerCase();

        const matchesRisk =
            !riskValue ||
            post.risk.toLowerCase() === riskValue.toLowerCase();

        return matchesSearch && matchesCategory && matchesRisk;
    });

    const feedContainer = getElement(
        "feed-list",
        "posts-list",
        "post-list",
        "intelligence-feed"
    );

    if (feedContainer) {
        renderPosts(state.filteredPosts, feedContainer);
    }

    const count = $(".count");
    if (count) {
        count.textContent = `${state.filteredPosts.length} records`;
    }
}

function renderRecent() {
    const container = getElement(
        "recent-list",
        "recent-posts",
        "recent-activity"
    );

    if (!container) return;

    renderPosts(state.posts.slice(0, 5), container);
}

/* -------------------- LOAD DATA -------------------- */

async function loadSummary() {
    try {
        const data = await apiRequest(API.summary);
        renderSummary(data);
    } catch (error) {
        console.error("Summary error:", error);
        showToast("Could not load dashboard summary.", "error");
    }
}

async function loadPosts() {
    try {
        const data = await apiRequest(API.posts);

        state.posts = getArray(data).map(normalizePost);

        if (!state.posts.length && data && typeof data === "object") {
            const alternate = data.data;
            if (Array.isArray(alternate)) {
                state.posts = alternate.map(normalizePost);
            }
        }

        renderFeed();
        renderRecent();

        // Recalculate visible counts if the summary API is unavailable.
        if (!Object.keys(state.summary).length) {
            const counts = { high: 0, medium: 0, low: 0 };

            state.posts.forEach(post => {
                counts[riskClass(post.risk)]++;
            });

            renderSummary({
                total_posts: state.posts.length,
                high_risk: counts.high,
                medium_risk: counts.medium,
                low_risk: counts.low
            });
        }
    } catch (error) {
        console.error("Posts error:", error);
        showToast("Could not load intelligence records.", "error");
    }
}

async function refresh() {
    await Promise.allSettled([
        loadSummary(),
        loadPosts()
    ]);
}

/* -------------------- SEARCH AND FILTERS -------------------- */

function initializeFilters() {
    ["search", "category-filter", "risk-filter"].forEach(id => {
        const element = getElement(id);

        if (element) {
            element.addEventListener("input", renderFeed);
            element.addEventListener("change", renderFeed);
        }
    });
}

/* -------------------- REVIEW MANAGEMENT -------------------- */

async function updateReview(id, status) {
    try {
        await apiRequest(
            `/api/posts/${encodeURIComponent(id)}/review`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ status })
            }
        );

        const post = state.posts.find(item => String(item.id) === String(id));

        if (post) post.status = status;

        showToast("Review status updated.");
        renderEvidence();
    } catch (error) {
        console.error("Review update error:", error);
        showToast("Could not update review status: " + error.message, "error");
        await loadPosts();
    }
}

/* -------------------- FILE UPLOAD -------------------- */


async function uploadFile(input) {
    if (!input?.files?.length) {
        showToast("Select a CSV or JSON file first.", "error");
        return;
    }

    const file = input.files[0];
    const formData = new FormData();
    formData.append("file", file);

    try {
        showToast("Importing dataset...");

        const result = await apiRequest(API.upload, {
            method: "POST",
            body: formData
        });

        console.log("Dataset upload response:", result);

        if (result.added === undefined || result.added === 0) {
            showToast(
                "No posts imported. Check the dataset and backend response.",
                "error"
            );
            console.error("Import returned no records:", result);
            return;
        }

        showToast(`${result.added} posts imported successfully.`);

        input.value = "";
        await refresh();

    } catch (error) {
        console.error("Upload error:", error);
        showToast("Import failed: " + error.message, "error");
    }
}


function initializeUploads() {
    ["upload-file", "upload-file-2"].forEach(id => {
        const input = getElement(id);

        if (input) {
            input.addEventListener("change", () => uploadFile(input));
        }
    });
}

/* -------------------- POST ANALYSIS -------------------- */

async function analysePost() {
    const input = getElement("analysis-text");
    const button = getElement("analyse-btn");
    const output = getElement("analysis-result");

    if (!input || !output) return;

    const text = input.value.trim();

    if (!text) {
        showToast("Enter some text to analyse.", "error");
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = "Analysing...";
    }

    output.classList.remove("hidden");
    output.innerHTML = '<p class="empty">Analysing submitted content...</p>';

    try {
        const result = await apiRequest(API.analyse, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ text })
        });

        output.innerHTML = `
            <div class="result-box">
                <h3>Analysis result</h3>

                <div class="signal">
                    <strong>Category:</strong>
                    ${escapeHTML(result.category || result.classification || "Unknown")}
                </div>

                <div class="signal">
                    <strong>Risk:</strong>
                    ${escapeHTML(result.risk || result.risk_level || "Unknown")}
                </div>

                <div class="signal">
                    <strong>Confidence:</strong>
                    ${escapeHTML(result.confidence ?? result.score ?? "N/A")}
                </div>

                <div class="signal">
                    <strong>Identifiers:</strong>
                    ${escapeHTML(
                        (result.identifiers || [])
                            .map(item => typeof item === "string"
                                ? item
                                : item.value || item.identifier || "")
                            .filter(Boolean)
                            .join(", ") || "None detected"
                    )}
                </div>

                <p>${escapeHTML(result.explanation || result.reason || result.message || "")}</p>
            </div>
        `;

        showToast("Analysis completed.");
    } catch (error) {
        console.error("Analysis error:", error);

        output.innerHTML = `
            <div class="result-box">
                <strong>Analysis failed</strong>
                <p>${escapeHTML(error.message)}</p>
            </div>
        `;

        showToast("Analysis failed.", "error");
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Analyse";
        }
    }
}

function initializeAnalysis() {
    const button = getElement("analyse-btn");

    if (button) {
        button.addEventListener("click", analysePost);
    }
}

/* -------------------- TELEGRAM COLLECTION -------------------- */

async function collectTelegram() {
    const channel = getElement("tg-channel");
    const button = getElement("tg-collect");

    if (!channel || !channel.value.trim()) {
        showToast("Enter a public Telegram channel first.", "error");
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = "Collecting...";
    }

    try {
        const result = await apiRequest(API.telegram, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                channel: channel.value.trim()
            })
        });

        showToast(
            result.message ||
            result.detail ||
            "Collection request completed."
        );

        await refresh();
    } catch (error) {
        console.error("Telegram collection error:", error);
        showToast("Collection failed: " + error.message, "error");
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Collect";
        }
    }
}

function initializeTelegram() {
    const button = getElement("tg-collect");

    if (button) {
        button.addEventListener("click", collectTelegram);
    }
}

/* -------------------- LINK ANALYSIS GRAPH -------------------- */

async function loadGraph() {
    try {
        const data = await apiRequest(API.graph);
        state.graph = data;
        renderGraph(data);
    } catch (error) {
        console.error("Graph error:", error);

        const container = getElement("graph");
        if (container) {
            container.innerHTML =
                '<div class="empty">Unable to load relationship graph.</div>';
        }
    }
}

function renderGraph(data = {}) {
    const container = getElement("graph");
    if (!container) return;

    const nodes = data.nodes || data.vertices || [];
    const edges = data.edges || data.links || [];

    if (!Array.isArray(nodes) || !nodes.length) {
        container.innerHTML =
            '<div class="empty">No linked identifiers available yet.</div>';
        return;
    }

    const width = Math.max(container.clientWidth || 600, 320);
    const height = 350;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width * 0.34, 145);

    const positions = nodes.map((node, index) => {
        const angle = (Math.PI * 2 * index / nodes.length) - Math.PI / 2;

        return {
            ...node,
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius
        };
    });

    const findNode = id =>
        positions.find(node => String(node.id) === String(id));

    const edgeMarkup = edges.map(edge => {
        const source = findNode(edge.source ?? edge.from);
        const target = findNode(edge.target ?? edge.to);

        if (!source || !target) return "";

        return `
            <line x1="${source.x}" y1="${source.y}"
                  x2="${target.x}" y2="${target.y}"
                  stroke="#64746a" stroke-width="1.5"
                  opacity=".65"/>
        `;
    }).join("");

    const nodeMarkup = positions.map(node => `
        <g>
            <circle cx="${node.x}" cy="${node.y}" r="7"
                    fill="#D4A85E" stroke="#f0d4a4"
                    stroke-width="1.5"/>
            <text x="${node.x}" y="${node.y + 22}"
                  fill="#e8e9df" font-size="10"
                  text-anchor="middle">
                ${escapeHTML(node.label || node.name || node.id || "Node")}
            </text>
        </g>
    `).join("");

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}"
             width="100%" height="${height}"
             role="img" aria-label="Identifier relationship graph">
            ${edgeMarkup}
            ${nodeMarkup}
        </svg>
    `;

    const legend = getElement("graph-legend");

    if (legend) {
        legend.textContent =
            `${nodes.length} nodes · ${edges.length} connections`;
    }
}

/* -------------------- EVIDENCE -------------------- */

function renderEvidence() {
    const container = getElement("evidence-list");
    if (!container) return;

    const reviewed = state.posts.filter(post =>
        post.status && post.status !== "Pending"
    );

    if (!reviewed.length) {
        container.innerHTML =
            '<div class="empty">No reviewed records yet.</div>';
        return;
    }

    container.innerHTML = reviewed.map(post => `
        <div class="evidence-row">
            <div>
                <strong>${escapeHTML(post.id)}</strong>
                <p>${escapeHTML(post.text)}</p>
            </div>
            <span class="pill">${escapeHTML(post.status)}</span>
        </div>
    `).join("");
}

/* -------------------- EXPORT -------------------- */

async function exportEvidence() {
    try {
        const result = await apiRequest(API.export);

        // If the API returns a download URL, use it.
        if (result.url || result.download_url) {
            window.open(result.url || result.download_url, "_blank");
            return;
        }

        // Otherwise export the returned JSON.
        const blob = new Blob(
            [JSON.stringify(result, null, 2)],
            { type: "application/json" }
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `tracepoint-evidence-${new Date()
            .toISOString()
            .slice(0, 10)}.json`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

        showToast("Evidence export prepared.");
    } catch (error) {
        console.error("Export error:", error);
        showToast("Export failed: " + error.message, "error");
    }
}

function initializeExport() {
    const button = getElement("export-btn");

    if (button) {
        button.addEventListener("click", exportEvidence);
    }
}

/* -------------------- APPLICATION START -------------------- */

async function initializeApp() {
    console.log("TRACEPOINT AI initializing...");

    initializeNavigation();
    initializeFilters();
    initializeUploads();
    initializeAnalysis();
    initializeTelegram();
    initializeExport();

    try {
        await apiRequest(API.health);
        console.log("Backend connection successful.");
    } catch (error) {
        console.error("Backend health check failed:", error);
        showToast("Backend connection problem. Check the server.", "error");
    }

    await refresh();

    console.log("TRACEPOINT AI ready.");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeApp);
} else {
    initializeApp();
}
