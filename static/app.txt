"use strict";

const tg = window.Telegram?.WebApp;

if (tg) {
    try {
        tg.ready();
        tg.expand();
    } catch (e) {}
}


let mode = "login";
let current = null;
let loggingOut = false;


const $ = (id) => document.getElementById(id);


function toast(message) {

    const el = $("toast");

    if (!el) return;

    el.textContent = message;

    el.classList.add("show");

    clearTimeout(window.__toastTimer);

    window.__toastTimer = setTimeout(() => {
        el.classList.remove("show");
    }, 2600);
}


async function api(url, options = {}) {

    const opts = {
        credentials: "same-origin",
        cache: "no-store",
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    };


    let response;

    try {
        response = await fetch(url, opts);
    } catch (networkError) {
        const error = new Error(
            `Network error: ${networkError.message || "Unable to reach panel server."}`
        );
        error.status = 0;
        throw error;
    }

    let data = {};
    let rawText = "";

    try {
        rawText = await response.text();
        data = rawText ? JSON.parse(rawText) : {};
    } catch (e) {
        data = {};
    }

    if (!response.ok) {
        const detail =
            data.error ||
            data.message ||
            (rawText && rawText.trim().slice(0, 180)) ||
            `HTTP ${response.status}`;

        const error = new Error(detail);
        error.status = response.status;
        error.response = data;
        throw error;
    }

    return data;
}


/* =====================================================
   TELEGRAM IDENTITY
===================================================== */

function telegramIdentity() {

    if (!tg?.initDataUnsafe?.user) {
        return {};
    }


    const user = tg.initDataUnsafe.user;


    return {
        telegram_id: String(user.id || ""),

        telegram_username:
            user.username
                ? "@" + user.username
                : ""
    };
}


/* =====================================================
   AUTH MODE
===================================================== */

function setMode(next) {

    mode = next;


    document
        .querySelectorAll(".tab")
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.auth === next
            );

        });


    const buttonText = $("authButtonText");

    if (buttonText) {

        buttonText.textContent =
            next === "login"
                ? "LOGIN"
                : "CREATE ACCOUNT";
    }


    const telegramFields =
        $("telegramFields");


    if (telegramFields) {

        telegramFields.classList.toggle(
            "hidden",
            next !== "register"
        );
    }


    const password =
        $("password");


    if (password) {

        password.autocomplete =
            next === "login"
                ? "current-password"
                : "new-password";
    }
}


/* =====================================================
   AUTH TABS
===================================================== */

document
    .querySelectorAll(".tab")
    .forEach(button => {

        button.addEventListener(
            "click",
            () => setMode(button.dataset.auth)
        );

    });


/* =====================================================
   LOGIN / REGISTER
===================================================== */

$("authForm").addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        const username =
            $("username").value.trim();

        const password =
            $("password").value;


        if (!username || !password) {

            toast(
                "Enter username and password."
            );

            return;
        }


        const body = {
            username,
            password,
            ...telegramIdentity()
        };


        if (mode === "register") {

            body.telegram_username =
                $("telegramUsername")
                    ?.value
                    .trim() ||
                body.telegram_username ||
                "";


            body.telegram_id =
                $("telegramId")
                    ?.value
                    .trim() ||
                body.telegram_id ||
                "";
        }


        const endpoint =
            mode === "login"
                ? "/api/login"
                : "/api/register";


        try {

            const data = await api(
                endpoint,
                {
                    method: "POST",
                    body: JSON.stringify(body)
                }
            );


            current = data.user;


            showPanel();


            toast(
                mode === "login"
                    ? "Welcome back!"
                    : "Account created successfully!"
            );

        } catch (error) {

            toast(
                error.message ||
                "Something went wrong."
            );
        }

    }
);


/* =====================================================
   LOGOUT
===================================================== */

$("logoutBtn").addEventListener(
    "click",
    async () => {

        if (loggingOut) {
            return;
        }


        loggingOut = true;


        const button = $("logoutBtn");

        if (button) {
            button.disabled = true;
        }


        try {

            await api(
                "/api/logout",
                {
                    method: "POST"
                }
            );

        } catch (error) {

            /*
             * Even if the API fails, clear the
             * frontend and send the browser to
             * the guaranteed /logout fallback.
             */

            window.location.replace(
                "/logout"
            );

            return;
        }


        current = null;


        $("panelView")
            .classList.add("hidden");


        $("authView")
            .classList.remove("hidden");


        $("authForm")
            .reset();


        setMode("login");


        window.scrollTo({
            top: 0,
            behavior: "instant"
        });


        toast(
            "Logged out successfully."
        );


        loggingOut = false;


        if (button) {
            button.disabled = false;
        }
    }
);


/* =====================================================
   AUTH BOOT
===================================================== */

async function bootAuth() {

    /*
     * IMPORTANT:
     *
     * Never create a Guest user.
     * Never show dashboard automatically
     * unless the server confirms a session.
     */

    try {

        const data =
            await api("/api/me");


        if (
            !data.ok ||
            !data.user
        ) {
            throw new Error(
                "No active session"
            );
        }


        current = data.user;

        showPanel();

    } catch (error) {

        current = null;

        showLogin();

        if (error?.status && error.status !== 401) {
            toast(error.message || `Panel error (HTTP ${error.status})`);
        }
    }
}


/* =====================================================
   SHOW LOGIN
===================================================== */

function showLogin() {

    $("panelView")
        .classList.add("hidden");


    $("authView")
        .classList.remove("hidden");


    setMode("login");


    window.scrollTo({
        top: 0,
        behavior: "instant"
    });
}


/* =====================================================
   USER STATUS
===================================================== */

function statusText(user) {

    if (user.elite) {
        return "ELITE";
    }

    if (user.vip) {
        return "VIP";
    }

    return "MEMBER";
}


/* =====================================================
   HEADER UPDATE
===================================================== */

function updateHeader() {

    if (!current) {
        return;
    }


    $("displayUsername").textContent =
        "@" + current.username;


    $("welcome").textContent =
        "Welcome, @" + current.username;


    $("telegramLabel").textContent =
        current.telegram_username ||
        "Telegram not linked";


    $("coins").textContent =
        Number(current.coins)
            .toLocaleString();


    $("level").textContent =
        current.level;


    const status =
        statusText(current);


    $("vip").textContent =
        status;


    $("statusPill").textContent =
        status;
}


/* =====================================================
   REFRESH USER
===================================================== */

async function refreshUser() {

    const data =
        await api("/api/me");


    current = data.user;


    updateHeader();


    try {

        const stats =
            await api("/api/stats");


        $("rank").textContent =
            "#" + stats.rank;

    } catch (error) {

        $("rank").textContent =
            "—";
    }
}


/* =====================================================
   SHOW PANEL
===================================================== */

function showPanel() {

    if (!current) {

        showLogin();

        return;
    }


    $("authView")
        .classList.add("hidden");


    $("panelView")
        .classList.remove("hidden");


    updateHeader();

    if (current.wallet_warning) {
        toast(`Wallet: ${current.wallet_warning}`);
    }

    refreshUser()
        .catch(() => {

            current = null;

            showLogin();
        });


    renderPage("home");
}


/* =====================================================
   PAGE RENDER
===================================================== */

async function renderPage(page) {

    if (!current) {

        showLogin();

        return;
    }


    document
        .querySelectorAll(".nav")
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.page === page
            );

        });


    const area =
        $("contentArea");


    if (!area) {
        return;
    }


    if (page === "home") {

        area.innerHTML = "";

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

        return;
    }


    if (page === "shop") {

        area.innerHTML = `
            <div class="content-box glass">
                <p class="eyebrow">STORE</p>

                <h3>🛒 Shop</h3>

                <p>
                    Use your coins directly
                    from the panel.
                </p>

                <div
                    id="shopGrid"
                    class="shop-grid"
                >
                    Loading...
                </div>
            </div>
        `;


        try {

            const data =
                await api("/api/shop");


            $("shopGrid").innerHTML =
                data.items.length

                    ? data.items.map(item => `

                        <div class="item">

                            <h4>
                                ${escapeHtml(item.name)}
                            </h4>

                            <p>
                                ${escapeHtml(item.description)}
                            </p>

                            <div class="price">
                                🪙
                                ${Number(item.price).toLocaleString()}
                            </div>

                            <button
                                class="buy"
                                onclick="buyItem(${item.id})"
                            >
                                BUY NOW
                            </button>

                        </div>

                    `).join("")

                    : "<p>Shop is empty.</p>";

        } catch (error) {

            $("shopGrid").innerHTML =
                `<p>${escapeHtml(error.message)}</p>`;
        }

    }


    if (page === "rewards") {

        area.innerHTML = `
            <div class="content-box glass">

                <p class="eyebrow">
                    REWARDS
                </p>

                <h3>
                    🎁 Daily Reward
                </h3>

                <p>
                    Reward system will be
                    connected with the bot
                    database.
                </p>

                <button
                    class="buy"
                    onclick="toast('Reward connection is being prepared.')"
                >
                    CLAIM REWARD
                </button>

            </div>
        `;
    }


    if (page === "missions") {

        area.innerHTML = `
            <div class="content-box glass">

                <p class="eyebrow">
                    MISSIONS
                </p>

                <h3>
                    🎯 Missions
                </h3>

                <p>
                    Your mission and XP
                    system will be connected
                    with the bot.
                </p>

                <button
                    class="buy"
                    onclick="toast('Mission connection is being prepared.')"
                >
                    VIEW MISSIONS
                </button>

            </div>
        `;
    }


    if (page === "referral") {

        const referral =
            "SAK-" + current.id;


        area.innerHTML = `
            <div class="content-box glass">

                <p class="eyebrow">
                    COMMUNITY
                </p>

                <h3>
                    👥 Referral
                </h3>

                <p>
                    Your panel referral code:
                </p>

                <div class="item">

                    <strong>
                        ${escapeHtml(referral)}
                    </strong>

                    <br>

                    <button
                        class="buy"
                        onclick="copyText('${escapeHtml(referral)}')"
                    >
                        COPY CODE
                    </button>

                </div>

            </div>
        `;
    }


    if (page === "stats") {

        area.innerHTML = `
            <div class="content-box glass">

                <p class="eyebrow">
                    ACCOUNT
                </p>

                <h3>
                    📊 Activity
                </h3>

                <div id="activityList">
                    Loading...
                </div>

            </div>
        `;


        try {

            const data =
                await api("/api/activity");


            if (!data.activity.length) {

                $("activityList").innerHTML =
                    "<p>No activity yet.</p>";

            } else {

                $("activityList").innerHTML =
                    data.activity.map(item => `

                        <div class="activity">

                            ${escapeHtml(item.text)}

                            <time>
                                ${escapeHtml(item.created_at)}
                                UTC
                            </time>

                        </div>

                    `).join("");
            }

        } catch (error) {

            $("activityList").innerHTML =
                `<p>${escapeHtml(error.message)}</p>`;
        }
    }


    if (page === "settings") {

        area.innerHTML = `
            <div class="content-box glass">

                <p class="eyebrow">
                    SECURITY
                </p>

                <h3>
                    ⚙️ Settings
                </h3>

                <div class="settings-form">

                    <label>
                        Current password
                    </label>

                    <input
                        id="oldPass"
                        type="password"
                    >

                    <label>
                        New password
                    </label>

                    <input
                        id="newPass"
                        type="password"
                    >

                    <button
                        class="buy"
                        onclick="changePassword()"
                    >
                        CHANGE PASSWORD
                    </button>

                </div>

            </div>
        `;
    }


    window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "smooth"
    });
}


/* =====================================================
   BUY
===================================================== */

async function buyItem(id) {

    try {

        const data =
            await api(
                "/api/shop/buy",
                {
                    method: "POST",
                    body: JSON.stringify({
                        item_id: id
                    })
                }
            );


        current = data.user;


        updateHeader();


        await refreshUser();


        toast(data.message);


        renderPage("shop");

    } catch (error) {

        toast(error.message);
    }
}


/* =====================================================
   CHANGE PASSWORD
===================================================== */

async function changePassword() {

    const oldPassword =
        $("oldPass").value;

    const newPassword =
        $("newPass").value;


    try {

        const data =
            await api(
                "/api/settings/password",
                {
                    method: "POST",

                    body: JSON.stringify({
                        old_password:
                            oldPassword,

                        new_password:
                            newPassword
                    })
                }
            );


        toast(data.message);


        $("oldPass").value = "";
        $("newPass").value = "";

    } catch (error) {

        toast(error.message);
    }
}


/* =====================================================
   COPY
===================================================== */

function copyText(text) {

    if (
        navigator.clipboard &&
        navigator.clipboard.writeText
    ) {

        navigator.clipboard
            .writeText(text)
            .then(() => {
                toast("Copied!");
            })
            .catch(() => {
                toast(text);
            });

    } else {

        toast(text);
    }
}


/* =====================================================
   HTML ESCAPE
===================================================== */

function escapeHtml(value) {

    return String(value)
        .replace(
            /[&<>"']/g,
            character => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            })[character]
        );
}


/* =====================================================
   PAGE BUTTONS
===================================================== */

document
    .querySelectorAll("[data-page]")
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                renderPage(
                    button.dataset.page
                );

            }
        );

    });


/* =====================================================
   START
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        setMode("login");

        bootAuth();

    }
);
