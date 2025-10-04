// Simple keep-alive endpoint (no cron needed)
module.exports = async (req, res) => {
    res.status(200).json({ 
        status: 'Keep-alive endpoint active',
        timestamp: new Date().toISOString(),
        message: 'Use external service like UptimeRobot to ping this URL every 5 minutes'
    });
};
