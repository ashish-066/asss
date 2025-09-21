// Twilio Configuration
// Replace these with your actual Twilio credentials

const TWILIO_CONFIG = {
  // Get these from your Twilio Console: https://console.twilio.com/
  accountSid: 'YOUR_TWILIO_ACCOUNT_SID',     // Found in Account Info
  authToken: 'YOUR_TWILIO_AUTH_TOKEN',        // Found in Account Info
  fromNumber: 'YOUR_TWILIO_PHONE_NUMBER',     // Your Twilio phone number (e.g., +1234567890)
  
  // Optional: Customize the SMS message
  messageTemplate: `🔐 SAFETY ALERT 🔐

Hi {volunteerName},

Someone is requesting access to a blocked website:
🌐 {url}

OTP Code: {otp}
⏰ Valid for 5 minutes

Please share this code if you approve the access.

Stay safe! 🛡️`
};

// Instructions for setup:
/*
1. Sign up for Twilio: https://www.twilio.com/try-twilio
2. Get a phone number: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming
3. Get your credentials: https://console.twilio.com/us1/account/settings
4. Replace the values above with your actual credentials
5. Test with a small amount first (Twilio gives free credits)
*/

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TWILIO_CONFIG;
}

