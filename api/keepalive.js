// Keep-alive function to prevent cold starts
const https = require('https');

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://bot-player-five.vercel.app';

function pingServer() {
    const url = `${WEBHOOK_URL}/api/`;
    
    https.get(url, (res) => {
        console.log(`Keep-alive ping: ${res.statusCode}`);
    }).on('error', (err) => {
        console.error('Keep-alive error:', err.message);
    });
}

// Ping every 5 minutes to keep function warm
setInterval(pingServer, 5 * 60 * 1000);

// Export for Vercel
module.exports = async (req, res) => {
    res.status(200).json({ 
        status: 'Keep-alive service running',
        timestamp: new Date().toISOString(),
        next_ping: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    });
};
