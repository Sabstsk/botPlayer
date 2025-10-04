const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// --- Configuration and Environment Setup ---
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const ADMIN_CHAT_ID = '7490634345'; // Admin chat ID

// API configuration
const API_BASE_URL = 'https://flipcartstore.serv00.net/INFO.php';
const API_KEY = process.env.API_KEY || 'chxInfo';

// Check for critical environment variables
if (!BOT_TOKEN) {
    console.error('FATAL ERROR: BOT_TOKEN is not set in environment variables.');
    process.exit(1);
}

// Initialize bot
const bot = new TelegramBot(BOT_TOKEN, {
    polling: process.env.NODE_ENV !== 'production' || !WEBHOOK_URL
});

const app = express();
app.use(express.json());

// --- User Database Management ---
const USERS_FILE = path.join(__dirname, 'users.json');

// Initialize users database
async function initializeUsersDB() {
    try {
        await fs.access(USERS_FILE);
    } catch (error) {
        // File doesn't exist, create it
        const initialData = {
            users: {},
            subscriptions: {}
        };
        await fs.writeFile(USERS_FILE, JSON.stringify(initialData, null, 2));
        console.log('Created users database file');
    }
}

// Load users data
async function loadUsersData() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading users data:', error);
        return { users: {}, subscriptions: {} };
    }
}

// Save users data
async function saveUsersData(data) {
    try {
        await fs.writeFile(USERS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving users data:', error);
    }
}

// Get or create user
async function getUser(chatId) {
    const data = await loadUsersData();
    const userId = chatId.toString();
    
    if (!data.users[userId]) {
        // New user - give 1 free search
        data.users[userId] = {
            chatId: userId,
            username: '',
            firstName: '',
            joinDate: new Date().toISOString(),
            freeSearchesUsed: 0,
            totalSearches: 0,
            isSubscribed: false,
            subscriptionExpiry: null
        };
        await saveUsersData(data);
        console.log(`New user registered: ${userId}`);
    }
    
    return data.users[userId];
}

// Update user data
async function updateUser(chatId, updates) {
    const data = await loadUsersData();
    const userId = chatId.toString();
    
    if (data.users[userId]) {
        Object.assign(data.users[userId], updates);
        await saveUsersData(data);
    }
}

// Check if user can search
async function canUserSearch(chatId) {
    const user = await getUser(chatId);
    
    // Check if user has active subscription
    if (user.isSubscribed && user.subscriptionExpiry) {
        const expiryDate = new Date(user.subscriptionExpiry);
        if (expiryDate > new Date()) {
            return { allowed: true, reason: 'subscribed' };
        } else {
            // Subscription expired
            await updateUser(chatId, { isSubscribed: false, subscriptionExpiry: null });
            user.isSubscribed = false;
        }
    }
    
    // Check free searches
    if (user.freeSearchesUsed < 1) {
        return { allowed: true, reason: 'free_trial' };
    }
    
    return { allowed: false, reason: 'limit_reached' };
}

// --- Utility Functions ---
function escapeHtmlEntities(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;');
}

function isValidMobileNumber(mobile) {
    const mobileRegex = /^[6-9]\d{9}$/;
    return mobileRegex.test(mobile);
}

// --- API Functions ---
async function fetchFlipcartInfo(mobile) {
    try {
        const response = await axios.get(API_BASE_URL, {
            params: { api_key: API_KEY, mobile },
            timeout: 15000
        });

        if (response.data && typeof response.data === 'string' && response.data.includes('not found')) {
            return { success: false, error: 'The API returned a "not found" response for this number.' };
        }

        if (response.status >= 200 && response.status < 300) {
            if (response.data && (response.data.error || response.data.status === 'error')) {
                const apiError = response.data.error || JSON.stringify(response.data);
                return { success: false, error: `API reported an issue: ${escapeHtmlEntities(apiError)}` };
            }
            return { success: true, data: response.data };
        } else {
            return { success: false, error: `HTTP Error: ${response.status} ${response.statusText}` };
        }
    } catch (error) {
        console.error('API Error:', error.message);
        const errorMessage = error.code === 'ECONNABORTED' ? 'Request timed out (15s).' : error.message;
        return { success: false, error: `Network/API failure: ${escapeHtmlEntities(errorMessage)}` };
    }
}

function formatResponse(data) {
    let allFormattedResponses = 'ℹ️ <b>Flipcart Information</b>\n';
    let itemsToProcess = Array.isArray(data) ? data : [data];
    let foundAnyData = false;

    itemsToProcess.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
            allFormattedResponses += `\n✨ <b>Result ${index + 1}</b> ✨\n`;
            let currentFormatted = '';
            let foundDataItem = false;

            for (const [key, value] of Object.entries(item)) {
                const stringValue = String(value);

                if (stringValue && stringValue.toLowerCase() !== 'not found' && stringValue.toLowerCase() !== '[not set]') {
                    let displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim();
                    let prefixEmoji = '';
                    let displayValue = escapeHtmlEntities(stringValue);

                    if (key.toLowerCase() === 'id_number') {
                        displayKey = 'Aadhaar No.';
                        prefixEmoji = '🆔';
                    } else if (key.toLowerCase() === 'name') {
                        prefixEmoji = '👤';
                    } else if (key.toLowerCase() === 'mobile' || key.toLowerCase() === 'alt_mobile') {
                        prefixEmoji = '📱';
                    } else if (key.toLowerCase() === 'circle') {
                        prefixEmoji = '📡';
                    } else if (key.toLowerCase() === 'address') {
                        prefixEmoji = '🏠';
                        displayValue = stringValue
                            .replace(/!!/g, ', ')
                            .replace(/!/g, ', ')
                            .replace(/,(\s*,){1,}/g, ', ')
                            .trim()
                            .replace(/^[,\s]+|[,\s]+$/g, '');
                        displayValue = escapeHtmlEntities(displayValue);
                    }
                    
                    if (!prefixEmoji) {
                        prefixEmoji = '➡️'; 
                    }
                    
                    currentFormatted += `${prefixEmoji} <b>${displayKey}:</b> <code>${displayValue}</code>\n`;
                    foundDataItem = true;
                }
            }

            if (foundDataItem) {
                allFormattedResponses += currentFormatted;
                foundAnyData = true;
            }
        }
    });

    if (!foundAnyData) {
        return '⚠️ <b>No details found</b> for this number or the information is incomplete।';
    }
    
    return allFormattedResponses.trim();
}

// --- Core Bot Logic ---
async function handleMobileNumber(chatId, mobile, userInfo = {}) {
    let loadingMsg;
    try {
        // Check if user can search
        const searchPermission = await canUserSearch(chatId);
        
        if (!searchPermission.allowed) {
            const subscriptionMsg = `🚫 <b>Search Limit Reached!</b>

You have used your free search. To continue using this bot, please purchase a subscription.

💰 <b>Subscription Plans:</b>
• Monthly: ₹99 (Unlimited searches)
• Yearly: ₹999 (Unlimited searches + Priority support)

📞 <b>Contact Admin to Purchase:</b>
👤 Admin: @admin_username
💬 Chat ID: <code>${ADMIN_CHAT_ID}</code>

<i>Send screenshot of payment to admin for instant activation!</i>`;

            return bot.sendMessage(chatId, subscriptionMsg, { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💬 Contact Admin', url: `tg://user?id=${ADMIN_CHAT_ID}` }],
                        [{ text: '📋 Check Subscription', callback_data: 'check_subscription' }]
                    ]
                }
            });
        }

        loadingMsg = await bot.sendMessage(chatId, '⏳ <b>Fetching information... Please wait.</b>', { parse_mode: 'HTML' });

        const result = await fetchFlipcartInfo(mobile);

        await bot.deleteMessage(chatId, loadingMsg.message_id).catch(e => console.error('Failed to delete message:', e.message));

        if (result.success) {
            // Update user search count
            const user = await getUser(chatId);
            const updates = { totalSearches: user.totalSearches + 1 };
            
            if (searchPermission.reason === 'free_trial') {
                updates.freeSearchesUsed = user.freeSearchesUsed + 1;
            }
            
            await updateUser(chatId, updates);

            const formattedResponse = formatResponse(result.data);
            
            // Add subscription reminder for free users
            let finalMessage = formattedResponse;
            if (searchPermission.reason === 'free_trial' && user.freeSearchesUsed === 0) {
                finalMessage += `\n\n🎉 <b>Free search used!</b> Contact admin for unlimited access: <code>${ADMIN_CHAT_ID}</code>`;
            }
            
            bot.sendMessage(chatId, finalMessage, { parse_mode: 'HTML' });
        } else {
            bot.sendMessage(chatId, `❌ <b>Error fetching information:</b><br>${result.error}<br><br>Please try again later or check the number.`, { parse_mode: 'HTML' });
        }
    } catch (error) {
        if (loadingMsg) {
            await bot.deleteMessage(chatId, loadingMsg.message_id).catch(e => console.error('Failed to delete message:', e.message));
        }
        bot.sendMessage(chatId, '🛑 <b>Critical Error!</b><br><br>Something unexpected went wrong.', { parse_mode: 'HTML' });
        console.error('Core Bot Logic Error:', error);
    }
}

// --- Bot Command Handlers ---
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await getUser(chatId);
    
    // Update user info
    await updateUser(chatId, {
        username: msg.from.username || '',
        firstName: msg.from.first_name || ''
    });
    
    const welcomeMessage = `🤖 <b>Welcome to Flipcart Info Bot!</b>

This bot helps you get information from the Flipcart store using mobile numbers.

🆓 <b>Free Trial:</b> ${user.freeSearchesUsed}/1 searches used
${user.isSubscribed ? '✅ <b>Subscribed</b> - Unlimited searches!' : ''}

<b>Commands:</b>
/start - Show this welcome message
/help - Show help information
/info &lt;mobile_number&gt; - Get Flipcart information
/subscription - Check your subscription status

<b>Example:</b>
<code>/info 9876543210</code>

You can also send a 10-digit number directly. 📱`;

    bot.sendMessage(chatId, welcomeMessage, { 
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '💰 Get Subscription', callback_data: 'get_subscription' }],
                [{ text: '📞 Contact Admin', url: `tg://user?id=${ADMIN_CHAT_ID}` }]
            ]
        }
    });
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `📋 <b>Help - How to use this bot:</b>

<b>1. Get Information:</b>
Send: <code>/info 9876543210</code>
Or just: <code>9876543210</code>

<b>2. Mobile Number Format:</b>
- Must be exactly <b>10 digits</b>
- Should start with <b>6, 7, 8, or 9</b>
- Example: <code>9876543210</code>

<b>3. Subscription:</b>
- New users get <b>1 free search</b>
- Purchase subscription for unlimited access
- Contact admin: <code>${ADMIN_CHAT_ID}</code>

<b>4. Commands:</b>
/start - Welcome message
/help - This help message
/info &lt;number&gt; - Get info for that number
/subscription - Check subscription status

<i>API URL: <code>${escapeHtmlEntities(API_BASE_URL)}</code></i>`;

    bot.sendMessage(chatId, helpMessage, { parse_mode: 'HTML' });
});

bot.onText(/\/subscription/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await getUser(chatId);
    
    let statusMessage = `📊 <b>Your Subscription Status</b>\n\n`;
    statusMessage += `👤 <b>User ID:</b> <code>${chatId}</code>\n`;
    statusMessage += `🆓 <b>Free Searches:</b> ${user.freeSearchesUsed}/1 used\n`;
    statusMessage += `📈 <b>Total Searches:</b> ${user.totalSearches}\n`;
    statusMessage += `📅 <b>Join Date:</b> ${new Date(user.joinDate).toLocaleDateString()}\n\n`;
    
    if (user.isSubscribed) {
        const expiryDate = new Date(user.subscriptionExpiry);
        statusMessage += `✅ <b>Status:</b> Active Subscriber\n`;
        statusMessage += `⏰ <b>Expires:</b> ${expiryDate.toLocaleDateString()}\n`;
        statusMessage += `🔥 <b>Searches:</b> Unlimited`;
    } else {
        statusMessage += `❌ <b>Status:</b> Free User\n`;
        statusMessage += `💰 <b>Upgrade:</b> Contact admin for subscription`;
    }
    
    bot.sendMessage(chatId, statusMessage, { 
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '💰 Get Subscription', callback_data: 'get_subscription' }],
                [{ text: '📞 Contact Admin', url: `tg://user?id=${ADMIN_CHAT_ID}` }]
            ]
        }
    });
});

// Admin commands
bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id.toString();
    
    if (chatId !== ADMIN_CHAT_ID) {
        return bot.sendMessage(chatId, '❌ Unauthorized access!');
    }
    
    const data = await loadUsersData();
    const totalUsers = Object.keys(data.users).length;
    const subscribedUsers = Object.values(data.users).filter(u => u.isSubscribed).length;
    
    const adminMessage = `👑 <b>Admin Panel</b>

📊 <b>Statistics:</b>
• Total Users: ${totalUsers}
• Subscribed Users: ${subscribedUsers}
• Free Users: ${totalUsers - subscribedUsers}

<b>Commands:</b>
/adduser &lt;user_id&gt; &lt;days&gt; - Add subscription
/removeuser &lt;user_id&gt; - Remove subscription
/userinfo &lt;user_id&gt; - Get user info (or /usrinfo)
/broadcast &lt;message&gt; - Send message to all users

<b>Examples:</b>
<code>/adduser 123456789 30</code>
<code>/usrinfo 123456789</code>
<code>/broadcast Happy New Year! 🎉</code>`;

    bot.sendMessage(chatId, adminMessage, { parse_mode: 'HTML' });
});

bot.onText(/\/adduser (\d+) (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    
    if (chatId !== ADMIN_CHAT_ID) {
        return bot.sendMessage(chatId, '❌ Unauthorized access!');
    }
    
    const userId = match[1];
    const days = parseInt(match[2]);
    
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    
    await updateUser(userId, {
        isSubscribed: true,
        subscriptionExpiry: expiryDate.toISOString()
    });
    
    bot.sendMessage(chatId, `✅ Added ${days} days subscription for user ${userId}`);
    
    // Notify user
    try {
        bot.sendMessage(userId, `🎉 <b>Subscription Activated!</b>\n\nYou now have unlimited searches until ${expiryDate.toLocaleDateString()}.\n\nThank you for subscribing! 🙏`, { parse_mode: 'HTML' });
    } catch (error) {
        console.error('Failed to notify user:', error);
    }
});

bot.onText(/\/removeuser (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    
    if (chatId !== ADMIN_CHAT_ID) {
        return bot.sendMessage(chatId, '❌ Unauthorized access!');
    }
    
    const userId = match[1];
    
    await updateUser(userId, {
        isSubscribed: false,
        subscriptionExpiry: null
    });
    
    bot.sendMessage(chatId, `✅ Removed subscription for user ${userId}`);
});

// Support both /userinfo and /usrinfo
bot.onText(/\/(userinfo|usrinfo) (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    
    if (chatId !== ADMIN_CHAT_ID) {
        return bot.sendMessage(chatId, '❌ Unauthorized access!');
    }
    
    const userId = match[2];
    const user = await getUser(userId);
    
    const userInfo = `👤 <b>User Information</b>

<b>User ID:</b> <code>${userId}</code>
<b>Username:</b> ${user.username || 'N/A'}
<b>First Name:</b> ${user.firstName || 'N/A'}
<b>Join Date:</b> ${new Date(user.joinDate).toLocaleDateString()}
<b>Free Searches Used:</b> ${user.freeSearchesUsed}/1
<b>Total Searches:</b> ${user.totalSearches}
<b>Subscribed:</b> ${user.isSubscribed ? '✅ Yes' : '❌ No'}
<b>Subscription Expiry:</b> ${user.subscriptionExpiry ? new Date(user.subscriptionExpiry).toLocaleDateString() : 'N/A'}`;

    bot.sendMessage(chatId, userInfo, { parse_mode: 'HTML' });
});

// Broadcast message to all users
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    
    if (chatId !== ADMIN_CHAT_ID) {
        return bot.sendMessage(chatId, '❌ Unauthorized access!');
    }
    
    const message = match[1];
    const data = await loadUsersData();
    const userIds = Object.keys(data.users);
    
    let successCount = 0;
    let failCount = 0;
    
    bot.sendMessage(chatId, `📢 <b>Broadcasting message to ${userIds.length} users...</b>`, { parse_mode: 'HTML' });
    
    for (const userId of userIds) {
        try {
            await bot.sendMessage(userId, `📢 <b>Admin Message:</b>\n\n${message}`, { parse_mode: 'HTML' });
            successCount++;
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            failCount++;
            console.error(`Failed to send message to ${userId}:`, error.message);
        }
    }
    
    const resultMessage = `✅ <b>Broadcast Complete!</b>

📊 <b>Results:</b>
• Successfully sent: ${successCount}
• Failed to send: ${failCount}
• Total users: ${userIds.length}

${failCount > 0 ? '<i>Some users may have blocked the bot or deleted their account.</i>' : ''}`;

    bot.sendMessage(chatId, resultMessage, { parse_mode: 'HTML' });
});

// Handle /info command
bot.onText(/\/info (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const mobile = match[1].replace(/\D/g, '').trim();

    if (!isValidMobileNumber(mobile)) {
        return bot.sendMessage(chatId, 
            "❌ <b>Invalid mobile number format!</b>\n\nPlease enter a 10-digit mobile number starting with 6-9.\n\n<b>Example:</b> <code>/info 9876543210</code>", 
            { parse_mode: "HTML" }
        );
    }

    await handleMobileNumber(chatId, mobile, msg.from);
});

// Handle direct mobile input
bot.onText(/^([6-9]\d{9})$/, async (msg, match) => {
    const mobile = match[1];
    await handleMobileNumber(msg.chat.id, mobile, msg.from);
});

// Handle callback queries
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    
    if (data === 'get_subscription') {
        const subscriptionMsg = `💰 <b>Subscription Plans</b>

🔥 <b>Monthly Plan - ₹99</b>
• Unlimited searches
• 30 days validity
• Fast support

⭐ <b>Yearly Plan - ₹999</b>
• Unlimited searches  
• 365 days validity
• Priority support
• Save ₹189!

📞 <b>How to Purchase:</b>
1. Contact admin: <code>${ADMIN_CHAT_ID}</code>
2. Send payment screenshot
3. Get instant activation!

💳 <b>Payment Methods:</b>
• UPI, PhonePe, GPay
• Bank Transfer
• Paytm`;

        bot.editMessageText(subscriptionMsg, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📞 Contact Admin', url: `tg://user?id=${ADMIN_CHAT_ID}` }],
                    [{ text: '🔙 Back', callback_data: 'back_to_start' }]
                ]
            }
        });
    } else if (data === 'check_subscription') {
        const user = await getUser(chatId);
        let statusMsg = `📊 <b>Subscription Status</b>\n\n`;
        
        if (user.isSubscribed) {
            statusMsg += `✅ <b>Active Subscription</b>\nExpires: ${new Date(user.subscriptionExpiry).toLocaleDateString()}`;
        } else {
            statusMsg += `❌ <b>No Active Subscription</b>\nFree searches: ${user.freeSearchesUsed}/1 used`;
        }
        
        bot.editMessageText(statusMsg, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💰 Get Subscription', callback_data: 'get_subscription' }],
                    [{ text: '🔙 Back', callback_data: 'back_to_start' }]
                ]
            }
        });
    }
    
    bot.answerCallbackQuery(callbackQuery.id);
});

// Handle unknown input
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;
    if (text.startsWith('/') || isValidMobileNumber(text.trim().replace(/\D/g, ''))) return;

    bot.sendMessage(chatId, '❓ <b>Unknown command or invalid input</b>\n\nUse /help to see available commands or send a valid 10-digit number.', { parse_mode: 'HTML' });
});

// --- Express Server Setup ---
app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

app.get('/', (req, res) => {
    res.json({
        status: 'Bot is running!',
        timestamp: new Date().toISOString(),
        bot_name: 'Flipcart Info Bot with Subscription',
        api_base_url: API_BASE_URL,
        admin_id: ADMIN_CHAT_ID
    });
});

// --- Server Initialization ---
(async () => {
    await initializeUsersDB();
    
    if (process.env.NODE_ENV === 'production' && WEBHOOK_URL) {
        try {
            await bot.setWebHook(`${WEBHOOK_URL}/webhook/${BOT_TOKEN}`);
            console.log(`Webhook set to ${WEBHOOK_URL}/webhook/${BOT_TOKEN}`);
        } catch (error) {
            console.error('Failed to set webhook:', error.message);
        }
    } else {
        console.log('Bot started with polling for development/testing.');
    }

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        console.log(`Admin Chat ID: ${ADMIN_CHAT_ID}`);
    });
})();

// --- Global Error Handling ---
process.on('unhandledRejection', (reason) => {
    console.error('🚨 Unhandled Promise Rejection:', reason.stack || reason);
});

process.on('uncaughtException', (error) => {
    console.error('💣 Uncaught Exception:', error.stack || error);
    process.exit(1);
});
