# 🚀 Vercel Deployment Checklist

## ✅ Pre-Deployment Checklist

### 1. Files Ready:
- [x] `index_subscription.js` - Main bot file
- [x] `package.json` - Updated to use subscription bot
- [x] `vercel.json` - Vercel configuration
- [x] `.env.example` - Environment template
- [x] `users.json` - User database (will be created automatically)
- [x] `README.md` - Complete documentation

### 2. Environment Variables Required:
- [ ] `BOT_TOKEN` - Your Telegram bot token from @BotFather
- [ ] `WEBHOOK_URL` - Your Vercel app URL (e.g., https://your-app.vercel.app)
- [ ] `API_KEY` - Set to `chxInfo`
- [ ] `NODE_ENV` - Set to `production`

## 🛠️ Deployment Steps

### Step 1: Get Bot Token
1. Open Telegram → Search `@BotFather`
2. Send `/newbot`
3. Follow instructions
4. Copy the bot token (format: `1234567890:ABCdefGHI...`)

### Step 2: Deploy to Vercel

**Option A: GitHub (Recommended)**
1. Create GitHub repository
2. Upload all files to repository
3. Go to [vercel.com](https://vercel.com)
4. Connect GitHub account
5. Import your repository
6. Add environment variables
7. Deploy

**Option B: Direct Upload**
1. Zip your `telebot` folder
2. Go to [vercel.com](https://vercel.com) → New Project
3. Upload zip file
4. Add environment variables
5. Deploy

### Step 3: Configure Environment Variables

In Vercel Dashboard → Project → Settings → Environment Variables:

```
BOT_TOKEN = your_bot_token_from_botfather
WEBHOOK_URL = https://your-vercel-app.vercel.app
API_KEY = chxInfo
NODE_ENV = production
```

### Step 4: Test Deployment

1. Visit your Vercel app URL
2. Should see: `{"status":"Bot is running!","timestamp":"...","bot_name":"Flipcart Info Bot with Subscription"}`
3. Test bot in Telegram with `/start`

## 🎯 Post-Deployment Testing

### Test User Flow:
1. Send `/start` to bot → Should show welcome with free trial info
2. Send a mobile number → Should work (uses free search)
3. Send another number → Should ask for subscription
4. Test admin commands from Chat ID `7490634345`

### Test Admin Commands:
```bash
/admin                    # Should show admin panel
/usrinfo 7348257644      # Should show user info
/broadcast Test message   # Should send to all users
```

## 🔧 Troubleshooting

### If bot doesn't respond:
1. Check Vercel function logs
2. Verify BOT_TOKEN is correct
3. Ensure WEBHOOK_URL matches your Vercel URL
4. Check if webhook is set: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

### If admin commands don't work:
1. Verify your Chat ID is exactly `7490634345`
2. Commands are case-sensitive
3. Check console logs for errors

## 📊 Success Indicators

✅ **Deployment Successful When:**
- Vercel app URL shows bot status
- Bot responds to `/start` command
- Free search works for new users
- Subscription prompt appears after free search
- Admin commands work from correct Chat ID
- User database (`users.json`) is created automatically

## 💰 Business Ready Features

✅ **Your bot includes:**
- 1 free search per user
- Subscription system (₹99/month, ₹999/year)
- Admin panel for user management
- Broadcast messaging
- User analytics
- Automated subscription expiry
- Direct admin contact integration

## 🎉 You're Ready!

Your Flipcart Telegram Bot with subscription system is ready for Vercel deployment!

**Next Steps:**
1. Deploy to Vercel
2. Test all functionality
3. Start promoting your bot
4. Manage subscriptions via admin panel
5. Start earning! 💰
