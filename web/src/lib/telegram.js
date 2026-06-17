const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function sendTelegramAlert({
  deviceId,
  deviceName,
  location,
  faultCategory,
  measuredValue,
  thresholdValue,
  unit,
  timestamp,
  isResolution = false,
  relayTripped = false,
}) {
  if (!BOT_TOKEN || !CHAT_ID || CHAT_ID === 'YOUR_TELEGRAM_CHAT_ID') {
    console.warn('[Telegram Alert] Skipping. Bot Token or Chat ID not configured.');
    return false;
  }

  const formattedTime = new Date(timestamp).toLocaleString();
  const alertHeader = isResolution
    ? '✅ <b>VOLTGUARD FAULT RESOLVED</b> ✅'
    : '⚠️ <b>VOLTGUARD CRITICAL ALARM</b> ⚠️';

  let message = `${alertHeader}\n\n`;
  message += `<b>Device ID:</b> <code>${deviceId}</code>\n`;
  message += `<b>Device Name:</b> ${deviceName}\n`;
  message += `<b>Location:</b> ${location}\n\n`;
  
  if (isResolution) {
    message += `<b>Fault Category:</b> ${faultCategory} (CLEARED)\n`;
    message += `<b>Current Value:</b> ${measuredValue} ${unit}\n`;
    message += `<b>Threshold Limit:</b> ${thresholdValue} ${unit}\n`;
    message += `<b>Resolution Time:</b> ${formattedTime}\n`;
    message += `<b>Status:</b> Relay Restored 🟢\n`;
  } else {
    message += `<b>Fault Category:</b> ${faultCategory}\n`;
    message += `<b>Measured Value:</b> <span class="tg-spoiler">${measuredValue}</span> ${unit}\n`;
    message += `<b>Threshold Limit:</b> ${thresholdValue} ${unit}\n`;
    message += `<b>Event Time:</b> ${formattedTime}\n`;
    message += `<b>Status:</b> ${relayTripped ? '🛑 PROTECTION RELAY TRIPPED' : '⚠️ Warning Active'}\n`;
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    
    const data = await response.json();
    if (!response.ok) {
      console.error('[Telegram API Error]', data);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Telegram Send Exception]', error);
    return false;
  }
}
