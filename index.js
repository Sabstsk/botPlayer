const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
require('dotenv').config();

// --- Configuration and Environment Setup ---
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

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
    // We stick to polling for local dev/testing
    polling: process.env.NODE_ENV !== 'production' || !WEBHOOK_URL
});

const app = express();
app.use(express.json());

// --- Utility Functions ---

/**
 * Escapes HTML characters (&, <, >) in string data to prevent breaking the HTML parsing mode.
 * This is especially important for data coming from external APIs.
 * @param {string} text - The text to escape.
 * @returns {string}
 */
function escapeHtmlEntities(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;');
}

/**
 * Validates a 10-digit Indian mobile number.
 */
function isValidMobileNumber(mobile) {
    const mobileRegex = /^[6-9]\d{9}$/;
    return mobileRegex.test(mobile);
}

/**
 * Fetches data from the external API.
 */
async function fetchFlipcartInfo(mobile) {
    try {
        const response = await axios.get(API_BASE_URL, {
            params: { api_key: API_KEY, mobile },
            timeout: 15000
        });

        // The API returns non-JSON data, so we check for common error strings
        if (response.data && typeof response.data === 'string' && response.data.includes('not found')) {
            return { success: false, error: 'The API returned a "not found" response for this number.' };
        }

        if (response.status >= 200 && response.status < 300) {
            // If the API returns JSON data with an error field
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

/**
 * Formats API response for Telegram using HTML mode.
 */
function formatResponse(data) {
    let allFormattedResponses = 'ℹ️ <b>Flipcart Information</b>\n';
    let itemsToProcess = Array.isArray(data) ? data : [data];

    let foundAnyData = false;

    // Process each item (object) in the array
    itemsToProcess.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
            
            // Add a clear header for each result
            allFormattedResponses += `\n✨ <b>Result ${index + 1}</b> ✨\n`;
            
            let currentFormatted = '';
            let foundDataItem = false;

            for (const [key, value] of Object.entries(item)) {
                const stringValue = String(value);

                // Filter out empty or "not found" values
                if (stringValue && stringValue.toLowerCase() !== 'not found' && stringValue.toLowerCase() !== '[not set]') {
                    
                    let displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim();
                    let prefixEmoji = '';
                    let displayValue = escapeHtmlEntities(stringValue);

                    // --- Custom Formatting and Replacement ---
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
                        // Clean up the address string: replace !! and ! with ', ' and clean trailing/leading separators
                        displayValue = stringValue
                            .replace(/!!/g, ', ')
                            .replace(/!/g, ', ')
                            .replace(/,(\s*,){1,}/g, ', ') // Remove repeated commas
                            .trim()
                            .replace(/^[,\s]+|[,\s]+$/g, ''); // Remove starting/ending commas/spaces
                        displayValue = escapeHtmlEntities(displayValue);
                    }
                    
                    // Add a default emoji if none was set and format the line
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

// --- Core Bot Logic Function ---
async function handleMobileNumber(chatId, mobile) {
    let loadingMsg;
    try {
        // Use HTML for formatting
        loadingMsg = await bot.sendMessage(chatId, '⏳ <b>Fetching information... Please wait.</b>', { parse_mode: 'HTML' });

        const result = await fetchFlipcartInfo(mobile);

        await bot.deleteMessage(chatId, loadingMsg.message_id).catch(e => console.error('Failed to delete message:', e.message));

        if (result.success) {
            const formattedResponse = formatResponse(result.data);
            bot.sendMessage(chatId, formattedResponse, { parse_mode: 'HTML' });
        } else {
            // Error content is already HTML-escaped in fetchFlipcartInfo
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


// --- Bot Command Handlers (All using HTML) ---

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMessage = `
🤖 <b>Welcome to Flipcart Info Bot!</b>

This bot helps you get information from the Flipcart store using a mobile number.

<b>Commands:</b>
/start - Show this welcome message
/help - Show help information
/info &lt;mobile_number&gt; - Get Flipcart information

<b>Example:</b>
<code>/info 9876543210</code>

You can also send a 10-digit number directly. 📱`;

    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'HTML' });
});

// --/direct fetch number info --

// Handle direct mobile input


// --- /help Command ---
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
📋 <b>Help - How to use this bot:</b>

<b>1. Get Information:</b>
Send: <code>/info 9876543210</code>
Or just: <code>9876543210</code>

<b>2. Mobile Number Format:</b>
- Must be exactly <b>10 digits</b>
- Should start with <b>6, 7, 8, or 9</b>
- Example: <code>9876543210</code>

<b>3. Commands:</b>
/start - Welcome message
/help - This help message
/info &lt;number&gt; - Get info for that number

<i>API URL: <code>${escapeHtmlEntities(API_BASE_URL)}</code></i>
`;

    bot.sendMessage(chatId, helpMessage, { parse_mode: 'HTML' });
});



// --- /info Command (Fixed to call API) ---
bot.onText(/\/info (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const mobile = match[1].replace(/\D/g, '').trim(); // Sanitize input

    // Validate mobile number
    if (!isValidMobileNumber(mobile)) {
        return bot.sendMessage(chatId, 
            "❌ <b>Invalid mobile number format!</b>\n\nPlease enter a 10-digit mobile number starting with 6-9.\n\n<b>Example:</b> <code>/info 9876543210</code>", 
            { parse_mode: "HTML" }
        );
    }

    // CRITICAL FIX: Call the API fetching logic
    await handleMobileNumber(chatId, mobile);
});


// Handle direct mobile input
bot.onText(/^([6-9]\d{9})$/, async (msg, match) => {
    const mobile = match[1];
    await handleMobileNumber(msg.chat.id, mobile);
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
        bot_name: 'Flipcart Info Bot',
        api_base_url: API_BASE_URL
    });
});

// --- Server Initialization ---
(async () => {
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