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


    const response = await fetch(url, opts);


    let data = {};

    try {
        data = await response.json();
    } catch (e) {}


    if (!response.ok) {

        const error = new Error(
            data.error || "Request failed"
        );

        error.status = response.status;

        throw error;
    }


    return data;
}



/* =====================================================
   NEON RGB THEME LAYER
   Visual-only enhancement: keeps existing APIs,
   commands, links and data flow unchanged.
===================================================== */
(function initNeonTheme(){
    const style = document.createElement('style');
    style.id = 'saksham-neon-theme';
    style.textContent = `
      :root{
        --neon-cyan:#00f6ff; --neon-pink:#ff2bd6; --neon-purple:#8b5cff;
        --neon-blue:#3d7cff; --neon-green:#39ff88; --neon-yellow:#ffe66d;
        --bg:#070713; --panel:rgba(13,12,31,.78); --line:rgba(255,255,255,.10);
      }
      body{background:radial-gradient(circle at 15% 10%,rgba(0,246,255,.12),transparent 28%),radial-gradient(circle at 85% 15%,rgba(255,43,214,.13),transparent 30%),radial-gradient(circle at 50% 100%,rgba(139,92,255,.12),transparent 35%),var(--bg)!important;background-attachment:fixed!important;}
      body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.18;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:32px 32px;mask-image:linear-gradient(to bottom,#000,transparent);}
      .glass,.content-box{background:linear-gradient(145deg,rgba(20,18,46,.88),rgba(8,9,23,.76))!important;border:1px solid var(--line)!important;box-shadow:0 0 0 1px rgba(0,246,255,.035),0 18px 55px rgba(0,0,0,.35),0 0 35px rgba(139,92,255,.08)!important;backdrop-filter:blur(18px);}
      h1,h2,h3{background:linear-gradient(90deg,var(--neon-cyan),var(--neon-purple),var(--neon-pink),var(--neon-cyan));background-size:300% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:rgbShift 7s linear infinite;text-shadow:0 0 22px rgba(0,246,255,.14);}
      .eyebrow{letter-spacing:.22em!important;color:var(--neon-cyan)!important;text-shadow:0 0 12px rgba(0,246,255,.55);}
      button,.buy{border:1px solid rgba(0,246,255,.35)!important;background:linear-gradient(100deg,rgba(0,246,255,.16),rgba(139,92,255,.18),rgba(255,43,214,.16))!important;box-shadow:0 0 18px rgba(0,246,255,.10),inset 0 0 18px rgba(255,255,255,.025);transition:.22s ease!important;}
      button:hover,.buy:hover{transform:translateY(-2px);box-shadow:0 0 26px rgba(0,246,255,.24),0 0 45px rgba(255,43,214,.10)!important;border-color:rgba(0,246,255,.72)!important;}
      .nav.active{color:var(--neon-cyan)!important;text-shadow:0 0 14px rgba(0,246,255,.7);}
      input,select,textarea{background:rgba(4,5,17,.72)!important;border-color:rgba(0,246,255,.16)!important;box-shadow:inset 0 0 20px rgba(0,0,0,.2)!important;}
      input:focus,select:focus,textarea:focus{border-color:rgba(0,246,255,.65)!important;box-shadow:0 0 0 3px rgba(0,246,255,.08),0 0 22px rgba(0,246,255,.12)!important;}
      .item{background:linear-gradient(145deg,rgba(24,21,54,.88),rgba(9,10,27,.72))!important;border:1px solid rgba(139,92,255,.18)!important;transition:.22s ease;}
      .item:hover{transform:translateY(-4px);border-color:rgba(255,43,214,.42)!important;box-shadow:0 15px 35px rgba(0,0,0,.25),0 0 28px rgba(255,43,214,.10)!important;}
      .price{color:var(--neon-yellow)!important;text-shadow:0 0 12px rgba(255,230,109,.3);}
      @keyframes rgbShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
      @media(prefers-reduced-motion:reduce){h1,h2,h3{animation:none}.item,button,.buy{transition:none!important}}
    `;
    document.head.appendChild(style);
})();

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
