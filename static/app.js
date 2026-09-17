/* SAKSHAM PANEL - COMPLETE APP.JS */
"use strict";

let currentUser = null;
let currentData = null;

function $(id) { return document.getElementById(id); }

function escapeHTML(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function formatNumber(number) {
    return Number(number || 0).toLocaleString("en-IN");
}

function showMessage(message, type = "info") {
    const colors = { success: "#00ff9d", error: "#ff4f81", info: "#00c8ff" };
    const box = document.createElement("div");
    const color = colors[type] || colors.info;
    Object.assign(box.style, {
        position: "fixed", left: "50%", bottom: "25px",
        transform: "translateX(-50%)", zIndex: "99999",
        padding: "13px 20px", borderRadius: "13px",
        background: "#11111a", border: `1px solid ${color}`,
        color: "#fff", boxShadow: `0 0 25px ${color}33`,
        fontSize: "13px", maxWidth: "90%", textAlign: "center",
        transition: ".3s"
    });
    box.textContent = message;
    document.body.appendChild(box);
    setTimeout(() => {
        box.style.opacity = "0";
        setTimeout(() => box.remove(), 300);
    }, 2800);
}

async function api(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    let data = {};
    try { data = await response.json(); } catch { data = {}; }

    if (!response.ok) {
        throw new Error(data.message || data.error || `Request failed (${response.status})`);
    }
    return data;
}

async function loadDashboard() {
    try {
        const data = await api("/api/me");
        currentData = data;
        currentUser = data.user || data;
        updateDashboard(currentUser);
    } catch (error) {
        console.error(error);
        if ($("username")) $("username").textContent = "Guest";
        if ($("telegramUsername")) $("telegramUsername").textContent = "@telegram";
        showMessage("Dashboard data load nahi ho paya.", "error");
    }
}

function updateDashboard(user) {
    if (!user) return;

    const username = user.username || user.name || "Member";
    const telegramUsername = user.telegram_username ||
        user.telegramUsername || user.telegram || "@telegram";
    const coins = user.coins ?? user.balance ?? 0;
    const xp = user.xp ?? 0;
    const level = user.level ?? 1;
    const rank = user.rank ?? user.position ?? 0;

    let membership = user.membership || user.vip_status || user.plan || "FREE MEMBER";
    if (user.elite === true || user.is_elite === true) membership = "ELITE MEMBER";
    else if (user.vip === true || user.is_vip === true) membership = "VIP MEMBER";

    if ($("username")) $("username").textContent = username;
    if ($("telegramUsername")) {
        $("telegramUsername").textContent = telegramUsername.startsWith("@")
            ? telegramUsername : "@" + telegramUsername;
    }
    if ($("avatar")) $("avatar").textContent = username.trim().charAt(0).toUpperCase() || "S";
    if ($("coins")) $("coins").textContent = formatNumber(coins);
    if ($("xp")) $("xp").textContent = formatNumber(xp);
    if ($("rank")) $("rank").textContent = rank > 0 ? "#" + formatNumber(rank) : "#—";
    if ($("level")) $("level").textContent = formatNumber(level);
    if ($("membership")) $("membership").textContent = String(membership).toUpperCase();
}

async function refreshDashboard() {
    try {
        const data = await api("/api/me");
        currentData = data;
        currentUser = data.user || data;
        updateDashboard(currentUser);
    } catch (error) { console.error(error); }
}

function openModal(title, content) {
    const modal = $("modal");
    if (!modal || !$("modalTitle") || !$("modalContent")) return;
    $("modalTitle").textContent = title;
    $("modalContent").innerHTML = content;
    modal.classList.add("show");
}

function closeModal() {
    if ($("modal")) $("modal").classList.remove("show");
}

document.addEventListener("click", event => {
    if ($("modal") && event.target === $("modal")) closeModal();
});
document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeModal();
});

function openShop() {
    if ($("shopSection")) $("shopSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function buyItem(item) {
    const names = { vip: "VIP", elite: "ELITE", badge: "Premium Badge" };
    const name = names[item] || item;
    if (!confirm(`Kya aap ${name} purchase karna chahte ho?`)) return;

    try {
        const data = await api("/api/shop/buy", {
            method: "POST",
            body: JSON.stringify({ item })
        });
        showMessage(data.message || `${name} successfully purchased!`, "success");
        await refreshDashboard();
        addActivity("🛒", `${name} purchased`, "Purchase successful");
    } catch (error) {
        showMessage(error.message || "Purchase failed.", "error");
    }
}

async function showRank() {
    try {
        const data = await api("/api/rank");
        const rank = data.rank ?? currentUser?.rank ?? 0;
        const xp = data.xp ?? currentUser?.xp ?? 0;
        const level = data.level ?? currentUser?.level ?? 1;

        openModal("🏆 Your Rank", `
            <div style="text-align:center;padding:15px 5px;">
                <div style="font-size:55px;margin-bottom:10px;">🏆</div>
                <h1 style="font-size:34px;margin-bottom:8px;">#${escapeHTML(formatNumber(rank))}</h1>
                <p style="color:#9999aa;margin-bottom:18px;">Current leaderboard position</p>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div style="padding:15px;border-radius:14px;background:rgba(255,255,255,.04);">
                        <small style="color:#9999aa;">LEVEL</small>
                        <h3>${escapeHTML(formatNumber(level))}</h3>
                    </div>
                    <div style="padding:15px;border-radius:14px;background:rgba(255,255,255,.04);">
                        <small style="color:#9999aa;">XP</small>
                        <h3>${escapeHTML(formatNumber(xp))}</h3>
                    </div>
                </div>
            </div>
        `);
    } catch {
        openModal("🏆 Your Rank", `
            <div style="text-align:center;padding:15px;">
                <div style="font-size:50px;">🏆</div>
                <h1>#${escapeHTML(formatNumber(currentUser?.rank || 0))}</h1>
                <p style="color:#9999aa;">Level ${escapeHTML(formatNumber(currentUser?.level || 1))}
                • ${escapeHTML(formatNumber(currentUser?.xp || 0))} XP</p>
            </div>
        `);
    }
}

async function showRewards() {
    try {
        const data = await api("/api/rewards");
        const rewards = data.rewards || data.items || [];

        if (!Array.isArray(rewards) || !rewards.length) {
            openModal("🎁 Rewards", `
                <div style="text-align:center;padding:25px 5px;">
                    <div style="font-size:45px;">🎁</div>
                    <h3>No rewards available</h3>
                    <p style="color:#9999aa;margin-top:8px;">Complete missions to unlock rewards.</p>
                </div>
            `);
            return;
        }

        let html = "";
        rewards.forEach((reward, index) => {
            const title = reward.name || reward.title || `Reward ${index + 1}`;
            const description = reward.description || reward.desc || "Available reward";
            const id = String(reward.id ?? index).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

            html += `
                <div style="padding:15px;margin-bottom:10px;border-radius:14px;
                    background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);">
                    <h3>🎁 ${escapeHTML(title)}</h3>
                    <p style="color:#9999aa;font-size:12px;margin:7px 0 12px;">
                        ${escapeHTML(description)}
                    </p>
                    ${reward.claimed
                        ? `<span style="color:#00ff9d;font-size:11px;">✓ CLAIMED</span>`
                        : `<button onclick="claimReward('${escapeHTML(id)}')"
                            style="border:0;border-radius:9px;padding:9px 14px;cursor:pointer;
                            font-weight:700;background:#00ff9d;color:#050509;">CLAIM</button>`}
                </div>`;
        });
        openModal("🎁 Rewards", html);
    } catch {
        openModal("🎁 Rewards", `
            <div style="text-align:center;padding:20px;">
                <div style="font-size:45px;">🎁</div>
                <h3>Rewards</h3>
                <p style="color:#9999aa;margin-top:8px;">Reward system is ready.</p>
            </div>
        `);
    }
}

async function claimReward(id) {
    try {
        const data = await api("/api/rewards/claim", {
            method: "POST",
            body: JSON.stringify({ reward_id: id })
        });
        showMessage(data.message || "Reward claimed successfully!", "success");
        closeModal();
        await refreshDashboard();
    } catch (error) {
        showMessage(error.message || "Reward claim failed.", "error");
    }
}

async function showReferral() {
    try {
        const data = await api("/api/referral");
        const code = data.code || data.referral_code || currentUser?.referral_code || "NOT-AVAILABLE";
        const count = data.referrals ?? data.count ?? 0;
        const safeCode = String(code).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

        openModal("👥 Referral", `
            <div style="text-align:center;padding:10px 0;">
                <div style="font-size:48px;margin-bottom:10px;">👥</div>
                <p style="color:#9999aa;font-size:12px;">Your referral code</p>
                <div style="margin:12px 0;padding:15px;border-radius:12px;
                    background:rgba(0,255,157,.06);border:1px solid rgba(0,255,157,.2);
                    font-size:20px;font-weight:800;letter-spacing:2px;">
                    ${escapeHTML(code)}
                </div>
                <button onclick="copyReferral('${escapeHTML(safeCode)}')"
                    style="width:100%;border:0;border-radius:11px;padding:12px;cursor:pointer;
                    background:linear-gradient(90deg,#00ff9d,#00c8ff);color:#050509;font-weight:800;">
                    📋 COPY CODE
                </button>
                <p style="color:#9999aa;margin-top:15px;font-size:12px;">
                    Referrals: ${escapeHTML(formatNumber(count))}
                </p>
            </div>
        `);
    } catch {
        const code = currentUser?.referral_code || "NOT-AVAILABLE";
        const safeCode = String(code).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        openModal("👥 Referral", `
            <div style="text-align:center;padding:15px;">
                <div style="font-size:45px;">👥</div>
                <p style="color:#9999aa;margin:10px 0;">Your referral code</p>
                <div style="padding:14px;background:rgba(255,255,255,.04);
                    border-radius:12px;font-weight:800;letter-spacing:2px;">
                    ${escapeHTML(code)}
                </div>
                <button onclick="copyReferral('${escapeHTML(safeCode)}')"
                    style="margin-top:12px;width:100%;padding:11px;border:0;border-radius:10px;
                    cursor:pointer;background:#00ff9d;font-weight:800;">📋 COPY</button>
            </div>
        `);
    }
}

async function copyReferral(code) {
    try {
        await navigator.clipboard.writeText(code);
        showMessage("Referral code copied!", "success");
    } catch {
        showMessage("Copy nahi ho paya.", "error");
    }
}

function changePassword() {
    openModal("🔐 Change Password", `
        <form onsubmit="submitPasswordChange(event)">
            <label style="display:block;color:#9999aa;font-size:11px;margin-bottom:6px;">CURRENT PASSWORD</label>
            <input id="oldPassword" type="password" required autocomplete="current-password"
                style="width:100%;padding:13px;margin-bottom:13px;border-radius:11px;
                border:1px solid rgba(255,255,255,.1);background:#08080e;color:white;outline:none;">

            <label style="display:block;color:#9999aa;font-size:11px;margin-bottom:6px;">NEW PASSWORD</label>
            <input id="newPassword" type="password" required minlength="6" autocomplete="new-password"
                style="width:100%;padding:13px;margin-bottom:13px;border-radius:11px;
                border:1px solid rgba(255,255,255,.1);background:#08080e;color:white;outline:none;">

            <label style="display:block;color:#9999aa;font-size:11px;margin-bottom:6px;">CONFIRM PASSWORD</label>
            <input id="confirmPassword" type="password" required minlength="6" autocomplete="new-password"
                style="width:100%;padding:13px;margin-bottom:17px;border-radius:11px;
                border:1px solid rgba(255,255,255,.1);background:#08080e;color:white;outline:none;">

            <button type="submit"
                style="width:100%;padding:13px;border:0;border-radius:11px;
                background:linear-gradient(90deg,#00ff9d,#00c8ff);color:#050509;
                font-weight:800;cursor:pointer;">UPDATE PASSWORD</button>
        </form>
    `);
}

async function submitPasswordChange(event) {
    event.preventDefault();

    const oldPassword = $("oldPassword")?.value || "";
    const newPassword = $("newPassword")?.value || "";
    const confirmPassword = $("confirmPassword")?.value || "";

    if (newPassword !== confirmPassword) {
        showMessage("New passwords match nahi kar rahe.", "error");
        return;
    }
    if (newPassword.length < 6) {
        showMessage("Password minimum 6 characters ka hona chahiye.", "error");
        return;
    }

    try {
        const data = await api("/api/change-password", {
            method: "POST",
            body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
        });
        showMessage(data.message || "Password updated successfully!", "success");
        closeModal();
    } catch (error) {
        showMessage(error.message || "Password update failed.", "error");
    }
}

function addActivity(icon, title, description) {
    const list = $("activityList");
    if (!list) return;

    const item = document.createElement("div");
    item.className = "activity-item";
    item.innerHTML = `
        <span>${escapeHTML(icon)}</span>
        <div><b>${escapeHTML(title)}</b><small>${escapeHTML(description)}</small></div>
    `;
    list.prepend(item);

    while (list.children.length > 8) list.lastElementChild.remove();
}

function initTelegram() {
    if (typeof window.Telegram === "undefined" || !window.Telegram.WebApp) return;

    const tg = window.Telegram.WebApp;

    try {
        tg.ready();
        tg.expand();

        if (typeof tg.enableClosingConfirmation === "function") {
            tg.enableClosingConfirmation();
        }

        const telegramUser = tg.initDataUnsafe?.user;

        if (telegramUser) {
            const name = telegramUser.username || telegramUser.first_name || "Member";

            if ($("username") && $("username").textContent === "Loading...") {
                $("username").textContent = name;
            }
            if ($("telegramUsername")) {
                $("telegramUsername").textContent =
                    telegramUser.username ? "@" + telegramUser.username : "Telegram User";
            }
            if ($("avatar")) {
                $("avatar").textContent =
                    (telegramUser.first_name || name || "S").charAt(0).toUpperCase();
            }
        }
    } catch (error) {
        console.warn("Telegram WebApp initialization failed:", error);
    }
}

async function logout() {
    if (!confirm("Kya aap logout karna chahte ho?")) return;

    try {
        await api("/logout", {
            method: "POST",
            body: JSON.stringify({})
        });
    } catch (error) {
        console.warn("Logout request:", error.message);
    } finally {
        window.location.href = "/login";
    }
}

async function loadActivity() {
    try {
        const data = await api("/api/activity");
        const activities = data.activities || data.items || [];
        const list = $("activityList");

        if (!list || !Array.isArray(activities) || !activities.length) return;

        list.innerHTML = "";
        activities.slice(0, 8).forEach(activity => {
            addActivity(
                activity.icon || "📌",
                activity.title || activity.action || "Activity",
                activity.description || activity.time || "Recent activity"
            );
        });
    } catch {
        console.log("Activity API unavailable.");
    }
}

async function loadShop() {
    try {
        const data = await api("/api/shop");
        const items = data.items || data.shop || [];

        if (!Array.isArray(items)) return;

        items.forEach(item => {
            const id = String(item.id || "").toLowerCase();
            const price = item.price ?? 0;

            if (id === "vip" && $("vipPrice")) $("vipPrice").textContent = formatNumber(price);
            if (id === "elite" && $("elitePrice")) $("elitePrice").textContent = formatNumber(price);
            if ((id === "badge" || id === "premium_badge") && $("badgePrice")) {
                $("badgePrice").textContent = formatNumber(price);
            }
        });
    } catch {
        console.log("Using default shop prices.");
    }
}

function startAutoRefresh() {
    setInterval(refreshDashboard, 30000);
}

function enableButtonEffects() {
    document.addEventListener("click", event => {
        const button = event.target.closest("button");
        if (!button) return;

        const ripple = document.createElement("span");
        Object.assign(ripple.style, {
            position: "absolute", pointerEvents: "none",
            width: "10px", height: "10px", borderRadius: "50%",
            background: "rgba(255,255,255,.25)",
            transform: "translate(-50%, -50%)",
            left: `${event.offsetX}px`, top: `${event.offsetY}px`,
            animation: "sakshamRipple .5s ease-out"
        });

        if (getComputedStyle(button).position === "static") {
            button.style.position = "relative";
        }
        button.style.overflow = "hidden";
        button.appendChild(ripple);
        setTimeout(() => ripple.remove(), 550);
    });

    const style = document.createElement("style");
    style.textContent = `
        @keyframes sakshamRipple {
            from { width:10px; height:10px; opacity:.7; }
            to { width:250px; height:250px; opacity:0; }
        }
    `;
    document.head.appendChild(style);
}

document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚡ Saksham Panel initializing...");
    initTelegram();
    enableButtonEffects();
    await loadDashboard();
    await loadShop();
    await loadActivity();
    startAutoRefresh();
    console.log("✅ Saksham Panel ready.");
});

window.openShop = openShop;
window.buyItem = buyItem;
window.showRank = showRank;
window.showRewards = showRewards;
window.claimReward = claimReward;
window.showReferral = showReferral;
window.copyReferral = copyReferral;
window.changePassword = changePassword;
window.submitPasswordChange = submitPasswordChange;
window.logout = logout;
window.closeModal = closeModal;
window.refreshDashboard = refreshDashboard;
